-- ParkEasy | Migracion inicial PostgreSQL / Supabase
-- Ejecutar UNA VEZ en SQL Editor sobre proyecto nuevo.
-- No reemplaza auth.users; Supabase Auth administra contrasenas.

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;
grant usage on schema private to authenticated;

create type public.app_role as enum ('user', 'operator', 'admin');
create type public.space_status as enum ('available', 'occupied', 'maintenance');
create type public.parking_session_status as enum ('active', 'completed');
create type public.reminder_status as enum ('pending', 'cancelled', 'sent');

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null default '' check (char_length(full_name) <= 120),
  phone text check (phone is null or char_length(phone) <= 25),
  avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.user_roles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  role public.app_role not null default 'user',
  assigned_at timestamptz not null default now()
);

create table public.parking_locations (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(btrim(name)) between 1 and 120),
  address text not null default '',
  description text,
  latitude double precision check (latitude is null or latitude between -90 and 90),
  longitude double precision check (longitude is null or longitude between -180 and 180),
  is_active boolean not null default true,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint coordinates_together check ((latitude is null) = (longitude is null))
);

create table public.parking_spaces (
  id uuid primary key default gen_random_uuid(),
  location_id uuid not null references public.parking_locations(id) on delete cascade,
  code text not null check (char_length(btrim(code)) between 1 and 30),
  floor_label text,
  description text,
  status public.space_status not null default 'available',
  is_active boolean not null default true,
  status_updated_at timestamptz not null default now(),
  status_updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(location_id, code),
  unique(id, location_id)
);

create table public.parking_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  location_id uuid references public.parking_locations(id) on delete set null,
  space_id uuid,
  latitude double precision not null check (latitude between -90 and 90),
  longitude double precision not null check (longitude between -180 and 180),
  accuracy_m double precision check (accuracy_m is null or accuracy_m >= 0),
  note text check (note is null or char_length(note) <= 1000),
  status public.parking_session_status not null default 'active',
  parked_at timestamptz not null default now(),
  ended_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint session_dates_valid check (
    (status = 'active' and ended_at is null)
    or (status = 'completed' and ended_at is not null and ended_at >= parked_at)
  ),
  constraint session_space_location check (
    space_id is null or location_id is not null
  ),
  constraint session_space_fk foreign key(space_id, location_id)
    references public.parking_spaces(id, location_id) on delete no action
);

-- Limita un estacionamiento activo por usuario.
create unique index one_active_session_per_user
on public.parking_sessions(user_id) where status = 'active';

create table public.parking_reminders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  session_id uuid not null references public.parking_sessions(id) on delete cascade,
  title text not null check (char_length(btrim(title)) between 1 and 120),
  message text,
  remind_at timestamptz not null,
  status public.reminder_status not null default 'pending',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_spaces_location_status on public.parking_spaces(location_id, status);
create index idx_sessions_user_date on public.parking_sessions(user_id, parked_at desc);
create index idx_reminders_user_date on public.parking_reminders(user_id, remind_at);
create index idx_locations_active on public.parking_locations(is_active);

create function private.is_staff()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.user_roles
    where user_id = (select auth.uid()) and role in ('operator', 'admin')
  );
$$;
create function private.is_admin()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.user_roles
    where user_id = (select auth.uid()) and role = 'admin'
  );
$$;
revoke all on function private.is_staff() from public, anon;
revoke all on function private.is_admin() from public, anon;
grant execute on function private.is_staff() to authenticated;
grant execute on function private.is_admin() to authenticated;

create function private.set_updated_at()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create function private.create_user_profile()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles(id, full_name)
  values (new.id, left(coalesce(new.raw_user_meta_data ->> 'full_name',''), 120));
  insert into public.user_roles(user_id, role) values (new.id, 'user');
  return new;
end;
$$;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function private.create_user_profile();

create function private.guard_space_update()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if not private.is_admin() then
    if row(old.location_id, old.code, old.floor_label, old.description, old.is_active)
       is distinct from row(new.location_id, new.code, new.floor_label, new.description, new.is_active) then
      raise exception 'Solo los administradores modifican los datos de espacios';
    end if;
  end if;
  if new.status is distinct from old.status then
    new.status_updated_at = now();
    new.status_updated_by = auth.uid();
  else
    new.status_updated_at = old.status_updated_at;
    new.status_updated_by = old.status_updated_by;
  end if;
  return new;
end;
$$;

create function private.validate_reminder_owner()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if not exists (
    select 1 from public.parking_sessions s
    where s.id = new.session_id and s.user_id = new.user_id
  ) then
    raise exception 'El recordatorio debe pertenecer al propietario de la sesion';
  end if;
  return new;
end;
$$;

create function private.guard_session_owner()
returns trigger language plpgsql set search_path = '' as $$
begin
  if new.user_id is distinct from old.user_id then
    raise exception 'No se puede transferir un estacionamiento a otro usuario';
  end if;
  return new;
end;
$$;

create trigger trg_profiles_updated before update on public.profiles
for each row execute function private.set_updated_at();
create trigger trg_locations_updated before update on public.parking_locations
for each row execute function private.set_updated_at();
create trigger trg_spaces_updated before update on public.parking_spaces
for each row execute function private.set_updated_at();
create trigger trg_spaces_guard before update on public.parking_spaces
for each row execute function private.guard_space_update();
create trigger trg_sessions_updated before update on public.parking_sessions
for each row execute function private.set_updated_at();
create trigger trg_sessions_owner before update on public.parking_sessions
for each row execute function private.guard_session_owner();
create trigger trg_reminders_updated before update on public.parking_reminders
for each row execute function private.set_updated_at();
create trigger trg_reminders_owner before insert or update on public.parking_reminders
for each row execute function private.validate_reminder_owner();

alter table public.profiles enable row level security;
alter table public.user_roles enable row level security;
alter table public.parking_locations enable row level security;
alter table public.parking_spaces enable row level security;
alter table public.parking_sessions enable row level security;
alter table public.parking_reminders enable row level security;

revoke all on public.profiles, public.user_roles, public.parking_locations,
  public.parking_spaces, public.parking_sessions, public.parking_reminders
  from anon, authenticated;
grant usage on schema public to authenticated;
grant select, update(full_name, phone, avatar_url) on public.profiles to authenticated;
grant select on public.user_roles to authenticated;
grant select, insert, update, delete on public.parking_locations to authenticated;
grant select, insert, update, delete on public.parking_spaces to authenticated;
grant select, insert, update, delete on public.parking_sessions to authenticated;
grant select, insert, update, delete on public.parking_reminders to authenticated;

create policy profiles_select_own on public.profiles for select to authenticated
using ((select auth.uid()) = id);
create policy profiles_update_own on public.profiles for update to authenticated
using ((select auth.uid()) = id) with check ((select auth.uid()) = id);
create policy user_roles_read_own on public.user_roles for select to authenticated
using ((select auth.uid()) = user_id);

create policy locations_read on public.parking_locations for select to authenticated
using (is_active or (select private.is_staff()));
create policy locations_insert_admin on public.parking_locations for insert to authenticated
with check ((select private.is_admin()) and created_by = (select auth.uid()));
create policy locations_update_admin on public.parking_locations for update to authenticated
using ((select private.is_admin())) with check ((select private.is_admin()));
create policy locations_delete_admin on public.parking_locations for delete to authenticated
using ((select private.is_admin()));

create policy spaces_read on public.parking_spaces for select to authenticated
using (
  (is_active and exists (select 1 from public.parking_locations l
    where l.id = location_id and l.is_active))
  or (select private.is_staff())
);
create policy spaces_insert_admin on public.parking_spaces for insert to authenticated
with check ((select private.is_admin()));
create policy spaces_update_staff on public.parking_spaces for update to authenticated
using ((select private.is_staff())) with check ((select private.is_staff()));
create policy spaces_delete_admin on public.parking_spaces for delete to authenticated
using ((select private.is_admin()));

create policy sessions_select_own on public.parking_sessions for select to authenticated
using ((select auth.uid()) = user_id);
create policy sessions_insert_own on public.parking_sessions for insert to authenticated
with check ((select auth.uid()) = user_id);
create policy sessions_update_own on public.parking_sessions for update to authenticated
using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy sessions_delete_own on public.parking_sessions for delete to authenticated
using ((select auth.uid()) = user_id);

create policy reminders_select_own on public.parking_reminders for select to authenticated
using ((select auth.uid()) = user_id);
create policy reminders_insert_own on public.parking_reminders for insert to authenticated
with check ((select auth.uid()) = user_id);
create policy reminders_update_own on public.parking_reminders for update to authenticated
using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy reminders_delete_own on public.parking_reminders for delete to authenticated
using ((select auth.uid()) = user_id);

-- IMPORTANTE: asignar administradores unicamente desde el SQL Editor / backend privilegiado:
-- update public.user_roles set role = 'admin' where user_id = 'UUID_DE_UN_USUARIO_EXISTENTE';
-- update public.user_roles set role = 'operator' where user_id = 'UUID_DE_UN_USUARIO_EXISTENTE';
-- Nunca ejecutar estas sentencias desde la aplicacion ni distribuir service_role.
