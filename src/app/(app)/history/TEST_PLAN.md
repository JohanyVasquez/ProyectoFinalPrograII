# ParkEasy — Pruebas, manual y documentación de los Módulos 3, 4 y 5

| | |
| --- | --- |
| **Entregable de** | Persona 5 (Historial y recordatorios) |
| **Alcance** | Módulo 3 · Estacionamientos (Persona 3, Ashly) — Módulo 4 · GPS / vehículo (Persona 4, Analy) — Módulo 5 · Historial y recordatorios (Persona 5, Andris) |
| **Fecha** | 22/10/2026 |
| **Archivos** | `src/app/(app)/parking/index.tsx`, `src/app/(app)/vehicle/index.tsx`, `src/app/(app)/history/index.tsx` |

> **Regla de honestidad de este documento** (igual que `docs/TEST_PLAN.md`):
> los resultados marcados **PASS** son de pruebas que se ejecutaron de verdad
> en esta máquina. Todo lo que necesita credenciales reales de Supabase o un
> dispositivo con development build está en **PENDIENTE (NOT RUN)**. Nadie debe
> afirmar que la integración funciona hasta que alguien ejecute ese bloque.

---

## 0. Estado de la verificación

### 0.1 Verificaciones automatizadas — EJECUTADAS

| ID | Comando | Qué verifica | Resultado |
| --- | --- | --- | --- |
| V1 | `npm run lint` | ESLint (`expo lint`) sobre todo el proyecto | **PASS** — 0 errores, 0 avisos |
| V2 | `npm run typecheck` | `tsc --noEmit` con TypeScript 6 en modo estricto | **PASS** — 0 errores |
| V3 | `npm test` | `pretest` (typecheck de `tsconfig.test.json`) + 35 pruebas unitarias de `src/lib/*.test.ts` | **PASS** — 35/35, 0 fallos, 12 suites |

Ejecutado el 22/10/2026 sobre `main` con los tres módulos completados.

Estas tres verificaciones son las que exige `AGENTS.md` antes de declarar una
tarea terminada. Cubren sintaxis, tipos y la lógica pura (validaciones,
traducción de errores, teléfonos, coordenadas). **No** cubren la integración
con Supabase ni el comportamiento en dispositivo: eso es el bloque 0.2.

### 0.2 Verificaciones manuales — PENDIENTES (NOT RUN)

Requieren: (a) un proyecto Supabase real con `001_initial_schema.sql` aplicado
y al menos un usuario autenticado, y (b) la app corriendo en un dispositivo.
Verificado en la docs oficial de SDK 57: `expo-location`, `react-native-maps`,
`expo-notifications` (notificaciones locales) y `react-native-webview` **sí
están incluidos en Expo Go 57**, así que el bloque puede ejecutarse también
ahí; un development build (`npx expo start` + `run:android` / `run:ios`) sigue
siendo lo recomendable para la demo final. Ojo: el Expo Go de la Play Store
puede ser de SDK 58 y rechazar el proyecto (ver §6.1).

Todos los casos de los apartados 1, 2 y 3 con estado **PENDIENTE** forman
juntos este bloque. Se ejecutan siguiendo el guion del apartado 6.

Nota sobre Expo Go: `expo-location`, `react-native-maps` y `expo-notifications`
**no** existen en Expo Go (por eso hace falta development build);
`react-native-webview` sí está incluido, pero el mapa OSM de Android depende
también del resto del módulo.

---

## 1. Casos de prueba — Módulo 3 (Estacionamientos)

Pantalla: `src/app/(app)/parking/index.tsx`.

| ID | Caso | Pasos | Resultado esperado | Estado |
| --- | --- | --- | --- | --- |
| 3.1 | Listado de ubicaciones | Iniciar sesión con un `user` y abrir **Estacionamientos** | Se listan las ubicaciones visibles según RLS; cada tarjeta muestra nombre y dirección | PENDIENTE |
| 3.2 | Búsqueda | Escribir parte del nombre o de la dirección en **Buscar** | La lista se filtra al escribir (se llama `listLocations({search})`); al borrar el texto vuelve la lista completa | PENDIENTE |
| 3.3 | Ver espacios | Tocar una ubicación | Debajo aparece **ESPACIOS** con los códigos, nivel y estado de cada espacio | PENDIENTE |
| 3.4 | Filtro por estado | Con una ubicación seleccionada, tocar **Ocupado** / **Disponible** / **Mantenimiento** / **Todos** | La lista de espacios se refina al estado elegido (chip resaltado) | PENDIENTE |
| 3.5 | Cambio manual de estado (staff) | Entrar con `operator` o `admin`, tocar un botón de estado de un espacio | El estado de la etiqueta cambia al instante y **persiste al reabrir** (escritura real vía `setSpaceStatus`) | PENDIENTE |
| 3.6 | `user` sin botones de estado | Entrar con rol `user` y seleccionar una ubicación | Los espacios se leen con su estado, pero **no** aparecen botones de cambio (gateo con `canManageSpaceStatus`) | PENDIENTE |
| 3.7 | Sólo `admin` administra | Entrar con `operator` | **No** aparece la sección ADMINISTRACIÓN; con `admin` sí aparece (`canManageParkingCatalog`) | PENDIENTE |
| 3.8 | Crear ubicación válida | Como `admin`: **Registrar ubicación** → nombre, dirección, (lat, lng) opcionales → **Guardar ubicación** | El formulario se cierra, la ubicación nueva aparece en la lista sin recargar la pantalla | PENDIENTE |
| 3.9 | Coordenadas inválidas | En el mismo formulario escribir sólo latitud, o valores fuera de rango (`lat 200`) | Mensaje de validación en español; **no** se llama al servicio | PENDIENTE |
| 3.10 | Espacio con código duplicado | Como `admin`: **Registrar espacio** con un código que ya exista en esa ubicación | Error traducido (clave duplicada `spaces_location_code_key`), nunca un error crudo de Postgres | PENDIENTE |
| 3.11 | Estados vacíos | Usuario nuevo sin ubicaciones / ubicación sin espacios | Tarjetas "Sin estacionamientos registrados" y "Sin espacios para mostrar" con texto explicativo | PENDIENTE |
| 3.12 | Error + reintentar | Cortar la red y abrir la pantalla | Mensaje con `ErrorMessage` y botón **Reintentar** que vuelve a consultar | PENDIENTE |
| 3.13 | Una sesión no cambia estados | Con una sesión activa (módulo 4), revisar `parking_spaces.status` en Supabase | El estado del espacio **no cambió** por guardar o cerrar la sesión | PENDIENTE |
| 3.14 | RLS real | Con `user` no staff, ejecutar un `update` de estado desde el SQL Editor autenticado | La BD lo rechaza; la pantalla sólo **oculta** el botón, la seguridad está en RLS | PENDIENTE |

---

## 2. Casos de prueba — Módulo 4 (GPS / vehículo)

Pantalla: `src/app/(app)/vehicle/index.tsx`.

| ID | Caso | Pasos | Resultado esperado | Estado |
| --- | --- | --- | --- | --- |
| 4.1 | Permiso bajo demanda | Abrir **Mi vehículo** sin sesión activa | **No** aparece ningún diálogo de permisos hasta tocar el botón | PENDIENTE |
| 4.2 | Permiso concedido | Tocar **Guardar dónde dejé mi auto** y aceptar | Se pide el permiso una vez, luego se captura la posición y se muestra la vista previa con coordenadas, precisión y mapa | PENDIENTE |
| 4.3 | Permiso denegado | Rechazar el permiso | Mensaje explicativo en español; si el SO ya no permite volver a preguntar, aparece **Abrir ajustes de la app** | PENDIENTE |
| 4.4 | GPS apagado | Desactivar la ubicación del sistema y tocar el botón | Mensaje "La ubicación del dispositivo está desactivada…"; no se captura nada | PENDIENTE |
| 4.5 | Guardar sesión | Con vista previa visible, tocar **Confirmar y guardar** | Se inserta una fila en `parking_sessions` con `status = active`, `ended_at = null` y la nota escrita; la pantalla pasa a **ESTACIONAMIENTO ACTIVO** | PENDIENTE |
| 4.6 | Sólo una sesión activa | Con una sesión activa, intentar guardar otra (por ejemplo repitiendo el flujo tras reabrir) | Se muestra "Ya tienes un estacionamiento activo…" y **no** se crea una segunda fila (índice `one_active_session_per_user`) | PENDIENTE |
| 4.7 | Reapertura con sesión activa | Cerrar y reabrir la app con una sesión en curso | La pantalla muestra la sesión activa: fecha, coordenadas, precisión, nota y mapa con la marca | PENDIENTE |
| 4.8 | Encontrar mi vehículo | Tocar **Encontrar mi vehículo** | Se abre Google Maps (app o navegador) con la ruta hacia las coordenadas guardadas | PENDIENTE |
| 4.9 | Finalizar | Tocar **Finalizar estacionamiento** → confirmar | Diálogo de confirmación; al aceptar, `status = completed` y `ended_at` se escriben **juntos** y la pantalla vuelve al formulario | PENDIENTE |
| 4.10 | Cancelar al finalizar | En el diálogo, tocar **Cancelar** | No cambia nada en la BD | PENDIENTE |
| 4.11 | Cierre no toca espacios | Finalizar una sesión y revisar `parking_spaces.status` | El estado del espacio **no cambió** (nunca se llama a `setSpaceStatus` desde este módulo) | PENDIENTE |
| 4.12 | Nota demasiado larga | Escribir más de 1000 caracteres en la nota | El campo corta en 1000 (`maxLength`) y el servicio valida igual | PENDIENTE |
| 4.13 | Mapa en Android (OpenStreetMap) | Abrir la app en un build de Android con sesión activa o vista previa | El mapa se dibuja con los tiles de OpenStreetMap dentro de un WebView (Leaflet), con la marca "Mi vehículo" y la atribución "© Colaboradores de OpenStreetMap"; **no** necesita clave de Google Maps | PENDIENTE |
| 4.14 | Coordenadas imposibles | (Prueba de regresión de servicio) guardar `lat = 999` | Rechazo con mensaje "Las coordenadas no son válidas…" (cubierto también por la prueba unitaria de `areValidCoordinates`) | PASS (unitario) / PENDIENTE en app |
| 4.15 | Mapa sin conexión | Con el GPS apagado o en modo avión, abrir **Mi vehículo** con sesión activa | El área del mapa queda vacía (sin tiles), pero las coordenadas, "Encontrar mi vehículo" y "Finalizar" siguen funcionando (ver limitación L2) | PENDIENTE |
| 4.16 | Mapa en iOS | Abrir la app en un build de iOS | El mapa es Apple Maps (MapKit) con la marca del vehículo; no pide clave de Google | PENDIENTE |

---

## 3. Casos de prueba — Módulo 5 (Historial y recordatorios)

Pantalla: `src/app/(app)/history/index.tsx`.

| ID | Caso | Pasos | Resultado esperado | Estado |
| --- | --- | --- | --- | --- |
| 5.1 | Lista de sesiones | Abrir **Historial** con sesiones registradas | Sesiones ordenadas de más reciente a más antigua (`parked_at` desc), con fecha, estado, ubicación y duración si está cerrada | PENDIENTE |
| 5.2 | Paginación | Tener más de 20 sesiones y tocar **Cargar más** | Se añaden las siguientes 20 sin duplicados; el botón desaparece al llegar al final | PENDIENTE |
| 5.3 | Estado vacío | Usuario nuevo | Tarjeta "Aún no hay sesiones" con instrucción | PENDIENTE |
| 5.4 | Abrir detalle | Tocar una sesión | Se abre el modal con estado, fechas, duración, ubicación, coordenadas y precisión | PENDIENTE |
| 5.5 | Editar nota | En el modal, cambiar la nota y tocar **Guardar nota** | Aviso "Nota guardada."; el cambio **persiste al salir** y se refleja en la lista (via `updateParkingSession`) | PENDIENTE |
| 5.6 | Nota larga | Escribir más de 1000 caracteres | Validación local en español, sin llamada a la BD | PENDIENTE |
| 5.7 | Eliminar con confirmación | **Eliminar sesión** → **Aceptar** | La sesión desaparece de la lista; sus recordatorios también (FK `on delete cascade`) y sus notificaciones locales se cancelan | PENDIENTE |
| 5.8 | Eliminar cancelado | **Eliminar sesión** → **Cancelar** | No cambia nada | PENDIENTE |
| 5.9 | Crear recordatorio válido | En el modal: título, mensaje, fecha futura → **Programar recordatorio** | Aviso "Recordatorio guardado y programado."; fila `pending → sent` en BD y notificación local presente en `getAllScheduledNotificationsAsync()` | PENDIENTE |
| 5.10 | Fecha pasada o mal escrita | Escribir `01/01/2020 08:00` o `22-10-2026 18:30` | Mensaje "La fecha del recordatorio debe ser futura." / "Escribe la fecha como dd/mm/aaaa hh:mm." y no se crea nada | PENDIENTE |
| 5.11 | Atajos de tiempo | Tocar **+30 min** / **+1 h** / **+2 h** | El campo de fecha se rellena con esa hora futura | PENDIENTE |
| 5.12 | Sin permiso de notificaciones | Denegar el permiso de notificación y crear un recordatorio | La fila se crea igualmente con estado **Pendiente** y el aviso explica que no se pudo programar (el estado `sent` **no** se escribe) | PENDIENTE |
| 5.13 | Llegada de la notificación | Dejar el recordatorio a 1 minuto, app abierta en primer plano | Aparece la notificación con título y mensaje (handler de `expo-notifications`) | PENDIENTE |
| 5.14 | Recordatorio en background | Repetir 5.13 con la app en segundo plano o cerrada | El SO muestra la notificación programada | PENDIENTE |
| 5.15 | Cancelar recordatorio | Tocar **Cancelar recordatorio** → confirmar | Estado pasa a **Cancelado** y la notificación local desaparece de las programadas | PENDIENTE |
| 5.16 | Red de seguridad | Crear un recordatorio con permiso denegado, pasada la hora, conceder permiso y reabrir **Historial** | `syncDeviceReminders()` lo reintenta: se programa, se marca `sent` y aparece el aviso "Se programaron 1 recordatorio(s) en este dispositivo." | PENDIENTE |
| 5.17 | Título vacío | Crear recordatorio sin título | Validación local; en BD el CHECK daría 23514 (ver `docs/TEST_PLAN.md` B.5.19) | PENDIENTE |
| 5.18 | Sesión de otro usuario | Con la cuenta B, intentar crear un recordatorio sobre una sesión de A (SQL Editor) | Rechazo 42501 por el trigger `trg_parking_reminders_validate`; en la app, B **no ve** las sesiones de A | PENDIENTE |
| 5.19 | Historial aislado | Iniciar sesión con B tras usar A | B ve 0 sesiones y 0 recordatorios (políticas `*_own` + `user_id = auth.uid()`) | PENDIENTE |
| 5.20 | Error + reintentar | Cortar la red y abrir **Historial** | `ErrorMessage` con **Reintentar** que recarga listas y vuelve a intentar la red de seguridad | PENDIENTE |
| 5.21 | Editar recordatorio (modal) | En el modal de una sesión, tocar **Editar** en un recordatorio y cambiar hora/mensaje → **Guardar cambios** | La notificación anterior desaparece de `getAllScheduledNotificationsAsync()` y sólo queda la nueva; el estado vuelve a **Enviado** (o **Pendiente** si falla el agendado) | PENDIENTE |
| 5.22 | Editar desde la lista global | En **RECORDATORIOS**, tocar **Editar** | Se abre el detalle de la sesión correspondiente ya en modo **EDITAR RECORDATORIO** con el borrador precargado | PENDIENTE |
| 5.23 | Eliminar recordatorio | Tocar **Eliminar** → **Aceptar** | La fila desaparece de Supabase y su notificación programada se cancela; si la sesión de la tarjeta no está cargada, aviso "Para editar este recordatorio, abre la sesión…" (sólo aplica a Editar) | PENDIENTE |
| 5.24 | Tocar la notificación | Con Historial abierto, tocar la notificación al llegar la hora | Se abre el detalle de la sesión del recordatorio (data.sessionId, toque ≤ 5 min) | PENDIENTE |
| 5.25 | Reinstalación / otro dispositivo | Con recordatorios **Enviado** y futuros, reinstalar la app (o borrar datos) y abrir **Historial** | La sincronización repone los avisos perdidos en el dispositivo sin duplicar ni tocar la BD | PENDIENTE |
| 5.26 | Sin permiso, estado visible | Con permiso denegado (o Expo Go Android sin módulo), crear un recordatorio a +1 h | Tarjeta con línea "Sin notificación programada en este dispositivo", mensaje breve al intentar programarlo y **ningún aviso general al cargar Historial**; el resto sigue funcionando | PENDIENTE |
| 5.27 | Fecha pasada al editar | Editar un recordatorio y escribir una fecha pasada | "La fecha del recordatorio debe ser futura."; no se toca la BD ni la programación | PENDIENTE |

---

## 4. Manual básico de usuario

### 4.1 Estacionamientos (Módulo 3)

1. Abre la pestaña **Estacionamientos**.
2. **Buscar** filtra por nombre o dirección de la ubicación.
3. Toca una ubicación para ver sus espacios y sus estados
   (Disponible / Ocupado / Mantenimiento). El estado es **manual**: lo marca
   el personal y puede no reflejar la realidad.
4. Si eres **operador o administrador**, cada espacio muestra tres botones para
   cambiar su estado. El cambio se guarda al instante.
5. Si eres **administrador**, al final aparece **ADMINISTRACIÓN** con:
   - **Registrar ubicación**: nombre (obligatorio), dirección, descripción,
     latitud y longitud (las dos juntas o ninguna).
   - **Registrar espacio**: ubicación (chips), código (obligatorio), nivel y
     descripción. El estado inicial se elige con Disponible / Ocupado /
     Mantenimiento.

### 4.2 Mi vehículo (Módulo 4)

1. Abre la pestaña **Mi vehículo**.
2. Toca **Guardar dónde dejé mi auto** y acepta el permiso de ubicación.
   ParkEasy sólo pide el permiso en este momento.
3. Revisa la vista previa (coordenadas, precisión y mapa) y añade una nota si
   quieres ("Nivel 2, junto a la escalera"). En Android el mapa usa
   OpenStreetMap y necesita internet para dibujarse; en iOS usa Apple Maps.
4. **Confirmar y guardar** crea la sesión activa. Sólo puede haber **una**.
5. Con la sesión activa en pantalla:
   - **Encontrar mi vehículo** abre Google Maps con la ruta hasta tu coche.
   - **Finalizar estacionamiento** cierra la sesión (pide confirmación).
6. Si el GPS está apagado o el permiso fue denegado, la pantalla lo explica con
   un mensaje en español y, cuando ya no se puede volver a preguntar, ofrece
   **Abrir ajustes de la app**.

### 4.3 Historial y recordatorios (Módulo 5)

1. Abre la pestaña **Historial**. Verás tus sesiones, de la más reciente a la
   más antigua; **Cargar más** trae las siguientes.
2. Toca una sesión para ver el detalle en pantalla completa:
   - **NOTA**: se puede editar con **Guardar nota**.
   - **RECORDATORIOS DE ESTA SESIÓN**: los que ya existen, con su estado y la
     línea "Notificación programada en este dispositivo" cuando corresponde.
     Cada uno se puede **Cancelar** (deja de avisar), **Editar** (el formulario
     se precarga y al guardar se reprograma la notificación) y **Eliminar**
     (borra la fila y cancela su notificación; pide confirmación).
   - **NUEVO RECORDATORIO**: título, mensaje opcional y fecha
     (`dd/mm/aaaa hh:mm`). Viene precargado con un título y un mensaje
     adaptados a la ubicación; los botones **+30 min**, **+1 h** y **+2 h**
     rellenan la fecha por ti.
   - **ZONA DE RIESGO → Eliminar sesión**: pide confirmación y borra la sesión
     y sus recordatorios.
3. En la pantalla principal, la sección **RECORDATORIOS** lista todos tus
   avisos con las mismas acciones (Cancelar / Editar / Eliminar). **Editar**
   desde aquí abre el detalle de la sesión correspondiente en modo edición.
4. Cuando llegue la hora, el teléfono muestra la notificación aunque Historial
   no esté abierto. Si la tocas con el Historial en pantalla, se abre el
   detalle de ese estacionamiento.
5. Estados de un recordatorio:
   - **Pendiente**: guardado, pero sin notificación programada (permiso
     denegado o entorno sin módulo de notificaciones).
   - **Enviado**: la notificación quedó agendada en el dispositivo (o ya se
     disparó). Es el estado normal tras crearlo con permiso concedido.
   - **Cancelado**: ya no avisa.
6. Al abrir Historial se sincroniza el dispositivo con Supabase: se reponen
   avisos perdidos (reinstalación o cambio de dispositivo) y se limpian
   duplicados u obsoletos, sin crear notificaciones repetidas.

---

## 5. Explicación técnica

### 5.1 Archivos entregados

| Archivo | Módulo | Responsable |
| --- | --- | --- |
| `src/app/(app)/parking/index.tsx` | 3 · Estacionamientos | Persona 3 |
| `src/app/(app)/vehicle/index.tsx` | 4 · GPS / vehículo | Persona 4 |
| `src/app/(app)/history/index.tsx` | 5 · Historial y recordatorios | Persona 5 |
| `src/app/(app)/history/TEST_PLAN.md` | Documentación (este archivo) | Persona 5 |
| `package.json` / `package-lock.json` | 4 dependencias nativas nuevas | común |

No se tocó ningún archivo de Persona 1 ni Persona 2 (`src/services/`,
`src/lib/`, `src/contexts/`, `src/hooks/`, `src/types/`, `src/constants/`,
`src/components/common/`, `src/app/_layout.tsx`, `(app)/_layout.tsx`, perfil,
auth) ni `supabase/migrations/`.

### 5.2 Módulo 3 — cómo funciona

- `listLocations({ search, includeInactive })` con **debounce implícito** por
  estado: cada pulsación de tecla dispara un effect cancelable
  (`cancelled = true` en la limpieza) para que una respuesta tardía no pise a
  la reciente.
- `listSpaces({ locationId, status, includeInactive })` sólo cuando hay una
  ubicación seleccionada; `includeInactive` sólo para `admin`.
- Escrituras: `createLocation`, `createSpace` (sólo `admin`) y
  `setSpaceStatus` (staff). Cada una pasa por `translateError()` en caso de
  fallo; nunca se muestra un error crudo de Postgres.
- Gateo de UI con `canManageSpaceStatus(role)` y `canManageParkingCatalog(role)`
  procedentes de `useAuth()`. Es **sólo presentación**: la autorización real la
  dicta RLS (prueba 3.14).

### 5.3 Módulo 4 — cómo funciona

- Permiso con `Location.useForegroundPermissions()`; se pide sólo al tocar el
  botón. Antes se comprueba `hasServicesEnabledAsync()` para detectar el GPS
  apagado.
- Captura con `getCurrentPositionAsync({ accuracy: Accuracy.Balanced })`.
- Antes de insertar se llama a `getActiveParkingSession()`: si ya existe, se
  muestra en pantalla en lugar de intentar crear una segunda (el índice parcial
  `one_active_session_per_user` lo rechazaría con 23505).
- `createParkingSession({ latitude, longitude, accuracy_m, note })` — **sin**
  `location_id` ni `space_id`: la respuesta honesta de un guardado sólo por GPS
  es `space_id = null`, y una sesión jamás modifica
  `parking_spaces.status`.
- Cierre con `completeParkingSession(id)`, que manda `status` y `ended_at`
  juntos (CHECK `parking_sessions_status_time_check`).
- El mapa se elige por plataforma con `require()` perezoso (ningún módulo se
  carga donde no se usa, y así no se rompe el bundle de Expo Web):
  - **Android**: OpenStreetMap dentro de un `react-native-webview` con
    Leaflet (`buildOsmMapHtml`). Es **gratis y no necesita API key de Google**,
    que en Android es lo que exigiría `react-native-maps` (usa Google Maps SDK
    por debajo). Las coordenadas se inyectan con `toFixed(6)`, siempre como
    números.
  - **iOS**: Apple Maps con `react-native-maps` (`MapView` + `Marker`), gratis
    y sin clave.
  - **Web**: el módulo no se importa y la pantalla muestra las coordenadas en
    texto.
- "Encontrar mi vehículo" construye
  `https://www.google.com/maps/dir/?api=1&destination=lat,lng` y la abre con
  `Linking` (funciona sin ninguna clave de Google).

### 5.4 Módulo 5 — flujo de recordatorios y notificaciones

Sigue el "plan mínimo sin servidor" de `docs/INTEGRATION_GUIDE.md` §5:

```
Crear recordatorio
   │
   ├─1. ensureNotificationPermission()  → canal 'recordatorios' (Android 13+) + permiso
   ├─2. createReminder(...)             → fila en parking_reminders (status = pending)
   └─3. scheduleNotificationAsync({ type: DATE, date: remind_at })
            │
            ├─ OK  → markReminderAsSent(id)      ← SÓLO si el sistema confirmó
            └─ falla → la fila queda pending y se avisa en pantalla
```

- **`sent` significa "la notificación quedó agendada/disparada", no "el usuario
  la leyó".** `markReminderAsSent` sólo escribe la fila; la notificación real
  la emite `expo-notifications`.
- **Sincronización al abrir** (`syncDeviceReminders`): se comparan las filas
  con `getAllScheduledNotificationsAsync()`. Los `pending` sin aviso se
  programan y se marcan `sent` (los vencidos disparan de inmediato: es la red
  de seguridad); los `sent` futuros sin aviso (reinstalación o cambio de
  dispositivo) se reponen sin tocar la BD; se cancelan avisos de filas
  `cancelled`, duplicados y huérfanos (estos últimos sólo si la lista de
  Supabase está completa, sin cortar por paginación). Nunca duplica.
- **Edición**: `updateReminder` escribe la fila, se cancela la programación
  anterior y sólo entonces se agenda la nueva; si el agendado falla, la fila
  queda `pending` y se avisa en pantalla.
- **Cancelación limpia**: `cancelReminder` cambia el estado y además se
  recorren las notificaciones programadas (`getAllScheduledNotificationsAsync`)
  cancelando las cuyo `data.reminderId` coincide; **eliminar** un recordatorio
  borra la fila (`deleteReminder`) y después su aviso local; al **eliminar una
  sesión** se cancelan las de su `data.sessionId` (la BD ya borró las filas por
  cascada).
- **Al tocar la notificación**: el payload lleva `data.sessionId` y
  `data.url = '/history'`. Con Historial en pantalla, un toque reciente (≤ 5
  min) abre el detalle de la sesión vía `addNotificationResponseReceivedListener`
  + `getLastNotificationResponseAsync()` (con refs "al día" para no cerrar
  sesiones viejas). Abrir la app desde notificación estando **cerrada** navega
  a `/history` sólo si Persona 1 añade el observador estándar de dos pasos en
  `src/app/_layout.tsx` (fuera del alcance de este módulo).
- **`setNotificationHandler`** se instala en este módulo porque
  `src/app/_layout.tsx` pertenece a Persona 1; sólo se registra en
  plataformas nativas.
- **Detalle**: la edición de sesiones se limita a `note`, porque
  `updateParkingSession` excluye a propósito `user_id`, `status` y `ended_at`;
  para cerrar existe `completeParkingSession` (módulo 4).
- Nombres de ubicación: una sola consulta `listLocations({ includeInactive,
  pageSize: 100 })` al cargar; si falla, el historial sigue funcionando y se
  muestran coordenadas.

### 5.5 Seguridad (las 8 reglas innegociables)

1. Un único cliente Supabase: todo importa `@/lib/supabase` vía servicios.
2. RLS es la frontera; los permisos en UI son cortesía.
3. No hay claves de servicio en la app: sólo `EXPO_PUBLIC_*`.
4. `user_id` siempre de `getVerifiedUserId()` dentro de los servicios, nunca
   de la interfaz.
5. `001_initial_schema.sql` no se tocó.
6. Enums con sus nombres reales (`public.parking_session_status`, etc.).
7. Todo error pasa por `translateError()`.
8. Ningún Supabase simulado ni dato falso: los estados vacíos se muestran tal
   cual, sin relleno de ejemplo.

### 5.6 Dependencias añadidas

| Paquete | Versión | Módulo | Motivo |
| --- | --- | --- | --- |
| `expo-location` | ~57.0.22 | 4 | permiso y posición GPS |
| `react-native-maps` | 1.27.2 | 4 | mapa Apple Maps en iOS |
| `react-native-webview` | 13.16.1 | 4 | mapa OpenStreetMap (Leaflet) en Android |
| `expo-notifications` | ~57.0.24 | 5 | notificaciones locales programadas |

Instaladas con `npx expo install` (resuelve versiones compatibles con SDK 57).
Los cambios en `package.json` y `package-lock.json` **no se han commiteado**.

---

## 6. Instrucciones de demostración

### 6.1 Preparación (una sola vez)

```powershell
npm install
npx expo start -c          # -c obligatorio tras tocar .env
```

1. **Supabase**: proyecto real con `supabase/migrations/001_initial_schema.sql`
   aplicado y `.env` con `EXPO_PUBLIC_SUPABASE_URL` y
   `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY`.
2. **Usuarios de prueba** (ver `supabase/README.md`): uno `admin`, uno
   `operator` y uno `user`.
3. **Expo Go correcto en el teléfono**: el proyecto es de **SDK 57**, y el
   Expo Go de la Play Store ya es de SDK 58. Con la versión equivocada la app
   se queda en la pantalla de carga y el terminal muestra
   `Project is incompatible with this version of Expo Go`. Solución: desinstalar
   el Expo Go actual e instalar el de SDK 57 desde
   <https://expo.dev/go?sdkVersion=57&platform=android&device=true>.
4. **Development build** (opcional pero recomendado para la demo final; los
   módulos que usamos sí funcionan en Expo Go 57: `expo-location`,
   `react-native-maps`, `expo-notifications` locales y `react-native-webview`):
   ```powershell
   npx expo run:android     # o: npx expo run:ios
   ```
5. **Datos mínimos**: con la cuenta `admin`, crear una ubicación y dos o tres
   espacios desde la propia pantalla de Estacionamientos (esa es la mitad de la
   demo).

### 6.2 Guion de demo (~10 minutos)

| Min | Módulo | Qué mostrar |
| --- | --- | --- |
| 0–1 | 3 | Login como `admin` → **Estacionamientos**: buscar, abrir la ubicación, ver espacios |
| 1–2 | 3 | Cambiar un espacio a **Mantenimiento** y recargar para probar que persiste |
| 2–3 | 3 | **Registrar espacio** nuevo con el formulario; repetir como `user` para mostrar que desaparecen los botones |
| 3–5 | 4 | **Mi vehículo** → guardar ubicación con GPS real (emulador con ubicación simulada o celular) → nota → mapa con la marca |
| 5–6 | 4 | **Encontrar mi vehículo** (se abre Google Maps con la ruta) y **Finalizar estacionamiento** |
| 6–8 | 5 | **Historial**: abrir la sesión recién cerrada, editar la nota, crear un recordatorio a +1 min con los atajos |
| 8–9 | 5 | Esperar la notificación con la app abierta; cancelar otro recordatorio y mostrar el estado **Cancelado** |
| 9–10 | 5 | **Eliminar sesión** con su confirmación; mostrar que sus recordatorios desaparecen |

### 6.3 Cierre técnico para la sustentación

- Mostrar en Supabase las tablas `parking_locations`, `parking_spaces`,
  `parking_sessions` y `parking_reminders` con las filas creadas en vivo.
- Recordar: `parking_spaces.status` **no** cambió en ningún momento por las
  sesiones.
- Ejecutar en vivo `npm run lint && npm run typecheck && npm test` (aprox. 1
  minuto) y citar los 35 tests en verde.
- Enfatizar que el bloque manual de `docs/TEST_PLAN.md` sigue **NOT RUN** si
  nadie lo ha ejecutado con credenciales reales.

---

## 7. Limitaciones conocidas

| ID | Limitación | Impacto | Quién la resuelve |
| --- | --- | --- | --- |
| L1 | La app necesita un Expo Go **de SDK 57** o un development build; el Expo Go de SDK 58 de la Play Store rechaza el proyecto (`Project is incompatible with this version of Expo Go`) | Instalar Expo Go 57 desde <https://expo.dev/go?sdkVersion=57&platform=android&device=true> o subir el proyecto a SDK 58 (decisión del equipo) | Descarga directa del Expo Go 57; la subida a SDK 58 toca a Persona 1 |
| L2 | El mapa de Android (OpenStreetMap) carga sus tiles por internet desde el servidor público de OSM | Sin conexión el área del mapa sale vacía, aunque las coordenadas y "Encontrar mi vehículo" siguen funcionando; el servidor público de OSM es para uso moderado (demo/clase), no para producción masiva | Si el proyecto crece: proveedor de tiles propio o volver a Google Maps SDK con clave ( Persona 1 ) |
| L3 | `app.json` no personaliza los textos de permiso de `expo-location`/`expo-notifications` | Se usan los textos por defecto del plugin (se aplican en prebuild) | Persona 1, si quiere mensajes en español propios |
| L4 | Notificaciones **locales** únicamente: sin servidor ni push | Si el dispositivo se reinicia y nunca se vuelve a abrir la app, un recordatorio pendiente puede no reprogramarse hasta la próxima apertura | Red de seguridad al abrir la app (5.16); un push real sería otra iteración |
| L5 | El estado `sent` significa "notificación agendada/disparada", no "leída por el usuario" | Etiqueta "Enviado" antes de que suene el aviso | Decisión documentada (§5.4), coherente con la guía del equipo |
| L6 | Nombres de ubicación: se cargan los primeros 100 | Con más de 100 ubicaciones, algunas sesiones mostrarán coordenadas en vez de nombre | Aumentar paginación si hace falta |
| L7 | El historial pagina 20 en 20 y no guarda scroll ni filtros por estado | UX básica | Iteración futura |
| L8 | La fecha del recordatorio se escribe a mano (`dd/mm/aaaa hh:mm`) | No hay selector nativo de fecha sin añadir dependencias | `@react-native-community/datetimepicker` si el equipo lo aprueba |
| L9 | Web: no hay mapa, ni notificaciones, ni confirmaciones modales nativas | Los módulos están pensados para móvil; en web se degradan (coordenadas en texto, `window.confirm`) | Soporte web si se necesita |
| L10 | Sin pruebas de componentes (el proyecto sólo prueba `src/*.test.ts` con Node) | La UI se valida manualmente con los casos de los apartados 1–3 | El proyecto no tiene renderer de tests |
| L11 | Este documento **no** ejecuta pruebas de integración | Todos los casos PENDIENTE siguen sin ejecutarse | Ejecutar el bloque 0.2 con credenciales reales |

---

## 8. Cómo reproducir las verificaciones

```powershell
npm run lint        # V1 — ESLint
npm run typecheck   # V2 — TypeScript estricto
npm test            # V3 — typecheck de tests + 35 pruebas unitarias
```

Resultado esperado en esta entrega: **0 errores de lint, 0 errores de tipos,
35/35 pruebas en verde**. Si alguno falla, no se debe declarar terminada la
tarea.
