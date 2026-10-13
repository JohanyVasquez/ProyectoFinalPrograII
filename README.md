# ParkEasy

App móvil para consultar estacionamientos y espacios registrados, **guardar por
GPS dónde dejaste tu vehículo**, encontrarlo después y revisar tu historial.

Los usuarios se autentican con email y contraseña. El estado de cada espacio
(`available` / `occupied` / `maintenance`) lo **marca una persona**: no hay
sensores, ni reservas, ni pagos, ni lectura de matrículas.

> El estado de un espacio es una estimación manual y puede estar desactualizado.
> La app nunca debe presentarlo como disponibilidad en tiempo real.

## Stack

| Pieza | Tecnología |
| --- | --- |
| App | Expo SDK 57 (managed / CNG), React Native 0.86 |
| Navegación | Expo Router (`src/app/`) |
| Lenguaje | TypeScript 6 `strict` + `noUncheckedIndexedAccess` |
| Backend | Supabase (PostgreSQL + Auth + RLS) |
| Persistencia de sesión | `@react-native-async-storage/async-storage` |
| Tests | Runner nativo de Node + `tsx` (sin Jest) |

## Requisitos

- Node.js 20 o superior (probado con 26.5.0)
- npm 10 o superior
- Expo Go en el móvil, o un development build
- Una cuenta de Supabase con `001_initial_schema.sql` aplicado

## Puesta en marcha

```bash
npm install
Copy-Item .env.example .env     # Windows PowerShell
# cp .env.example .env          # macOS / Linux
```

Rellena `.env` con los datos de tu proyecto:

```dotenv
EXPO_PUBLIC_SUPABASE_URL=https://TU_PROJECT_REF.supabase.co
EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_TU_CLAVE
```

```bash
npx expo start
```

Si acabas de crear el `.env`, reinicia con `npx expo start -c`: Metro cachea
las variables.

### Sobre estas variables

`EXPO_PUBLIC_*` se incrusta en el bundle: **no son secretos**. La clave
publicable está diseñada para publicarse. Lo que protege los datos es **RLS**.

**Nunca** pongas la `service_role` ni la `secret` en la app: con ellas se ignora
RLS por completo.

### Si no hay `.env`

La app arranca igual y muestra un mensaje claro de configuración faltante, en
vez de fallar con un error oscuro. Es intencional.

## Aplicar la base de datos

**Supabase Dashboard → SQL Editor → New query** → pega
`supabase/migrations/001_initial_schema.sql` → **Run**. Una sola vez.

Guía paso a paso con verificaciones: [`supabase/README.md`](supabase/README.md).

Después, activa el proveedor de email en **Authentication → Sign In / Providers**.
Decide con el equipo si "Confirm email" queda activado.

## Comandos

```bash
npm start          # servidor de desarrollo
npm run android    # abre en Android
npm run ios        # abre en iOS (macOS)
npm run web        # abre en web

npm run lint       # eslint (expo lint)
npm run typecheck  # tsc --noEmit
npm test           # tests + typecheck previo
```

Antes de dar cualquier cosa por terminada:

```bash
npm run lint && npm run typecheck && npm test
```

## Estructura

```text
src/
  app/                    RUTAS (Expo Router). Cada fichero = una pantalla.
    _layout.tsx           AuthProvider + Stack.Protected
    (auth)/               login, register      → Persona 2
    (app)/                zona privada
      parking/            → Persona 3
      vehicle/            → Persona 4
      history/            → Persona 5
      profile/            → Persona 2
  components/common/      Componentes sustituibles
  contexts/               AuthContext (fuente de verdad de auth)
  hooks/useAuth.ts        Acceso al contexto
  lib/
    supabase.ts           Cliente ÚNICO
    errors.ts             Errores → español
    validation.ts         Validación pura (testeable)
  services/               Acceso tipado a la BD
  types/                  database.types.ts, models.ts
  constants/routes.ts     Rutas tipadas
supabase/migrations/      SQL (fuente de verdad del esquema)
docs/                     Documentación del proyecto
```

## Responsabilidades

| Persona | Responsabilidad | Ficheros |
| --- | --- | --- |
| **1** | Expo, Supabase Auth, SQL + RLS, servicios tipados, documentación | `src/lib/`, `src/contexts/`, `src/services/`, `src/types/`, `supabase/` |
| **2** | Diseño visual, welcome/login/registro, navegación, perfil | `src/app/(auth)/`, `src/app/(app)/profile/`, `src/components/` |
| **3** | Listado, filtros y administración de espacios | `src/app/(app)/parking/` |
| **4** | Permisos GPS, mapas, guardar y encontrar el vehículo | `src/app/(app)/vehicle/` |
| **5** | Historial, CRUD de sesiones, recordatorios y notificaciones | `src/app/(app)/history/` |

Las pantallas de Persona 1 son **provisionales**: funcionan y están conectadas
a Auth, pero se pueden reemplazar enteras sin tocar los servicios.

## Qué hay que saber antes de tocar código

1. **Hay un solo cliente de Supabase.** Se importa desde `@/lib/supabase`.
   Crear otro duplica el estado de sesión.
2. **RLS manda, no el frontend.** Ocultar un botón no autoriza nada. Si una
   operación que debería fallar tiene éxito, es un bug de RLS.
3. **`user_id` sale siempre de la sesión**, nunca de un parámetro de UI.
4. **`001_initial_schema.sql` no se edita.** Los cambios van en `002_*.sql`.
5. **Los enums tienen nombre de Postgres**: `app_role`, `parking_session_status`.

## Documentación

| Documento | Para qué |
| --- | --- |
| [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) | Cómo está cableada la app y por qué |
| [`docs/DATABASE.md`](docs/DATABASE.md) | Tablas, RLS, constraints, matrices de permisos |
| [`docs/INTEGRATION_GUIDE.md`](docs/INTEGRATION_GUIDE.md) | **Empieza aquí si no eres Persona 1** |
| [`docs/TEST_PLAN.md`](docs/TEST_PLAN.md) | Qué está verificado y qué falta |
| [`docs/GITHUB_WORKFLOW.md`](docs/GITHUB_WORKFLOW.md) | Ramas, PRs, propiedad de ficheros |
| [`supabase/README.md`](supabase/README.md) | Configurar el proyecto de Supabase |
| [`AGENTS.md`](AGENTS.md) | Instrucciones para agentes de IA |

## Problemas frecuentes

| Síntoma | Causa probable | Solución |
| --- | --- | --- |
| "Faltan variables de entorno de Supabase" | No hay `.env`, o falta una de las dos | Copia `.env.example` y rellénalo; `npx expo start -c` |
| Los cambios en `.env` no se aplican | Metro cachea las variables | `npx expo start -c` |
| `relation "public.profiles" does not exist` | El SQL no está aplicado | `supabase/README.md` §2 |
| `new row violates row-level security policy` (42501) | Rol insuficiente | Necesitas `operator`/`admin` (`supabase/README.md` §7) |
| `Profiles is empty` | El trigger no existía al crear el usuario | Crea otro usuario tras aplicar `001` |
| "Correo o contraseña incorrectos" con la cuenta bien creada | Email sin confirmar | Revisa el correo; o desactiva "Confirm email" en desarrollo |
| Sesión perdida al reiniciar | Falta `storage: AsyncStorage` en el cliente | Revisa `src/lib/supabase.ts` |
| `401` o JWT caducado | Token vencido | `autoRefreshToken` lo resuelve; si persiste, logout/login |
| Error de tipos tras tocar el SQL | Los tipos quedaron desfasados | Regenera `database.types.ts` (ver `docs/DATABASE.md` §9) |
| Un módulo nativo no funciona en Expo Go | Expo Go no incluye ese módulo | Development build: `npx expo run:android` o EAS |

## Estado actual

**Verificado:**

- Typecheck (`tsc --noEmit`) sin errores.
- Lint (`expo lint`) sin errores ni avisos.
- 28 tests automáticos en verde (validación y mapeo de errores).

**No verificado — requiere credenciales reales:**

- Registro, login, logout contra un proyecto de Supabase real.
- Policies de RLS.
- Comportamiento de los tres roles.

El detalle está en [`docs/TEST_PLAN.md`](docs/TEST_PLAN.md). No afirmes que la
integración con Supabase funciona hasta ejecutar el bloque B de ese documento.