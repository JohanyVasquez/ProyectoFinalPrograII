# Base de datos — ParkEasy

Espejo de `supabase/migrations/001_initial_schema.sql`. Si este documento y el
SQL discrepan, **el SQL manda**.

## 1. ER conceptual

```text
auth.users (gestionada por Supabase)
    │
    │ 1:1 (trigger private.create_user_profile)
    ├──< public.profiles
    │
    │ 1:1 (mismo trigger)
    └──< public.user_roles

public.parking_locations
    │
    │ 1:N
    ├──< public.parking_spaces
    │
    │ 1:N (opcional)
    └──< public.parking_sessions >──── N:1 (FK compuesta, opcional) ── parking_spaces
                                          │
                                          │ 1:N
                                          └──< public.parking_reminders
```

Relaciones:

| FK | On delete |
| --- | --- |
| `profiles.id` → `auth.users.id` | CASCADE |
| `user_roles.user_id` → `auth.users.id` | CASCADE |
| `parking_spaces.location_id` → `parking_locations.id` | CASCADE |
| `parking_locations.created_by` → `auth.users.id` | SET NULL |
| `parking_spaces.status_updated_by` → `auth.users.id` | SET NULL |
| `parking_sessions.user_id` → `auth.users.id` | CASCADE |
| `parking_sessions.location_id` → `parking_locations.id` | SET NULL |
| `parking_sessions(space_id, location_id)` → `parking_spaces(id, location_id)` | **NO ACTION** |
| `parking_reminders.session_id` → `parking_sessions.id` | CASCADE |
| `parking_reminders.user_id` → `auth.users.id` | CASCADE |

### La FK compuesta, explicada

```sql
constraint session_space_location check (space_id is null or location_id is not null)
constraint session_space_fk foreign key(space_id, location_id)
  references public.parking_spaces(id, location_id) on delete no action
```

Para que una FK compuesta sea posible, `parking_spaces` declara además
`unique(id, location_id)`.

Consecuencias:

1. Si usas `space_id`, `location_id` es **obligatorio**.
2. `location_id` tiene que ser **la ubicación real de ese espacio**. La BD lo
   comprueba; no es una convención.
3. **Borrar un espacio con sesiones referenciadas falla** (23503). Por eso
   `deactivateSpace` es la operación recomendada y `deleteSpace` sólo para un
   flujo administrativo explícito.

## 2. Tablas

### `public.profiles`

| Columna | Tipo | Restricción |
| --- | --- | --- |
| `id` | `uuid` | PK, FK `auth.users.id` |
| `full_name` | `text` | `not null default ''`, CHECK `char_length <= 120` |
| `phone` | `text` | nullable, CHECK `char_length <= 25` |
| `avatar_url` | `text` | nullable |
| `created_at` | `timestamptz` | `not null default now()` |
| `updated_at` | `timestamptz` | `not null default now()`, trigger |

Ojo al `default ''`: la columna permite cadena vacía. El servicio
`profile.service.ts` la rechaza en cliente con un mensaje claro, pero el CHECK
de la BD no lo hace.

La fila la crea `private.create_user_profile` al insertar en `auth.users`, con
`full_name = left(coalesce(raw_user_meta_data ->> 'full_name', ''), 120)`. Si el
alta no manda `full_name`, el perfil nace con `''`.

**No hay contraseñas aquí.** La contraseña sólo existe en `auth.users`.

### `public.user_roles`

| Columna | Tipo | Restricción |
| --- | --- | --- |
| `user_id` | `uuid` | PK, FK `auth.users.id` |
| `role` | `public.app_role` | `not null default 'user'` |
| `assigned_at` | `timestamptz` | `not null default now()` |

Un usuario tiene **como mucho un rol** (la PK es `user_id`).

`private.is_admin()` e `private.is_staff()` tienen `revoke ... from public, anon`
y `grant execute ... to authenticated`: no son invocables por RPC.

**No hay política de escritura.** El rol se cambia sólo por el trigger (asigna
`user` al registrarse) o por un DBA desde el SQL Editor:

```sql
update public.user_roles set role = 'admin'   where user_id = 'UUID';
update public.user_roles set role = 'operator' where user_id = 'UUID';
```

### `public.parking_locations`

| Columna | Tipo | Restricción |
| --- | --- | --- |
| `id` | `uuid` | PK, `gen_random_uuid()` |
| `name` | `text` | CHECK `char_length(btrim(name)) between 1 and 120` |
| `address` | `text` | `not null default ''` (sin CHECK de longitud) |
| `description` | `text` | nullable |
| `latitude` | `double precision` | nullable, CHECK -90..90 |
| `longitude` | `double precision` | nullable, CHECK -180..180 |
| `is_active` | `boolean` | `not null default true` |
| `created_by` | `uuid` | nullable, FK `auth.users.id` SET NULL |

CHECK adicional:

```sql
constraint coordinates_together check ((latitude is null) = (longitude is null))
```

**Coordenadas o ninguna.** No se puede guardar latitud sin longitud. Es
deliberado: una ubicación a medio rellenar no sirve para nada.

### `public.parking_spaces`

| Columna | Tipo | Restricción |
| --- | --- | --- |
| `id` | `uuid` | PK |
| `location_id` | `uuid` | `not null`, FK `parking_locations` CASCADE |
| `code` | `text` | CHECK `char_length(btrim(code)) between 1 and 30` |
| `floor_label` | `text` | nullable |
| `description` | `text` | nullable |
| `status` | `public.space_status` | `not null default 'available'` |
| `is_active` | `boolean` | `not null default true` |
| `status_updated_at` | `timestamptz` | `not null default now()` |
| `status_updated_by` | `uuid` | nullable, FK SET NULL |

Constraints:

```sql
unique(location_id, code)
unique(id, location_id)   -- habilita la FK compuesta de parking_sessions
```

El código `A-12` puede repetirse en dos ubicaciones distintas, pero sólo una
vez en cada una. Violarlo da **23505** con el constraint
`parking_spaces_location_id_code_key`.

Índice compuesto `idx_spaces_location_status(location_id, status)`: es el que
soporta el filtro típico de Persona 3 (espacios de una ubicación por estado).

### `public.parking_sessions`

| Columna | Tipo | Restricción |
| --- | --- | --- |
| `id` | `uuid` | PK |
| `user_id` | `uuid` | `not null default auth.uid()`, FK CASCADE |
| `location_id` | `uuid` | nullable, FK SET NULL |
| `space_id` | `uuid` | nullable (FK compuesta, ver arriba) |
| `latitude` | `double precision` | `not null`, CHECK -90..90 |
| `longitude` | `double precision` | `not null`, CHECK -180..180 |
| `accuracy_m` | `double precision` | nullable, CHECK `>= 0` |
| `note` | `text` | nullable, CHECK `char_length <= 1000` |
| `status` | `public.parking_session_status` | `not null default 'active'` |
| `parked_at` | `timestamptz` | `not null default now()` |
| `ended_at` | `timestamptz` | nullable |

`user_id` tiene `default auth.uid()`, así que la BD rellena el propietario si el
cliente lo omite. Aun así, `parking-sessions.service.ts` lo envía explícito desde
la sesión verificada: ser explícito aquí evita que un cambio futuro en el SQL
deje la puerta abierta.

CHECK `session_dates_valid`:

```sql
(status = 'active'    and ended_at is null)
or (status = 'completed' and ended_at is not null and ended_at >= parked_at)
```

Por eso `completeParkingSession` manda `status` **y** `ended_at` juntos: enviar
sólo uno da 23514.

Índice único parcial:

```sql
create unique index one_active_session_per_user
  on public.parking_sessions(user_id) where status = 'active';
```

Como máximo una sesión activa por usuario, garantizado por la BD. Violarlo da
23505 mencionando `one_active_session_per_user`, que es justo lo que
`translateError` busca para dar el mensaje útil.

Trigger `private.guard_session_owner`: rechaza cambiar `user_id` en un UPDATE
("No se puede transferir un estacionamiento a otro usuario").

### `public.parking_reminders`

| Columna | Tipo | Restricción |
| --- | --- | --- |
| `id` | `uuid` | PK |
| `user_id` | `uuid` | `not null default auth.uid()`, FK CASCADE |
| `session_id` | `uuid` | `not null`, FK `parking_sessions` CASCADE |
| `title` | `text` | CHECK `char_length(btrim(title)) between 1 and 120` |
| `message` | `text` | nullable, **sin CHECK de longitud** |
| `remind_at` | `timestamptz` | `not null` |
| `status` | `public.reminder_status` | `not null default 'pending'` |

Trigger `private.validate_reminder_owner`: exige que exista una sesión con
`id = new.session_id and user_id = new.user_id`. Un recordatorio sobre la sesión
de otro usuario falla.

`message` no tiene CHECK: el límite de 500 caracteres en
`reminders.service.ts` es una convención de la app, no una garantía de la BD.

## 3. Enums (valores exactos)

| Enum | Valores |
| --- | --- |
| `public.app_role` | `'user'`, `'operator'`, `'admin'` |
| `public.space_status` | `'available'`, `'occupied'`, `'maintenance'` |
| `public.parking_session_status` | `'active'`, `'completed'` |
| `public.reminder_status` | `'pending'`, `'cancelled'`, `'sent'` |

> Ojo con los nombres: `app_role`, **no** `user_role`;
> `parking_session_status`, **no** `session_status`. Si regeneras los tipos con
> la CLI, los enums aparecerán con el nombre real de Postgres.

Son enums de Postgres, no texto libre: un valor fuera de la lista da **23514**.

## 4. Matriz RLS

RLS se activa en las 6 tablas. **No existe ninguna política `to anon`**, y el
script hace `revoke all on ... from anon, authenticated` antes de conceder los
privilegios uno a uno.

### `profiles`

| Operación | Quién | Condición |
| --- | --- | --- |
| SELECT | `authenticated` | `auth.uid() = id` |
| UPDATE | `authenticated` | `auth.uid() = id` (uso y check) |

`GRANT update(full_name, phone, avatar_url)`: `id`, `created_at` y `updated_at`
no tienen permiso de UPDATE.

### `user_roles`

| Operación | Quién |
| --- | --- |
| SELECT | `authenticated`, sólo su fila |
| INSERT/UPDATE/DELETE | **nadie** desde el cliente |

### `parking_locations`

| Operación | `user` | `operator` | `admin` |
| --- | --- | --- | --- |
| SELECT | activas | activas + inactivas | activas + inactivas |
| INSERT | no | no | **sí**, y `created_by = auth.uid()` |
| UPDATE | no | no | **sí** |
| DELETE | no | no | **sí** |

El `with check` del INSERT incluye `created_by = auth.uid()`: aunque un admin
intente atribuir la ubicación a otro, la BD lo rechaza.

### `parking_spaces`

| Operación | `user` | `operator` | `admin` |
| --- | --- | --- | --- |
| SELECT | activos en ubicaciones activas | + inactivos | + inactivos |
| INSERT | no | no | **sí** |
| UPDATE `status` | no | **sí** | **sí** |
| UPDATE resto de columnas | no | no | **sí** |
| DELETE | no | no | **sí** |

> La política `spaces_read` incluye un `exists` sobre `parking_locations`. Como
> `parking_locations` también tiene RLS, el `exists` evalúa bajo las políticas
> de esa tabla; para un `user` normal sólo ve las activas, que es justo lo que
> se busca.

La fila "UPDATE resto de columnas" la impone `private.guard_space_update`, que
compara con `row(...) is distinct from row(...)` y lanza excepción si un
no-admin toca `location_id`, `code`, `floor_label`, `description` o `is_active`.
Sin él, el `GRANT update` es de tabla completa y un `operator` podría renombrar
espacios.

Ese mismo trigger protege la auditoría:

```sql
if new.status is distinct from old.status then
  new.status_updated_at = now();
  new.status_updated_by = auth.uid();
else
  new.status_updated_at = old.status_updated_at;   -- no se puede reescribir
  new.status_updated_by = old.status_updated_by;
end if;
```

Es decir: **cambiar el estado reescribe la auditoría; cambiar cualquier otra
columna la conserva.** Un `operator` no puede actualizar `code` y fingir que el
estado cambió a las 14:30.

### `parking_sessions`

| Operación | Quién |
| --- | --- |
| SELECT | sólo el propietario |
| INSERT | sólo el propietario (`user_id = auth.uid()`) |
| UPDATE | sólo el propietario, y `user_id` no puede cambiar |
| DELETE | sólo el propietario |

### `parking_reminders`

| Operación | Quién |
| --- | --- |
| SELECT/INSERT/UPDATE/DELETE | sólo el propietario |

## 5. Triggers

| Trigger | Función | Cuándo |
| --- | --- | --- |
| `on_auth_user_created` | `private.create_user_profile` | AFTER INSERT en `auth.users` |
| `trg_profiles_updated` | `private.set_updated_at` | BEFORE UPDATE |
| `trg_locations_updated` | `private.set_updated_at` | BEFORE UPDATE |
| `trg_spaces_updated` | `private.set_updated_at` | BEFORE UPDATE |
| `trg_spaces_guard` | `private.guard_space_update` | BEFORE UPDATE |
| `trg_sessions_updated` | `private.set_updated_at` | BEFORE UPDATE |
| `trg_sessions_owner` | `private.guard_session_owner` | BEFORE UPDATE |
| `trg_reminders_updated` | `private.set_updated_at` | BEFORE UPDATE |
| `trg_reminders_owner` | `private.validate_reminder_owner` | BEFORE INSERT **o** UPDATE |

Todas las funciones de trigger son `set search_path = ''` (pg_catalog siempre se
resuelve). Las que tocan datos de otras tablas usan `security definer`.

## 6. Funciones de apoyo

En el schema `private`, que **no está expuesto en la API** de Supabase
(schemas expuestos: `public`, `graphql_public`).

| Función | Devuelve | Para qué |
| --- | --- | --- |
| `private.is_admin()` | `boolean` | policies de escritura |
| `private.is_staff()` | `boolean` | `operator` o `admin` |

Ambas son `security definer set search_path = ''`: `security definer` para leer
`user_roles` sin disparar recursión de RLS, `search_path = ''` para que un
`search_path` manipulado no cambie qué función se ejecuta.

## 7. Índices

| Nombre | Tabla | Columnas |
| --- | --- | --- |
| `one_active_session_per_user` | `parking_sessions` | UNIQUE parcial `(user_id) WHERE status='active'` |
| `idx_spaces_location_status` | `parking_spaces` | `(location_id, status)` |
| `idx_sessions_user_date` | `parking_sessions` | `(user_id, parked_at DESC)` |
| `idx_reminders_user_date` | `parking_reminders` | `(user_id, remind_at)` |
| `idx_locations_active` | `parking_locations` | `(is_active)` |

## 8. Semántica que suele malinterpretarse

| Concepto | Significado | NO significa |
| --- | --- | --- |
| `is_active = false` | Retirado de la lista | Borrado |
| `parking_spaces.status` | Lo último que **marcó una persona** | Sensor en vivo |
| `parking_sessions.status = 'active'` | Coche estacionado, sin cerrar | Reserva de plaza |
| `parking_reminders.status = 'sent'` | Alguien dijo que se envió | Que se envió |
| Sesión sin `location_id`/`space_id` | Guardó sólo coordenadas GPS | Error de captura |
| `profiles.full_name = ''` | El alta no mandó nombre | Usuario sin nombre |

## 9. Regenerar los tipos

```bash
npx supabase gen types typescript \
  --project-id <PROJECT_REF> \
  --schema public \
  > src/types/database.types.ts
```

Requiere la CLI de Supabase (`npm i -g supabase`) y acceso al proyecto.

> `src/types/database.types.ts` está escrito a mano y refleja este SQL. Al
> regenerar, revisa que los nombres de enum coincidan (`app_role`,
> `parking_session_status`) y que `models.ts` siga compilando: sus alias
> apuntan a nombres de tabla concretos y un renombrado los rompe.

## 10. Aplicar cambios al esquema

`001_initial_schema.sql` es la fuente de verdad y **no se edita después de
aplicarse**. No es idempotente: los `create type` y `create table` no llevan
`if not exists`, a propósito, porque aplicarlo dos veces debe fallar y delatar
un error de proceso.

Un cambio incompatible va en un fichero nuevo:

```text
supabase/migrations/002_lo_que_sea.sql
```

Criterio: un `002` debe ser aplicable sobre un `001` ya aplicado sin tocar el
`001`. Si necesitas cambiar el `001`, es porque aún no se aplicó en ningún sitio.