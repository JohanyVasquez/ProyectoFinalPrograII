# Arquitectura — ParkEasy

Documento de Persona 1. Describe cómo está cableada la app y **por qué**.

## 1. Principios

1. **Una sola fuente de verdad del auth.** `AuthContext` es el único sitio que
   habla con `supabase.auth`. Las pantallas leen con `useAuth()`. Si dos
   pantallas maintainen su propio estado de sesión, inevitably divergen.
2. **La base de datos es la autoridad.** El frontend oculta botones por
   cortesía, pero **ocultar no es autorizar**. RLS es lo único que impide de
   verdad una operación indebida.
3. **Los errores técnicos no llegan al usuario.** `translateError()` convierte
   códigos SQLSTATE en español; el detalle queda en `technicalMessage`, que sólo
   se registra en desarrollo.
4. **Ninguna lógica de negocio en las pantallas provisionales.** Persona 1 deja
   interfaces de humo; la lógica vive en `src/services/`.

## 2. Árbol de ficheros

```text
src/
  app/                          # RUTAS. Cada fichero = una pantalla.
    _layout.tsx                 # AuthProvider + Stack.Protected (raíz)
    (auth)/
      _layout.tsx
      login.tsx                 # provisional (Persona 1 → Persona 2)
      register.tsx              # provisional
    (app)/
      _layout.tsx               # Header de las rutas privadas
      index.tsx                 # Home temporal con datos reales de sesión
      parking/index.tsx         # placeholder → Persona 3
      vehicle/index.tsx         # placeholder → Persona 4
      history/index.tsx         # placeholder → Persona 5
      profile/index.tsx         # provisional (Persona 1 → Persona 2)
  components/common/            # Componentes sustituibles
  contexts/AuthContext.tsx      # Fuente de verdad de auth
  hooks/useAuth.ts              # Reexporta el contexto
  lib/
    supabase.ts                 # Singleton del cliente
    errors.ts                   # Traducción de errores + AppError
    validation.ts               # Validación pura (testeable)
  services/                     # Acceso tipado a la BD (contratos del equipo)
  types/
    database.types.ts           # Refleja 001_initial_schema.sql
    models.ts                   # Alias + etiquetas en español
  constants/routes.ts           # Única fuente de verdad de paths
supabase/migrations/            # SQL (fuente de verdad del esquema)
```

## 3. Flujo de autenticación

### 3.1 Arranque

1. `src/app/_layout.tsx` monta `AuthProvider`.
2. `AuthProvider` arranca con `isLoading = true` **si** hay cliente Supabase.
   Ese `true` evita el *flash* de la pantalla privada antes de saber si hay
   sesión: sin él, la app mostraría un instante el login a un usuario que ya
   estaba autenticado.
3. Se leen claims con `getSession()` + `getClaims()`:
   - `getSession()` da el objeto `Session` desde AsyncStorage.
   - `getClaims()` valida el JWT contra el servidor. Si el token está caducado o
     manipulado, se descarta la sesión en vez de dejarla "aparentemente" activa.
4. Si hay sesión, se carga `profile` + `role` en paralelo.
5. Terminado, `isLoading = false` y el router decide qué grupo mostrar.

### 3.2 Cambio de sesión en caliente

`onAuthStateChange` se suscribe **una vez** y se libera al desmontar. Su callback
no hace `await`: la carga de perfil se dispara fuera. Además, `profileOwnerRef`
guarda para qué usuario se pidió el perfil; así una respuesta lenta de una
cuenta no se pinta encima de otra ya activa.

### 3.3 Protección de rutas

`Stack.Protected` en el layout raíz:

| Grupo | `guard` | Consecuencia |
| --- | --- | --- |
| `(auth)` | `!isAuthenticated` | Sólo visible sin sesión |
| `(app)` | `isAuthenticated` | Sólo visible con sesión |

Cuando un guard pasa de `true` a `false`, React Navigation elimina el historial
de esa pantalla: el usuario salta fuera de las rutas privadas al cerrar sesión.

> **Limitación conocida (SDK 57):** `Stack.Protected` acepta `guard` pero **no**
> `redirectTo`; esa prop es de SDK 58+. Cuando el guard es falso, React
> Navigation redirige a la **primera pantalla disponible** del stack.

### 3.3.1 Por qué no existe `src/app/index.tsx`

`src/app/(app)/index.tsx` ya produce la ruta `/`. Un `index.tsx` en la raíz
genera **una segunda ruta `/`** y, además, un `Redirect` a `/` sería un bucle
infinito.

Verificado con el mapa de rutas tipadas (`.expo/types/router.d.ts`), que
exponía `/` dos veces. Con el fichero eliminado, `/` aparece una sola vez,
como `${(app)}` | `/`.

El ancla de las rutas públicas la fija el **orden** de
`src/app/(auth)/_layout.tsx`: `login` se declara primero, así que es la
primera pantalla disponible cuando `(app)` queda deshabilitado. Si alguien
reordena ese layout, cambia el destino del redirect.

Consecuencia práctica: **no crees `src/app/index.tsx`.** Si alguna vez hace
falta una pantalla pública en la raíz, dale un path distinto (`/welcome`) y
declárala dentro de `(auth)`.

### 3.4 Registro con confirmación de correo

`signUp` tiene dos salidas, y la diferencia es real:

| Resultado | Significado | Qué hace la UI |
| --- | --- | --- |
| `registered` | Hay `Session` | El router entra a `(app)` |
| `pending_confirmation` | `session === null` | Mensaje "revisa tu correo" |

Saltarse la segunda rama deja al usuario en una pantalla privada que se vacía
sola al no existir sesión.

## 4. Decisiones y límites

| Decisión | Motivo | Coste |
| --- | --- | --- |
| Singleton de Supabase | Varias instancias duplican el estado de sesión | Acopla el módulo; unavoidable |
| `getClaims()` en vez de confiar en `getSession()` | Un JWT manipulado pasa `getSession()` | Un round-trip extra al arrancar |
| Columnas de UPDATE por `GRANT` + trigger guard | RLS **no** distingue columnas: sin `guard_space_update` un `operator` renombraría espacios | Dos mecanismos que deben mantenerse juntos |
| Índice parcial `one_active_session_per_user` | Garantiza una sola sesión activa en BD, no en el cliente | Actualización concurrente falla con 23505 |
| FK compuesta `(space_id, location_id)` | Obliga a que la ubicación sea la real del espacio | Borrar un espacio con sesiones falla (23503): usar `deactivateSpace` |
| Enums con el nombre de Postgres (`app_role`) | Los tipos generados reflejan la BD real | El nombre no es "bonito"; no lo renombres |
| Tests con el runner de Node | Sin Jest ni config extra en un proyecto que no lo pidió | No cubre componentes; cubre lógica pura |
| Sin librería de UI | Persona 2 es dueño del diseño | Pantallas provisionales son feas a propósito |

### Lo que NO existe (y por qué)

- **Sin Redux/Zustand.** `AuthContext` cubre el estado que hay. Añadir un store
  global sin necesidad crea dos fuentes de verdad.
- **Sin ORM ni backend Node.** Supabase es el backend. Un ORM delante de las
  políticas RLS estorbaría más de lo que aporta.
- **Sin tests de componentes.** Montar React Native en Node requiere una
  configuración que el proyecto no necesita para su alcance actual. Los tests
  cubren validación y errores, que es donde se esconden las regresiones.
- **Sin mocks de Supabase.** Un cliente simulado en producción daría falsa
  confianza: lo que se prueba no es la integración real.
- **Sin permisos de GPS en la parte 1.** Son de Persona 4.

## 5. Límites del alcance del proyecto

El estado de un espacio es **manual**: lo marca una persona y puede estar
desactualizado. No hay sensores, reservas, pagos ni lectura de matrículas. La
UI nunca debe presentar el estado de un espacio como disponibilidad en vivo.

Marcar un recordatorio como `sent` en la BD **no envía** ninguna notificación:
sólo registra que alguien dijo que se envió. La notificación real es de
Persona 5.
