# Guía de integración — ParkEasy

Para Personas 2, 3, 4 y 5. contracts listos: no necesitas tocar `AuthContext`
ni `lib/supabase.ts` para construir tu módulo.

## 0. Regla de oro

> **No crees un segundo cliente de Supabase.** Importa siempre
> `import { supabase } from '@/lib/supabase'`. Dos instancias duplican el estado
> de sesión y producen behaviour distinto según qué pantalla se use.

Y la segunda:

> **RLS manda, no tu frontend.** Puedes ocultar un botón a un `user` porque
> queda feo, pero la operación *tiene* que fallar en la BD. Si una operación te
> sale bien con un rol que no debería poder hacerla, es un bug de RLS: dilo,
> no lo parchees en el cliente.

## 1. Imports que vas a usar

```ts
import { useAuth } from '@/hooks/useAuth'          // sesión, perfil, rol
import { supabase } from '@/lib/supabase'            // sólo si necesitas queries raw
import { translateError } from '@/lib/errors'        // errores → español
import type {
  ParkingLocation,
  ParkingSpace,
  ParkingSession,
  ParkingReminder,
} from '@/types/models'
```

`@/` apunta a `src/` (configurado en `tsconfig.json` y en Metro). Si un import
con `@/` falla, es que el fichero está fuera de `src/`.

---

## 2. Persona 2 — Diseño visual, welcome/login/registro, perfil

**Tus ficheros:** `src/app/(auth)/login.tsx`, `register.tsx`,
`src/app/(app)/profile/index.tsx`, `src/components/common/*`.

**Puedes reemplazar libremente** las tres pantallas y los tres componentes.
Lo único que no debe cambiar: las rutas `/login`, `/register`, `/profile`.

### Lo que ya está hecho y no debes rehacer

| Pieza | Dónde |
| --- | --- |
| Validación de email/nombre/password | `@/lib/validation` |
| Login / registro reales | `@/services/auth.service` |
| Mensajes de error en español | `@/lib/errors` → `translateError` |
| Detección de "pendiente de confirmar" | `signUp` devuelve `pending_confirmation` |
| Estado de sesión | `useAuth()` |

### Ejemplo: pantalla de login con tu diseño

```tsx
import { useState } from 'react'
import { Link } from 'expo-router'
import { Pressable, Text, TextInput, View } from 'react-native'

import { ROUTES } from '@/constants/routes'
import { useAuth } from '@/hooks/useAuth'
import { translateError } from '@/lib/errors'
import { isValidEmail, normalizeEmail } from '@/lib/validation'

export default function LoginScreen() {
  const { signIn } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSubmit = async () => {
    if (!isValidEmail(email)) {
      setError('Introduce un correo electrónico válido.')
      return
    }
    setError(null)
    setIsSubmitting(true)
    try {
      await signIn({ email: normalizeEmail(email), password })
      // No navigues: `Stack.Protected` del layout raíz redirige solo.
    } catch (err) {
      setError(translateError(err).message)
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <View>
      {/* tu UI */}
      <TextInput value={email} onChangeText={setEmail} keyboardType="email-address" />
      <TextInput value={password} onChangeText={setPassword} secureTextEntry />
      <Pressable onPress={handleSubmit} disabled={isSubmitting}>
        <Text>{isSubmitting ? 'Entrando…' : 'Entrar'}</Text>
      </Pressable>
      <Link href={ROUTES.register}><Text>Crear cuenta</Text></Link>
    </View>
  )
}
```

### Ejemplo: editar el perfil

```tsx
import { useState } from 'react'
import { updateMyProfile } from '@/services/profile.service'
import { translateError } from '@/lib/errors'
import { useAuth } from '@/hooks/useAuth'

const [fullName, setFullName] = useState(profile?.full_name ?? '')
const [phone, setPhone] = useState(profile?.phone ?? '')

const save = async () => {
  try {
    await updateMyProfile({ full_name: fullName, phone })
    await refreshProfile()   // de useAuth, para refrescar el contexto
  } catch (err) {
    setError(translateError(err).message)
  }
}
```

`updateMyProfile` **no** acepta `userId`: el id sale de la sesión verificada. No
hay forma de editar el perfil de otro usuario, ni por accidente.

### Lo que RLS te va a negar

Actualizar `id`, `created_at` o `updated_at` de tu perfil falla con 42501 aunque
lo intentes: los `GRANT` son por columna. Si necesitas añadir un campo al perfil
(especialmente el avatar), hay que añadirlo en `001` **y** en el `GRANT`:

```sql
grant update (full_name, phone, avatar_url, nuevo_campo) on public.profiles to authenticated;
```

> Ojo: `001` ya está aplicado y **no se edita**. Ese cambio va en un
> `supabase/migrations/002_*.sql`.

### Avatar

`avatar_url` es sólo una columna de texto. **No hay bucket de Storage
configurado.** Si decides implementar subida de imágenes, avisa al equipo
primero: crear el bucket es un cambio de infraestructura, no un frontend.

---

## 3. Persona 3 — Listado, filtros y administración de espacios

**Tus ficheros:** `src/app/(app)/parking/index.tsx`, y lo que crees debajo de
`src/app/(app)/parking/`.

**No toques:** `services/parking-locations.service.ts` ni
`services/parking-spaces.service.ts` sin avisar; los usan otros.

### API disponible

```ts
import {
  listLocations, getLocationById,
  createLocation, updateLocation, deactivateLocation,
} from '@/services/parking-locations.service'

import {
  listSpaces, getSpaceById,
  createSpace, updateSpace, setSpaceStatus, deactivateSpace,
} from '@/services/parking-spaces.service'
```

### Listar con filtros

```tsx
import { useEffect, useState } from 'react'
import { listSpaces } from '@/services/parking-spaces.service'
import { translateError } from '@/lib/errors'
import type { ParkingSpace, SpaceStatus } from '@/types/models'

const [status, setStatus] = useState<SpaceStatus | undefined>()

useEffect(() => {
  let cancelled = false

  const load = async () => {
    try {
      const { data } = await listSpaces({
        locationId,                       // opcional
        status,                           // 'available' | 'occupied' | 'maintenance'
        availableOnly: !status,           // atajo; si mandas `status`, gana `status`
        page: 1,
        pageSize: 20,
      })
      if (!cancelled) setSpaces(data)
    } catch (err) {
      if (!cancelled) setError(translateError(err).message)
    }
  }

  void load()
  return () => { cancelled = true }   // evita pintar en un componente ya desmontado
}, [locationId, status])
```

Todos los listados devuelven `Paginated<T>`:

```ts
interface Paginated<T> {
  data: T[]
  page: number
  pageSize: number
  total: number | null    // null si no se pidió el count
}
```

`total` es `null` a propósito: pedir el count exacto en cada cambio de filtro es
una consulta extra.

### Marcar el estado manual (operator/admin)

```tsx
import { setSpaceStatus } from '@/services/parking-spaces.service'
import { canManageSpaceStatus, SPACE_STATUS_LABELS } from '@/types/models'
import { useAuth } from '@/hooks/useAuth'

const { role } = useAuth()

const handleMark = async (id: string, status: SpaceStatus) => {
  try {
    const updated = await setSpaceStatus(id, status)
    // updated.status_updated_at / status_updated_by los puso el trigger.
  } catch (err) {
    setError(translateError(err).message)
  }
}

{canManageSpaceStatus(role) ? (
  <View>
    <Button title="Disponible" onPress={() => handleMark(space.id, 'available')} />
    <Button title="Ocupado" onPress={() => handleMark(space.id, 'occupied')} />
    <Button title="Mantenimiento" onPress={() => handleMark(space.id, 'maintenance')} />
  </View>
) : null}
```

`canManageSpaceStatus` sólo controla la **visibilidad** del botón. Si el rol no
tiene permiso, `setSpaceStatus` fallará con 42501 igual.

### Sobre el texto que muestras

El estado es **manual y puede estar desactualizado**. No lo presentes como
"disponibilidad en tiempo real". Algo honesto:

> "Marcado como disponible por última vez el 12 de marzo a las 14:30."

`status_updated_at` y `status_updated_by` están en la fila para eso.

### Desactivar vs borrar

```ts
await deactivateSpace(id)  // is_active = false. Recomendado.
await deleteSpace(id)      // Borrado real. Falla con 23503 si hay sesiones.
```

El 23503 no es un bug: la FK `session_space_fk` es `on delete no action` a
propósito, para que borrar un espacio no borre el historial de quien estacionó
ahí.

Usa `deleteSpace` sólo en un flujo administrativo explícito. Un borrado accidental
destruye el historial de Parking de quien estacionó allí.

---

## 4. Persona 4 — GPS, mapas, guardar y encontrar el vehículo

**Tu fichero:** `src/app/(app)/vehicle/index.tsx`.

**Regla:** este módulo **no** toca los servicios de otros. Usa
`@/services/parking-sessions.service`.

### Guardar dónde dejé el vehículo

```tsx
import * as Location from 'expo-location'

const save = async () => {
  // Persona 4 pide el permiso. Persona 1 no lo hace a propósito.
  const { status } = await Location.requestForegroundPermissionsAsync()
  if (status !== 'granted') {
    setError('Necesitamos tu ubicación para guardar dónde estacionaste.')
    return
  }

  const current = await Location.getCurrentPositionAsync({
    accuracy: Location.Accuracy.Balanced,
  })

  try {
    const session = await createParkingSession({
      latitude: current.coords.latitude,
      longitude: current.coords.longitude,
      accuracy_m: current.coords.accuracy ?? null,
      note: 'Comercial con la calle',
      // location_id / space_id son OPCIONALES: se puede guardar sólo GPS.
    })
    setActiveSession(session)
  } catch (err) {
    setError(translateError(err).message)
  }
}
```

Coordenadas ya validadas en el servicio (rango lat/lon) y otra vez en la BD
(CHECK). Las dos capas.

### Ver si ya tengo el auto estacionado

```tsx
import { getActiveParkingSession } from '@/services/parking-sessions.service'

useEffect(() => {
  void (async () => {
    const active = await getActiveParkingSession()
    setActiveSession(active)
  })()
}, [])
```

Devuelve `null` si no hay ninguna. **Asume que puede ser `null`**: el índice
único parcial garantiza como máximo una, no que haya una.

### Cerrar la sesión (recogí el coche)

```tsx
import { completeParkingSession } from '@/services/parking-sessions.service'

await completeParkingSession(activeSession.id)
```

Envía `status = 'completed'` y `ended_at` a la vez. El CHECK de la BD lo exige:
si mandas sólo uno, falla con 23514.

Si ya tienes una sesión activa e intentas crear otra, recibes 23505 con el
mensaje "Ya tienes una sesión activa". Muestra ese mensaje; no lo trates como
un bug.

### Reglas que no debes romper

- **Una sesión activa por usuario.** Always llama a `getActiveParkingSession()`
  antes de guardar.
- **No marques el espacio como ocupado.** Guardar una sesión **no** cambia
  `parking_spaces.status`. El estado lo marca una persona, no el GPS.
- **No inventes disponibilidad.** Si no sabes si el espacio está libre,
  `space_id = null` es una respuesta honesta.
- Mapas: `react-native-maps` necesita un development build; **no** funciona en
  Expo Go. Usa `npx expo run:android` o un build de EAS.

---

## 5. Persona 5 — Historial, CRUD y recordatorios

**Tu fichero:** `src/app/(app)/history/index.tsx`.

### Historial de sesiones

```tsx
import { listParkingSessions } from '@/services/parking-sessions.service'
import { format } from 'date-fns'   // o Intl.DateTimeFormat, lo que prefieras

const { data: sessions } = await listParkingSessions({
  status: 'completed',   // opcional: 'active' | 'completed'
  page: 1,
  pageSize: 20,
})
```

Ya viene ordenado por `parked_at` descendente. No hace falta reordenar.

### CRUD de sesiones propias

```ts
import {
  updateParkingSession,
  deleteParkingSession,
} from '@/services/parking-sessions.service'

await updateParkingSession(id, { note: 'Estacionado cerca del ascensor' })
await deleteParkingSession(id)
```

`updateParkingSession` no acepta `user_id`, ni `status`, ni `ended_at`. Para
cerrar hay que usar `completeParkingSession`. Es a propósito.

### Recordatorios

```tsx
import {
  listReminders, createReminder, markReminderAsSent, cancelReminder,
} from '@/services/reminders.service'

// Crear
const reminder = await createReminder({
  session_id: activeSession.id,
  title: 'Volver por el auto',
  remind_at: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
})

// Listar los que tocan
const due = await listDueReminders()   // status='pending' y remind_at <= ahora
```

**Lo que NO hace este servicio:** enviar nada. Poner
`markReminderAsSent(id)` escribe `status = 'sent'` en la BD y ya. La
notificación es cosa tuya.

### Programar notificaciones

Para que un recordatorio dispare aunque la app esté cerrada necesitas
`expo-notifications` + `expo-task-manager` o scheduling local. Instálalos con
`npx expo install expo-notifications expo-task-manager` y lee
https://docs.expo.dev/versions/latest/sdk/notifications antes: la API cambia
entre SDKs y **requiere development build**, no funciona en Expo Go.

Plan mínimo que funciona sin servidor:

1. `expo-notifications` con scheduling local para cada `remind_at`.
2. `listDueReminders()` al abrir la app como red de seguridad para los que se
   perdieron.
3. Marcar `sent` sólo **después** de que la API confirme que se agendó.

---

## 6. Cómo añadir una ruta sin romper la auth

### Ruta privada (dentro de `(app)/`)

1. Crea `src/app/(app)/nueva-ruta.tsx`.
2. Ya está protegida: el `Stack.Protected` del layout raíz cubre el grupo entero.
3. **Si quieres header**, añádela en `src/app/(app)/_layout.tsx`:
   ```tsx
   <Stack.Screen name="nueva-ruta" options={{ title: 'Mi Pantalla' }} />
   ```
   Si la olvidas, aparece sin header. No rompe nada, pero queda raro.

### Ruta pública (dentro de `(auth)/`)

Igual, pero en `src/app/(auth)/`.

### Ruta con nivel de rol

Anida otro `Stack.Protected` dentro del de `(app)`:

```tsx
<Stack.Protected guard={isAuthenticated}>
  <Stack.Screen name="(app)" />
</Stack.Protected>
```

Y para una ruta **de admin** dentro de `(app)/_layout.tsx`:

```tsx
const { role } = useAuth()
const isAdmin = role === 'admin'

<Stack.Protected guard={isAdmin}>
  <Stack.Screen name="admin/index" />
</Stack.Protected>
```

Recuerda: esto controla la **navegación**, no el acceso a los datos. Los datos
los protege RLS.

### Ruta nueva en el home

Añádela al array `MODULES` en `src/app/(app)/index.tsx` y a `ROUTES` en
`src/constants/routes.ts`. **No escribas el path a mano** en un `router.push`:
usa `ROUTES.x` para que un typo sea un error de compilación, no de runtime.

---

## 7. Quién es dueño de qué

| Fichero | Dueño | Qué NO hacer |
| --- | --- | --- |
| `src/lib/supabase.ts` | Persona 1 | No crear otro cliente |
| `src/contexts/AuthContext.tsx` | Persona 1 | No duplicar el estado de auth |
| `src/lib/errors.ts` | Persona 1 | No inventar otro mapeo |
| `src/lib/validation.ts` | Persona 1 | Puedes añadir helpers puros |
| `src/services/auth.service.ts` | Persona 1 | — |
| `src/services/profile.service.ts` | Persona 1 | Consumir, no editar |
| `src/services/parking-locations.service.ts` | Persona 1 | Consumir, no editar |
| `src/services/parking-spaces.service.ts` | Persona 1 | Consumir, no editar |
| `src/services/parking-sessions.service.ts` | Persona 1 | Consumir, no editar |
| `src/services/reminders.service.ts` | Persona 1 | Consumir, no editar |
| `src/types/database.types.ts` | Persona 1 | Sólo regenerar con la CLI |
| `src/constants/routes.ts` | Persona 1 | — |
| `src/app/(auth)/*` | **Persona 2** | No cambiar la lógica de submit |
| `src/app/(app)/profile/*` | **Persona 2** | — |
| `src/components/common/*` | **Persona 2** | Mantener los nombres de export |
| `src/app/(app)/parking/*` | **Persona 3** | — |
| `src/app/(app)/vehicle/*` | **Persona 4** | — |
| `src/app/(app)/history/*` | **Persona 5** | — |
| `src/app/_layout.tsx` | Persona 1 (coordina) | Persona 2 puede añadir providers |
| `supabase/migrations/*` | Persona 1 (coordina) | Migraciones aditivas, nunca editar `001` |

La regla práctica: **puedes añadir ficheros en tu carpeta y tocar tus
pantallas. Para tocar algo de otro, abre PR y avisa.**