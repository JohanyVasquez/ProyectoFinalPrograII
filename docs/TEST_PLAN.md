# Plan de pruebas — ParkEasy

Dos bloques: pruebas **automatizadas** (se ejecutan sin credenciales) y pruebas
**manuales** (requieren dos usuarios reales y el SQL Editor).

## Regla sobre resultados

`PASS` sólo si alguien lo ejecutó y lo vio pasar. Lo que no se ha ejecutado se
marca `NOT RUN`, nunca `PASS`. Un `PASS` inventado es peor que un hueco: hace
creer que algo está verificado cuando no lo está.

---

# Bloque A — Automatizadas

Ejecución: `npm test` (que además corre `npm run typecheck` como `pretest`).

**Estado actual: PASS (28 tests).** Ejecutado con Node 26.5.0 / npm 11.17.0.

## A.1 Validación de entrada — `src/lib/validation.test.ts`

| # | Caso | Resultado |
| --- | --- | --- |
| A.1.1 | `normalizeEmail` recorta espacios y pasa a minúsculas | PASS |
| A.1.2 | Email válido (con espacios, con `+tag`, subdominio) | PASS |
| A.1.3 | Email inválido (sin @, sin dominio, sin TLD, con espacios) | PASS |
| A.1.4 | Nombre vacío / sólo espacios rechazado | PASS |
| A.1.5 | Nombre de 120 caracteres acepta, 121 rechaza | PASS |
| A.1.6 | Contraseña: 7 caracteres rechaza, 8 acepta | PASS |
| A.1.7 | UUID en minúsculas y mayúsculas acepta; otros formatos rechaza | PASS |
| A.1.8 | Latitud ±90 y longitud ±180 en el límite exactos | PASS |
| A.1.9 | Valores fuera de rango rechazados | PASS |
| A.1.10 | `NaN` e `Infinity` rechazados | PASS |
| A.1.11 | Par de coordenadas validado conjunto | PASS |
| A.1.12 | `accuracy_m` negativo y `NaN` rechazados | PASS |
| A.1.13 | `escapeLikePattern` escapa `%`, `_` y `\` | PASS |
| A.1.14 | `escapeLikePattern` deja intacto el texto normal | PASS |
| A.1.15 | `joinErrors` une mensajes y devuelve `null` si no hay | PASS |

## A.2 Mapeo de errores — `src/lib/errors.test.ts`

| # | Caso | Resultado |
| --- | --- | --- |
| A.2.1 | "Invalid login credentials" → «Correo o contraseña incorrectos.» | PASS |
| A.2.2 | "Email not confirmed" → «Revisa tu correo…» | PASS |
| A.2.3 | "User already registered" → «Ya existe una cuenta con ese correo.» | PASS |
| A.2.4 | 23505 `one_active_session_per_user` → mensaje de sesión activa | PASS |
| A.2.5 | 23505 `parking_spaces_location_id_code_key` → mensaje de código | PASS |
| A.2.6 | 23505 con constraint desconocida → mensaje genérico, sin crash | PASS |
| A.2.7 | 42501 → «Tu rol no tiene permisos…» sin filtrar la política | PASS |
| A.2.8 | 28000/28001 → «Tu sesión expiró.» | PASS |
| A.2.9 | "Failed to fetch" → mensaje de conexión | PASS |
| A.2.10 | Error desconocido **no** filtra el texto crudo | PASS |
| A.2.11 | `translateError(undefined)` no revienta | PASS |
| A.2.12 | `missingEnvMessage` menciona las variables y `.env` | PASS |

## A.3 Tipo y lint

| # | Comando | Resultado |
| --- | --- | --- |
| A.3.1 | `npx tsc --noEmit` (app, `strict` + `noUncheckedIndexedAccess`) | PASS, 0 errores |
| A.3.2 | `npx tsc -p tsconfig.test.json` (tests) | PASS, 0 errores |
| A.3.3 | `npm run lint` (`expo lint`) | PASS, 0 errores 0 avisos |

## A.4 Lo que NO cubren los tests

- Componentes React (no hay runner de render en el proyecto).
- Cualquier cosa contra la API real de Supabase.
- RLS: las políticas viven en Postgres, no en el código de la app.

Es una limitación consciente, no un olvido. Ver `docs/ARCHITECTURE.md` §4.

---

# Bloque B — Manuales con credenciales reales

**Estado: NOT RUN.** Requiere un proyecto de Supabase con `001` aplicado y
`.env` con credenciales válidas. Quien lo ejecute, que rellene la columna de
resultado con `PASS`/`FAIL`/`NOT RUN` y la fecha.

## B.0 Preparación

1. Proyecto de Supabase con `supabase/migrations/001_initial_schema.sql`
   aplicado (ver `supabase/README.md`).
2. `.env` con `EXPO_PUBLIC_SUPABASE_URL` y `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY`.
3. `npx expo start -c`.
4. Tres cuentas de prueba:
   - `test.user.a@example.com` (rol `user`)
   - `test.user.b@example.com` (rol `user`)
   - `test.admin@example.com` (rol `admin`)
   - `test.operator@example.com` (rol `operator`)

   Promover con:
   ```sql
   update public.user_roles set role = 'admin'
   where user_id = (select id from auth.users where email = 'test.admin@example.com');
   ```

| Preparación | Resultado | Fecha | Notas |
| --- | --- | --- | --- |
| `001` aplicado sin errores | NOT RUN | — | |
| `.env` configurado, app arranca | NOT RUN | — | |
| 4 cuentas creadas y roles asignados | NOT RUN | — | |

## B.1 Autenticación

| # | Caso | Pasos | Esperado | Resultado |
| --- | --- | --- | --- | --- |
| B.1.1 | Registro nuevo | Registrar un email inexistente | Entra a la pantalla privada, perfil con el nombre | NOT RUN |
| B.1.2 | Registro duplicado | Registrar el mismo email otra vez | «Ya existe una cuenta con ese correo.» | NOT RUN |
| B.1.3 | Confirmación ON | Con "Confirm email" activo | «Revisa tu correo», NO entra | NOT RUN |
| B.1.4 | Confirmación OFF | Con la confirmación desactivada | Entra directamente | NOT RUN |
| B.1.5 | Perfil automático | Tras B.1.1: `select * from profiles where id = ...` | 1 fila con `full_name` del formulario | NOT RUN |
| B.1.6 | Rol por defecto | `select role from user_roles` | `'user'` | NOT RUN |
| B.1.7 | Contraseña incorrecta | Login con password equivocada | «Correo o contraseña incorrectos.» | NOT RUN |
| B.1.8 | Email inválido | Login con `abc` | «Introduce un correo electrónico válido.» | NOT RUN |
| B.1.9 | Contraseña corta | Login con 7 caracteres | «La contraseña debe tener al menos 8 caracteres.» | NOT RUN |
| B.1.10 | Email con espacios/mayúsculas | `  TEST@Example.COM ` | Entra igual (normalización) | NOT RUN |
| B.1.11 | Sesión persistente | Login, cerrar app, reabrir | Sigue con sesión, pantalla privada | NOT RUN |
| B.1.12 | Logout | Pulsar «Cerrar sesión» | Vuelve a `/login` | NOT RUN |
| B.1.13 | Logout limpio | Tras B.1.12, reabrir | Ya no hay sesión | NOT RUN |
| B.1.14 | Flash de pantalla privada | Reabrir la app con sesión | Nunca se ve el login un instante | NOT RUN |

## B.2 Rutas privadas

| # | Caso | Pasos | Esperado | Resultado |
| --- | --- | --- | --- | --- |
| B.2.1 | Sin sesión a `/parking` | Escribir la ruta con la app deslogueada | Redirige a `/login` | NOT RUN |
| B.2.2 | Sin sesión a `/history` | Igual con `/history` | Redirige a `/login` | NOT RUN |
| B.2.3 | Con sesión a `/login` | Navegar a `/login` con sesión activa | No muestra el login | NOT RUN |
| B.2.4 | Logout desde ruta privada | Logout estando en `/history` | Salta fuera de la zona privada | NOT RUN |
| B.2.5 | Cambio de cuenta | Login A, logout, login B | Muestra el perfil de B, nunca el de A | NOT RUN |

## B.3 RLS — aislamiento entre usuarios

Requiere A y B autenticados en dispositivos/sesiones distintas.

| # | Caso | Pasos | Esperado | Resultado |
| --- | --- | --- | --- | --- |
| B.3.1 | B no lee sesiones de A | A crea sesión; B lista sesiones | B ve 0 sesiones | NOT RUN |
| B.3.2 | B no lee recordatorios de A | A crea recordatorio; B lista | B ve 0 | NOT RUN |
| B.3.3 | B no lee perfil de A | B consulta el id de A | 42501 o 0 filas | NOT RUN |
| B.3.4 | B no lee roles ajenos | B consulta roles | Sólo el suyo | NOT RUN |
| B.3.5 | B no borra sesión de A | B intenta borrar el id de A | 42501 | NOT RUN |
| B.3.6 | B no edita sesión de A | B intenta editar el id de A | 42501 | NOT RUN |
| B.3.7 | Verificación SQL | Como B: `select count(*) from parking_sessions` | Sólo las suyas | NOT RUN |

## B.4 Permisos por rol

| # | Caso | Quién | Esperado | Resultado |
| --- | --- | --- | --- | --- |
| B.4.1 | `user` no crea ubicaciones | user | 42501 | NOT RUN |
| B.4.2 | `user` no crea espacios | user | 42501 | NOT RUN |
| B.4.3 | `user` no cambia estado de espacio | user | 42501 | NOT RUN |
| B.4.4 | `user` sólo ve ubicaciones activas | user | Las inactivas no aparecen | NOT RUN |
| B.4.5 | `operator` sí cambia estado | operator | 200 OK, auditoría con su id | NOT RUN |
| B.4.6 | `operator` NO cambia `code` | operator | Excepción del trigger | NOT RUN |
| B.4.7 | `operator` no crea ubicaciones | operator | 42501 | NOT RUN |
| B.4.8 | `admin` crea ubicación | admin | 201, `created_by` = su id | NOT RUN |
| B.4.9 | `admin` crea espacio | admin | 201 | NOT RUN |
| B.4.10 | `admin` desactiva ubicación | admin | `is_active = false` | NOT RUN |
| B.4.11 | `operator` ve inactivas | operator | Sí aparecen | NOT RUN |
| B.4.12 | Sin privilegios para `anon` | SQL | 0 filas en `role_table_grants` | NOT RUN |

## B.5 Restricciones de datos

| # | Caso | Esperado | Resultado |
| --- | --- | --- | --- |
| B.5.1 | Dos sesiones activas del mismo usuario | 23505, mensaje «ya tienes una sesión activa» | NOT RUN |
| B.5.2 | Dos sesiones activas de usuarios distintos | Ambas OK | NOT RUN |
| B.5.3 | `latitude = 91` | 23514 | NOT RUN |
| B.5.4 | `longitude = -200` | 23514 | NOT RUN |
| B.5.5 | `accuracy_m = -5` | 23514 | NOT RUN |
| B.5.6 | Cerrar sesión con `status` pero sin `ended_at` | 23514 (`session_dates_valid`) | NOT RUN |
| B.5.7 | `ended_at` anterior a `parked_at` | 23514 | NOT RUN |
| B.5.8 | `space_id` sin `location_id` | 23514 (`session_space_location`) | NOT RUN |
| B.5.9 | `space_id` de otra ubicación | 23503 (FK compuesta) | NOT RUN |
| B.5.10 | `space_id` inexistente | 23503 | NOT RUN |
| B.5.11 | Sesión sin `space_id` ni `location_id` | 201 (sólo GPS, válido) | NOT RUN |
| B.5.12 | Código duplicado en la misma ubicación | 23505 | NOT RUN |
| B.5.13 | Mismo código en otra ubicación | 201 (permitido) | NOT RUN |
| B.5.14 | `note` de 1001 caracteres | 23514 | NOT RUN |
| B.5.15 | Ubicación con latitud y sin longitud | 23514 (`coordinates_together`) | NOT RUN |
| B.5.16 | Transferir `user_id` de una sesión | Excepción `guard_session_owner` | NOT RUN |
| B.5.17 | Cambiar `code` sin cambiar `status` | `status_updated_at` **no** cambia | NOT RUN |
| B.5.18 | Borrar espacio con sesiones | 23503 | NOT RUN |
| B.5.19 | `title` de recordatorio vacío | 23514 | NOT RUN |
| B.5.20 | Recordatorio sobre sesión ajena | Excepción `validate_reminder_owner` | NOT RUN |

## B.6 Ciclo completo

| # | Paso | Resultado |
| --- | --- | --- |
| B.6.1 | Registrar → (confirmar si está activo) → login → pantalla protegida → logout | NOT RUN |
| B.6.2 | Registrar → cerrar app → reabrir → ya con sesión | NOT RUN |
| B.6.3 | Admin crea ubicación y espacios, marca estados, `user` los ve | NOT RUN |
| B.6.4 | Estado de espacio cambia y la auditoría refleja el cambio | NOT RUN |
| B.6.5 | Sesión de Parking: guardar → cerrar → aparece en historial | NOT RUN |

---

## B.7 Nota sobre credenciales

**Nunca** pegues tokens, contraseñas ni claves reales en este documento. Si una
prueba necesita un JWT, describe el procedimiento, no pegues el valor.

---

# Resumen

| Bloque | Cobertura | Estado |
| --- | --- | --- |
| A (automático) | 28 tests, typecheck, lint | **PASS** |
| B (manual) | ~60 casos | **NOT RUN** |

El bloque B es el que valida de verdad que Auth, RLS y los roles funcionan
contra un proyecto real. Hasta que se ejecute, **no afirmes que la integración
con Supabase funciona**: lo que está verificado es el código que la llama.