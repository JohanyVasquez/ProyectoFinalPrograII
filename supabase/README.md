# Supabase — ParkEasy

Paso a paso para dejar el proyecto de Supabase funcionando. **Todo esto lo hace
una persona con acceso al Dashboard; ninguna de estas acciones se puede hacer
desde la app.**

## 1. Crear el proyecto

1. https://supabase.com/dashboard → **New project**
2. Guarda el **Project URL** y la **Project Ref** (los necesitarás para la CLI y
   para regenerar tipos).
3. Anota la contraseña de la base de datos: se usa para la CLI, **nunca** para
   la app.

## 2. Aplicar el SQL

**SQL Editor → New query** → pegar el contenido de
`supabase/migrations/001_initial_schema.sql` → **Run**.

Debes ver el aviso `ParkEasy: esquema aplicado correctamente` (el `DO` del
final hace esa comprobación). Si sale un error, léelo antes de continuar: el
script **no es idempotente**, así que un fallo a mitad puede dejar objetos a
medio crear.

> Ejecuta `001` **una sola vez**. Si ya lo ejecutaste, no lo repitas: los
> cambios van en ficheros nuevos (`002_*.sql`, ...).

### Verificar

```sql
-- Debe devolver 6 filas
select table_name from information_schema.tables
where table_schema = 'public' order by table_name;

-- Debe devolver 6 filas (RLS activo en todas)
select relname, relrowsecurity from pg_class
where relnamespace = 'public'::regnamespace and relkind = 'r';

-- Debe devolver 0 filas: ningún privilegio para anon
select table_name, grantee from information_schema.role_table_grants
where table_schema = 'public' and grantee = 'anon';

-- Debe devolver 4 filas
select typname from pg_type t
join pg_namespace n on n.oid = t.typnamespace
where n.nspname = 'public' and t.typtype = 'e';
```

## 3. Configurar el proveedor de email

**Authentication → Sign In / Providers → Email**

- **Confirm email**: actívalo o desactívalo según decida el equipo.
  - **ON (recomendado para producción):** la app muestra "revisa tu correo" y
    no deja entrar sin confirmar.
  - **OFF:** útil en desarrollo, pero cualquiera que conozca el correo podría
    tomar el control de esa cuenta. Si lo usas, que sea sólo en desarrollo.
- Desactiva "Allow signups" sólo si el registro debe ser por invitación.

No hay proveedor de correo configurado por defecto en un proyecto nuevo con
límites bajos: si el envío falla, revisa los avisos de Authentication → Logs.

## 4. Obtener la clave publicable

**Project Settings → Connect → App Frameworks → Expo**

Copia el **Project URL** y la **publishable key** (`sb_publishable_...`).

> **Nunca** copies la `service_role` ni la `secret`. Con la `service_role` se
> ignora RLS por completo: cualquier persona con la clave podría leer y escribir
> toda la base de datos. Esa clave no va en la app en ninguna circunstancia.

## 5. Configurar la app

```bash
Copy-Item .env.example .env      # Windows PowerShell
cp .env.example .env             # macOS / Linux
```

Rellena:

```dotenv
EXPO_PUBLIC_SUPABASE_URL=https://TU_PROJECT_REF.supabase.co
EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_TU_CLAVE
```

Reinicia el bundler (`npx expo start -c`): Metro cachea `process.env`.

### Sobre la seguridad de estas variables

`EXPO_PUBLIC_*` se incrusta en el bundle. **No son secretos** y no deben serlo.
Lo que protege los datos es RLS. La clave publishable está diseñada para
publicarse.

## 6. Crear un usuario y probarlo

1. Arranca la app: `npx expo start`
2. Regístrate desde la pantalla de registro.
3. Si la confirmación de email está ON, confirma desde el enlace recibido.

Comprueba en el **SQL Editor** que el alta fue correcta:

```sql
-- Debe existir una fila por usuario creado
select p.id, p.full_name, ur.role
from public.profiles p
join public.user_roles ur on ur.user_id = p.id
order by p.created_at desc;
```

Si `profiles` está vacía, el trigger `private.create_user_profile` no se
disparó: revisa que el SQL se haya aplicado **antes** de crear el usuario.

## 7. Promover un usuario a admin u operator

Sólo desde el SQL Editor. Nunca desde la app, nunca con la `service_role`.

```sql
-- ¿Quién eres?
select p.id, p.full_name, ur.role
from public.profiles p
join public.user_roles ur on ur.user_id = p.id
order by p.created_at;

-- Promover (copia el id exacto del paso anterior)
update public.user_roles set role = 'admin'    where user_id = 'UUID_EXACTO';
update public.user_roles set role = 'operator' where user_id = 'UUID_EXACTO';
```

No existe RPC de elevación de privilegios, y esa es la idea: si existiera,
cualquier usuario autenticado podría llamarse a sí mismo admin.

> Usa el `id` exacto que te devuelve el `select` anterior.

Para revertir:
```sql
update public.user_roles set role = 'user' where user_id = 'UUID_EXACTO';
```

## 8. Revisar las políticas

**Database → Tables → <tabla> → RLS policies**, o por SQL:

```sql
select tablename, policyname, cmd, roles, qual, with_check
from pg_policies
where schemaname = 'public'
order by tablename, policyname;
```

Comprueba que:
- todas las políticas son `TO authenticated`;
- no hay ninguna `TO anon` ni `TO public`;
- `user_roles` tiene exactamente una política (SELECT propia) y ninguna de
  escritura.

## 9. Cargar datos de prueba (opcional)

ParkEasy **no** trae datos de demostración. Si quieres probar el listado,
inserta ubicaciones ficticias **claramente etiquetadas**:

```sql
insert into public.parking_locations (name, address, description)
values
  ('[PRUEBA] Estacionamiento Campus Norte', 'Calle Ficticia 123', 'DATOS DE PRUEBA - no es una ubicación real'),
  ('[PRUEBA] Estacionamiento Biblioteca',     'Avenida Inventada 45', 'DATOS DE PRUEBA - no es una ubicación real');
```

Y espacios, sólo si tienes rol admin:

```sql
-- Sube el admin primero (paso 7) y usa SU sesión, no un SQL arbitrario.
insert into public.parking_spaces (location_id, code, floor_label)
select id, 'P-' || g, 'Planta ' || g
from public.parking_locations, generate_series(1, 5) g
where name like '[PRUEBA]%';
```

**Bórralos antes de entregar.** Y nunca presentes datos así como si fueran
información real: el estado de un espacio es una estimación manual.

## 10. Generar los tipos (opcional pero recomendado)

```bash
npm i -g supabase
supabase login

npx supabase gen types typescript \
  --project-id <TU_PROJECT_REF> \
  --schema public \
  > src/types/database.types.ts
```

Después: `npm run typecheck`. Si `models.ts` falla, es porque un alias apuntaba
a una tabla que cambió de nombre.

## 11. Problemas frecuentes

| Síntoma | Causa | Solución |
| --- | --- | --- |
| `relation "public.profiles" does not exist` | SQL no aplicado | Ejecuta `001` en el SQL Editor |
| `permission denied for table profiles` | Rol `anon` o sesión sin confirmar | Inicia sesión en la app, no en el SQL Editor |
| `new row violates row-level security policy` | Rol insuficiente | Necesitas `operator`/`admin` (paso 7) |
| `Profiles is empty` pero el usuario existe | Trigger no existía al crear el usuario | Inserta el perfil a mano o crea otro usuario |
| `email not confirmed` | Confirmación de email activa | Confirma el correo |
| 401 al recargar | Token caducado | `autoRefreshToken` lo resuelve; si persiste, cierra sesión y entra |
| Cambiaste `.env` y nada cambia | Metro cachea | `npx expo start -c` |

## 12. Checklist

- [ ] Proyecto creado, URL y Project Ref anotados
- [ ] `001_initial_schema.sql` aplicado una sola vez, sin errores
- [ ] Verificación: 6 tablas, 6 con RLS, 0 privilegios para `anon`
- [ ] Proveedor de email configurado; confirmación ON/OFF según decisión del equipo
- [ ] `.env` creado con URL y publishable key (**no** la `service_role`)
- [ ] `npx expo start -c` levanta la app
- [ ] Registro/login/logout funcionan
- [ ] `profiles` se rellenó sola al registrarse
- [ ] Sesión persiste tras cerrar y reabrir la app
- [ ] Rutas privadas inaccesibles sin sesión
- [ ] Admin promovido vía SQL Editor y probado
- [ ] Tipos regenerados (opcional) y `npm run typecheck` en verde