/**
 * Pantalla de historial y recordatorios (Persona 5).
 *
 * Qué hace:
 * - Lista las sesiones de estacionamiento del usuario (más reciente primero),
 *   con paginación y el nombre de la ubicación cuando existe.
 * - Detalle en modal: ver, editar la NOTA (`updateParkingSession`) y
 *   ELIMINAR la sesión (`deleteParkingSession`) con confirmación.
 * - Recordatorios por sesión: crear (`createReminder`), editar
 *   (`updateReminder`), cancelar (`cancelReminder`) y eliminar
 *   (`deleteReminder`), con notificación local agendada vía
 *   `expo-notifications`.
 *
 * Decisiones importantes (alineadas con `docs/INTEGRATION_GUIDE.md` §5):
 * - El estado `sent` se escribe SOLO después de que `scheduleNotificationAsync`
 *   confirma el agendado. Marcar `sent` en la BD no envía nada por sí solo.
 * - `syncDeviceReminders()` corre al abrir la pantalla: sincroniza Supabase con
 *   las notificaciones programadas en el dispositivo. Repone avisos perdidos
 *   por reinstalación o cambio de dispositivo, reintenta los `pending` vencidos
 *   y limpia duplicados u huérfanos. Nunca duplica: antes de reprogramar
 *   comprueba `getAllScheduledNotificationsAsync()`.
 * - Al EDITAR un recordatorio se invalida la programación anterior ANTES de
 *   agendar la nueva; al cancelar/eliminar se borra también el aviso local.
 * - Tocar una notificación con la app abierta en Historial abre el detalle de
 *   la sesión correspondiente (`data.sessionId`); el payload incluye también
 *   `data.url` por si Persona 1 añade el observador de notificaciones en el
 *   layout raíz para abrirla en frío.
 * - `setNotificationHandler` vive aquí porque `_layout.tsx` es de Persona 1.
 *
 * `expo-notifications` se carga con un `require` protegido: si el entorno no
 * trae su módulo nativo (Expo Go de Android cuyo binario es más viejo que
 * esta versión del paquete), Historial sigue funcionando y los recordatorios
 * quedan en PENDIENTES con un aviso claro, en vez de tumbar la pantalla.
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import {
  Alert,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native'
import { Stack } from 'expo-router'

import { ErrorMessage } from '@/components/common/ErrorMessage'
import { LoadingScreen } from '@/components/common/LoadingScreen'
import { translateError } from '@/lib/errors'
import { NOTE_MAX } from '@/lib/validation'
import { listLocations } from '@/services/parking-locations.service'
import {
  deleteParkingSession,
  listParkingSessions,
  updateParkingSession,
} from '@/services/parking-sessions.service'
import {
  cancelReminder,
  createReminder,
  deleteReminder,
  listReminders,
  markReminderAsSent,
  updateReminder,
} from '@/services/reminders.service'
import {
  REMINDER_STATUS_LABELS,
  SESSION_STATUS_LABELS,
  type ParkingReminder,
  type ParkingSession,
} from '@/types/models'
import { HIT_SLOP_MIN, colors, radius, spacing, typography } from '@/constants/theme'

type NotificationsApi = typeof import('expo-notifications')

/**
 * Carga protegida de `expo-notifications`. En Expo Go de Android, el binario
 * puede no incluir el módulo nativo `ExpoTopicSubscriptionModule` que esta
 * versión del paquete ejecuta al importarse (`index.js` reexporta
 * `topicSubscription`, que lo requiere en ámbito de módulo). El import estático
 * lanzaba `Cannot find native module 'ExpoTopicSubscriptionModule'`, la ruta
 * de Historial quedaba sin export por defecto y Expo Router se rompía con
 * `Cannot read property 'ErrorBoundary' of undefined`, afectando al resto de
 * pantallas. Con este guard, si el módulo no existe la pantalla sigue viva.
 */
function loadNotifications(): NotificationsApi | null {
  if (Platform.OS === 'web') return null
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports -- require protegido a propósito: un módulo nativo ausente no debe tumbar la pantalla.
    return require('expo-notifications') as NotificationsApi
  } catch {
    return null
  }
}

const notifications = loadNotifications()

/**
 * Muestra las notificaciones cuando la app está en primer plano. Se instala
 * desde este módulo porque el layout raíz pertenece a Persona 1.
 */
if (notifications) {
  notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldPlaySound: false,
      shouldSetBadge: false,
      shouldShowBanner: true,
      shouldShowList: true,
    }),
  })
}

const PAGE_SIZE = 20
const REMINDERS_PAGE_SIZE = 50
const SESSION_REMINDERS_PAGE_SIZE = 50
/** Tamaño de la consulta de sincronización con el dispositivo (máx. de BD: 100). */
const SYNC_PAGE_SIZE = 100
/** CHECK de la BD: `char_length(btrim(title)) between 1 and 120`. */
const REMINDER_TITLE_MAX = 120
/** Límite de convención del servicio (no hay CHECK en la BD). */
const REMINDER_MESSAGE_MAX = 500
const NOTIFICATION_CHANNEL_ID = 'recordatorios'
/** Título sugerido para recordatorios nuevos (el usuario puede editarlo). */
const DEFAULT_REMINDER_TITLE = 'ParkEasy — Recordatorio de estacionamiento'
/** Toca abrir el detalle si la notificación tocada tiene menos de 5 minutos. */
const RESPONSE_MAX_AGE_MS = 5 * 60_000
const QUICK_REMINDERS: { label: string; minutes: number }[] = [
  { label: '+30 min', minutes: 30 },
  { label: '+1 h', minutes: 60 },
  { label: '+2 h', minutes: 120 },
]

// ---------------------------------------------------------------------------
// Utilidades puras (sin React): el effect sólo hace setState.
// ---------------------------------------------------------------------------

function pad2(value: number): string {
  return String(value).padStart(2, '0')
}

function formatDateTime(iso: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return '—'
  return (
    `${pad2(date.getDate())}/${pad2(date.getMonth() + 1)}/${date.getFullYear()} ` +
    `${pad2(date.getHours())}:${pad2(date.getMinutes())}`
  )
}

function formatDuration(session: ParkingSession): string | null {
  if (!session.ended_at) return null
  const start = Date.parse(session.parked_at)
  const end = Date.parse(session.ended_at)
  if (Number.isNaN(start) || Number.isNaN(end) || end < start) return null
  const totalMinutes = Math.max(1, Math.round((end - start) / 60_000))
  const hours = Math.floor(totalMinutes / 60)
  const minutes = totalMinutes % 60
  return hours > 0 ? `${hours} h ${minutes} min` : `${minutes} min`
}

function formatCoordinates(session: ParkingSession): string {
  return `${session.latitude.toFixed(6)}, ${session.longitude.toFixed(6)}`
}

/** Texto del campo de fecha/hora: `dd/mm/aaaa hh:mm`. */
function formatDateTimeInput(date: Date): string {
  return (
    `${pad2(date.getDate())}/${pad2(date.getMonth() + 1)}/${date.getFullYear()} ` +
    `${pad2(date.getHours())}:${pad2(date.getMinutes())}`
  )
}

/** `null` si el texto no es una fecha válida (rechaza fechas que ruedan). */
function parseDateTimeInput(value: string): Date | null {
  const match = /^(\d{1,2})\/(\d{1,2})\/(\d{4})\s+(\d{1,2}):(\d{2})$/.exec(value.trim())
  if (!match) return null
  const day = Number(match[1])
  const month = Number(match[2])
  const year = Number(match[3])
  const hour = Number(match[4])
  const minute = Number(match[5])
  if (month < 1 || month > 12 || day < 1 || day > 31 || hour > 23 || minute > 59) return null
  const date = new Date(year, month - 1, day, hour, minute)
  if (
    date.getFullYear() !== year ||
    date.getMonth() !== month - 1 ||
    date.getDate() !== day ||
    date.getHours() !== hour ||
    date.getMinutes() !== minute
  ) {
    return null
  }
  return date
}

/** Confirmación nativa; en web usa `window.confirm`. */
async function confirmAction(title: string, message: string): Promise<boolean> {
  if (Platform.OS === 'web') {
    const confirmFn = (globalThis as { confirm?: (text: string) => boolean }).confirm
    return confirmFn ? confirmFn(`${title}\n\n${message}`) : false
  }
  return new Promise((resolve) => {
    Alert.alert(title, message, [
      { text: 'Cancelar', style: 'cancel', onPress: () => resolve(false) },
      { text: 'Aceptar', style: 'destructive', onPress: () => resolve(true) },
    ])
  })
}

/** Texto por defecto del campo "cuándo": `minutes` a partir de ahora. */
function reminderWhenIn(minutes: number): string {
  return formatDateTimeInput(new Date(Date.now() + minutes * 60_000))
}

type ReminderDraft = { title: string; message: string; when: string }

/** Resultado de validar el formulario de recordatorio. */
type DraftValidation =
  | { ok: true; title: string; message: string; remindAt: Date }
  | { ok: false; error: string }

/** Valida título, mensaje y fecha futura del borrador del formulario. */
function validateDraft(draft: ReminderDraft): DraftValidation {
  const title = draft.title.trim()
  const message = draft.message.trim()
  if (title.length === 0 || title.length > REMINDER_TITLE_MAX) {
    return { ok: false, error: `El título debe tener entre 1 y ${REMINDER_TITLE_MAX} caracteres.` }
  }
  if (message.length > REMINDER_MESSAGE_MAX) {
    return { ok: false, error: `El mensaje no puede superar ${REMINDER_MESSAGE_MAX} caracteres.` }
  }
  const remindAt = parseDateTimeInput(draft.when)
  if (!remindAt) {
    return { ok: false, error: 'Escribe la fecha como dd/mm/aaaa hh:mm.' }
  }
  if (remindAt.getTime() <= Date.now()) {
    return { ok: false, error: 'La fecha del recordatorio debe ser futura.' }
  }
  return { ok: true, title, message, remindAt }
}

/** Borrador por defecto para un recordatorio nuevo, adaptado a la ubicación. */
function defaultReminderDraft(locationName?: string): ReminderDraft {
  return {
    title: DEFAULT_REMINDER_TITLE,
    message: `Recuerda revisar tu vehículo estacionado en ${locationName ?? 'el estacionamiento registrado'}.`,
    when: reminderWhenIn(30),
  }
}

/** Borrador precargado a partir de un recordatorio existente (para editar). */
function reminderDraftFromReminder(reminder: ParkingReminder): ReminderDraft {
  return {
    title: reminder.title,
    message: reminder.message ?? '',
    when: formatDateTimeInput(new Date(reminder.remind_at)),
  }
}

/**
 * `true` si el recordatorio aún puede gestionarse (editar/cancelar):
 * los `pending` siempre; los `sent` sólo mientras su hora no haya pasado.
 */
function reminderIsManageable(reminder: ParkingReminder): boolean {
  if (reminder.status === 'cancelled') return false
  if (reminder.status === 'pending') return true
  return Date.parse(reminder.remind_at) > Date.now()
}

/** Línea de estado del aviso en el dispositivo, o `null` si no aplica. */
function deviceScheduleLabel(
  reminder: ParkingReminder,
  scheduledIds: ReadonlySet<string>,
): string | null {
  if (reminder.status !== 'sent') return null
  if (scheduledIds.has(reminder.id)) return 'Notificación programada en este dispositivo.'
  if (Date.parse(reminder.remind_at) > Date.now()) {
    return 'Sin notificación programada en este dispositivo (revisa los permisos).'
  }
  return null
}

function notificationData(request: import('expo-notifications').NotificationRequest): {
  reminderId?: string
  sessionId?: string
} {
  const raw = request.content.data
  if (!raw || typeof raw !== 'object') return {}
  return {
    reminderId: typeof raw.reminderId === 'string' ? raw.reminderId : undefined,
    sessionId: typeof raw.sessionId === 'string' ? raw.sessionId : undefined,
  }
}

/** Crea el canal (Android 13+) y pide permiso de notificaciones. */
async function ensureNotificationPermission(): Promise<boolean> {
  if (Platform.OS === 'web') return false
  if (!notifications) return false
  if (Platform.OS === 'android') {
    try {
      await notifications.setNotificationChannelAsync(NOTIFICATION_CHANNEL_ID, {
        name: 'Recordatorios',
        importance: notifications.AndroidImportance.HIGH,
        vibrationPattern: [0, 250, 250, 250],
      })
    } catch {
      // Sin canal propio el sistema usa el canal por defecto.
    }
  }
  try {
    const current = await notifications.getPermissionsAsync()
    if (current.granted) return true
    const requested = await notifications.requestPermissionsAsync()
    return requested.granted
  } catch {
    return false
  }
}

/** Devuelve `true` sólo si el sistema confirmó el agendado. */
async function scheduleReminderNotification(
  reminder: Pick<ParkingReminder, 'id' | 'session_id' | 'title' | 'message'>,
  remindAt: Date,
): Promise<boolean> {
  if (Platform.OS === 'web') return false
  if (!notifications) return false
  try {
    await notifications.scheduleNotificationAsync({
      content: {
        title: reminder.title,
        body: reminder.message ?? 'Es hora de volver por tu vehículo.',
        data: {
          reminderId: reminder.id,
          sessionId: reminder.session_id,
          // Reservado para el observador de notificaciones del layout raíz
          // (Persona 1): con `router.push(data.url)` abriría Historial.
          url: '/history',
        },
      },
      trigger: {
        type: notifications.SchedulableTriggerInputTypes.DATE,
        date: remindAt,
        ...(Platform.OS === 'android' ? { channelId: NOTIFICATION_CHANNEL_ID } : {}),
      },
    })
    return true
  } catch {
    return false
  }
}

async function cancelScheduledForReminder(reminderId: string): Promise<void> {
  if (Platform.OS === 'web') return
  if (!notifications) return
  try {
    const scheduled = await notifications.getAllScheduledNotificationsAsync()
    for (const request of scheduled) {
      if (notificationData(request).reminderId === reminderId) {
        await notifications.cancelScheduledNotificationAsync(request.identifier)
      }
    }
  } catch {
    // Si el sistema no responde, la notificación queda huérfana pero la BD ya
    // está en un estado coherente.
  }
}

async function cancelScheduledForSession(sessionId: string): Promise<void> {
  if (Platform.OS === 'web') return
  if (!notifications) return
  try {
    const scheduled = await notifications.getAllScheduledNotificationsAsync()
    for (const request of scheduled) {
      if (notificationData(request).sessionId === sessionId) {
        await notifications.cancelScheduledNotificationAsync(request.identifier)
      }
    }
  } catch {
    // Igual que arriba: no bloquea la operación principal.
  }
}

/** Identificadores de `reminderId` de los avisos programados en el dispositivo. */
async function getDeviceScheduledReminderIds(): Promise<ReadonlySet<string>> {
  if (Platform.OS === 'web' || !notifications) return new Set()
  try {
    const scheduled = await notifications.getAllScheduledNotificationsAsync()
    const ids = new Set<string>()
    for (const request of scheduled) {
      const reminderId = notificationData(request).reminderId
      if (reminderId) ids.add(reminderId)
    }
    return ids
  } catch {
    return new Set()
  }
}

/** `true` si la respuesta de notificación es reciente (misma sesión de uso). */
function isRecentNotificationResponse(response: import('expo-notifications').NotificationResponse): boolean {
  const time = response.notification.date
  if (!Number.isFinite(time)) return true
  return Date.now() - time <= RESPONSE_MAX_AGE_MS
}

interface DeviceSyncResult {
  /** Recordatorios (re)programados en el dispositivo. */
  rescheduled: number
  /** Avisos del dispositivo cancelados (duplicados u huérfanos). */
  cleaned: number
}

/**
 * Sincroniza Supabase con las notificaciones programadas en el dispositivo
 * (red de seguridad de guide §5.2 + reinstalaciones/cambios de dispositivo):
 * - `pending` sin aviso programado → se programa y se marca `sent` (la hora
 *   pasada dispara de inmediato; es el reintento de los vencidos).
 * - `sent` con fecha futura sin aviso (p. ej. tras reinstalar) → se repone.
 * - `cancelled` y duplicados → se cancelan del dispositivo.
 * - Avisos cuyo recordatorio ya no existe → se limpian, sólo si la lista
 *   recibida es completa (no truncada por paginación).
 * Nunca duplica: sólo programa cuando el dispositivo no tiene ya ese aviso.
 *
 * Si el entorno no soporta notificaciones (Expo Go de Android sin el módulo
 * nativo, web o permiso denegado) se sale SIN reintentar nada y sin contar
 * fallos: los recordatorios siguen en Supabase y la pantalla no muestra
 * avisos persistentes por eso.
 */
async function syncDeviceReminders(
  reminders: ParkingReminder[],
  options: { isCompleteList: boolean },
): Promise<DeviceSyncResult> {
  const result: DeviceSyncResult = { rescheduled: 0, cleaned: 0 }
  const now = Date.now()

  if (Platform.OS === 'web' || !notifications) return result

  try {
    const permission = await notifications.getPermissionsAsync()
    if (!permission.granted) return result

    const scheduled = await notifications.getAllScheduledNotificationsAsync()
    const scheduledByReminder = new Map<string, string[]>()
    for (const request of scheduled) {
      const reminderId = notificationData(request).reminderId
      if (!reminderId) continue
      const identifiers = scheduledByReminder.get(reminderId) ?? []
      identifiers.push(request.identifier)
      scheduledByReminder.set(reminderId, identifiers)
    }

    for (const reminder of reminders) {
      const identifiers = scheduledByReminder.get(reminder.id) ?? []

      if (reminder.status === 'cancelled') {
        for (const identifier of identifiers) {
          await notifications.cancelScheduledNotificationAsync(identifier)
          result.cleaned += 1
        }
        continue
      }

      // Duplicados históricos: queda sólo el primer aviso.
      for (const identifier of identifiers.slice(1)) {
        await notifications.cancelScheduledNotificationAsync(identifier)
        result.cleaned += 1
      }

      const remindAt = Date.parse(reminder.remind_at)
      const hasNotice = identifiers.length > 0

      if (reminder.status === 'sent') {
        // "Enviado" con hora futura sin aviso local: se repone sin tocar la BD.
        if (!hasNotice && remindAt > now) {
          const scheduledOk = await scheduleReminderNotification(reminder, new Date(remindAt))
          if (scheduledOk) result.rescheduled += 1
        }
        continue
      }

      // status === 'pending'
      if (!hasNotice) {
        const scheduledOk = await scheduleReminderNotification(reminder, new Date(remindAt))
        if (scheduledOk) {
          await markReminderAsSent(reminder.id)
          result.rescheduled += 1
        }
      } else if (remindAt <= now) {
        // Ya tenía aviso programado pero la hora pasó: sólo sincronizar estado.
        await markReminderAsSent(reminder.id)
      }
    }

    if (options.isCompleteList) {
      const knownIds = new Set(reminders.map((reminder) => reminder.id))
      for (const request of scheduled) {
        const reminderId = notificationData(request).reminderId
        if (reminderId && !knownIds.has(reminderId)) {
          await notifications.cancelScheduledNotificationAsync(request.identifier)
          result.cleaned += 1
        }
      }
    }
  } catch {
    // Best-effort: un fallo del sistema de notificaciones no rompe el historial.
  }
  return result
}

/** Nombres de ubicación para enriquecer el historial (best-effort). */
async function loadLocationNames(): Promise<Record<string, string>> {
  try {
    const result = await listLocations({ includeInactive: true, pageSize: 100 })
    const names: Record<string, string> = {}
    for (const location of result.data) {
      names[location.id] = location.name
    }
    return names
  } catch {
    // El nombre es cosmético: el historial no debe fallar por eso.
    return {}
  }
}

// ---------------------------------------------------------------------------
// Pantalla
// ---------------------------------------------------------------------------

export default function HistoryScreen() {
  const [sessions, setSessions] = useState<ParkingSession[]>([])
  const [sessionsPage, setSessionsPage] = useState(1)
  const [sessionsTotal, setSessionsTotal] = useState<number | null>(null)
  const [reminders, setReminders] = useState<ParkingReminder[]>([])
  const [locationsById, setLocationsById] = useState<Record<string, string>>({})

  const [isLoading, setIsLoading] = useState(true)
  const [refreshToken, setRefreshToken] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [listBusy, setListBusy] = useState<'more' | 'cancel' | 'delete' | null>(null)
  /** Recordatorios con un aviso programado EN ESTE dispositivo. */
  const [scheduledReminderIds, setScheduledReminderIds] = useState<ReadonlySet<string>>(
    new Set(),
  )

  // Detalle de sesión (modal)
  const [selected, setSelected] = useState<ParkingSession | null>(null)
  const [sessionReminders, setSessionReminders] = useState<ParkingReminder[]>([])
  const [noteDraft, setNoteDraft] = useState('')
  const [reminderDraft, setReminderDraft] = useState<ReminderDraft>({
    title: '',
    message: '',
    when: '',
  })
  /** Recordatorio que se está editando en el formulario, o `null` si es nuevo. */
  const [editingReminderId, setEditingReminderId] = useState<string | null>(null)
  const [modalBusy, setModalBusy] = useState<'note' | 'delete' | 'reminder' | null>(null)
  const [modalError, setModalError] = useState<string | null>(null)
  const [modalNotice, setModalNotice] = useState<string | null>(null)

  const locationNameFor = (session: ParkingSession): string | undefined =>
    session.location_id ? locationsById[session.location_id] : undefined

  // Refs "al día" para el manejo de toques de notificación (sincronizadas en
  // un effect más abajo; nunca se lee `sessions`/`openSession` en closures
  // viejas del listener).
  const sessionsRef = useRef<ParkingSession[]>([])
  const openSessionRef = useRef<
    ((session: ParkingSession, editReminder?: ParkingReminder) => Promise<void>) | null
  >(null)
  /** Sesión pendiente de abrir cuando el toque llega antes de cargar la lista. */
  const pendingOpenRef = useRef<string | null>(null)

  const hasMore = sessionsTotal != null && sessions.length < sessionsTotal

  // Carga inicial (y recarga vía `refreshToken`). Todo el estado vive dentro
  // del loader asíncrono definido en el effect: nunca es síncrono.
  useEffect(() => {
    let cancelled = false
    const load = async () => {
      try {
        const [sessionsResult, remindersResult, locationNames, syncListResult] = await Promise.all(
          [
            listParkingSessions({ page: 1, pageSize: PAGE_SIZE }),
            listReminders({ page: 1, pageSize: REMINDERS_PAGE_SIZE }),
            loadLocationNames(),
            listReminders({ page: 1, pageSize: SYNC_PAGE_SIZE }),
          ],
        )

        // Sincroniza el dispositivo con la BD (reintenta vencidos, repone
        // avisos perdidos tras reinstalar y limpia duplicados u huérfanos).
        const sync = await syncDeviceReminders(syncListResult.data, {
          isCompleteList: (syncListResult.total ?? 0) <= syncListResult.data.length,
        })

        let finalReminders = remindersResult.data
        if (sync.rescheduled > 0) {
          try {
            finalReminders = (await listReminders({ page: 1, pageSize: REMINDERS_PAGE_SIZE })).data
          } catch {
            // La lista anterior sigue siendo válida para mostrar.
          }
        }
        const deviceIds = await getDeviceScheduledReminderIds()
        if (cancelled) return

        setSessions(sessionsResult.data)
        setSessionsPage(sessionsResult.page)
        setSessionsTotal(sessionsResult.total)
        setReminders(finalReminders)
        setLocationsById(locationNames)
        setScheduledReminderIds(deviceIds)
        setError(null)

        // Un toque de notificación previo a la carga abre su sesión ya visible.
        const pendingOpenId = pendingOpenRef.current
        if (pendingOpenId) {
          const session = sessionsResult.data.find((item) => item.id === pendingOpenId)
          if (session) {
            pendingOpenRef.current = null
            void openSessionRef.current?.(session)
          }
        }

        // Al entrar NO se muestra ningún cuadro de avisos en la parte superior:
        // SESIONES aparece directo bajo el encabezado de Historial. El manejo
        // interno de la sincronización de notificaciones sigue intacto.
        setNotice(null)
      } catch (loadError) {
        if (!cancelled) setError(translateError(loadError).message)
      } finally {
        if (!cancelled) setIsLoading(false)
      }
    }
    void load()
    return () => {
      cancelled = true
    }
  }, [refreshToken])

  const handleRetry = () => {
    setIsLoading(true)
    setNotice(null)
    setRefreshToken((token) => token + 1)
  }

  const refreshReminderLists = useCallback(async (sessionId?: string) => {
    const [globalList, sessionList] = await Promise.all([
      listReminders({ page: 1, pageSize: REMINDERS_PAGE_SIZE }),
      sessionId
        ? listReminders({ sessionId, pageSize: SESSION_REMINDERS_PAGE_SIZE })
        : Promise.resolve(null),
    ])
    setReminders(globalList.data)
    if (sessionList) setSessionReminders(sessionList.data)
  }, [])

  // ------------------------------------------------------------------
  // Paginación del historial
  // ------------------------------------------------------------------
  const handleLoadMore = async () => {
    if (listBusy) return
    setListBusy('more')
    try {
      const result = await listParkingSessions({
        page: sessionsPage + 1,
        pageSize: PAGE_SIZE,
      })
      setSessions((current) => [...current, ...result.data])
      setSessionsPage(result.page)
      setSessionsTotal(result.total)
      setError(null)
    } catch (loadError) {
      setError(translateError(loadError).message)
    } finally {
      setListBusy(null)
    }
  }

  // ------------------------------------------------------------------
  // Detalle de sesión
  // ------------------------------------------------------------------
  const openSession = useCallback(
    async (session: ParkingSession, editReminder?: ParkingReminder) => {
      const locationName = session.location_id ? locationsById[session.location_id] : undefined
      setSelected(session)
      setNoteDraft(session.note ?? '')
      setEditingReminderId(editReminder?.id ?? null)
      setReminderDraft(
        editReminder ? reminderDraftFromReminder(editReminder) : defaultReminderDraft(locationName),
      )
      setSessionReminders([])
      setModalError(null)
      setModalNotice(null)
      setNotice(null)
      try {
        const result = await listReminders({
          sessionId: session.id,
          pageSize: SESSION_REMINDERS_PAGE_SIZE,
        })
        setSessionReminders(result.data)
      } catch (loadError) {
        setModalError(translateError(loadError).message)
      }
    },
    [locationsById],
  )

  // Mantiene al día las refs usadas por el listener de notificaciones
  // (patrón "latest ref": el listener no arrastra closures viejas).
  useEffect(() => {
    sessionsRef.current = sessions
    openSessionRef.current = openSession
  }, [sessions, openSession])

  // Tocar una notificación de ParkEasy abre el detalle de la sesión
  // correspondiente. Sólo reacciona a toques recientes para no reabrir
  // detalles antiguos al visitar la pantalla.
  useEffect(() => {
    if (!notifications) return undefined
    let alive = true
    const handleResponse = (response: import('expo-notifications').NotificationResponse | null) => {
      if (!response || !isRecentNotificationResponse(response)) return
      const sessionId = notificationData(response.notification.request).sessionId
      if (!sessionId) return
      const session = sessionsRef.current.find((item) => item.id === sessionId)
      if (session) void openSessionRef.current?.(session)
      else pendingOpenRef.current = sessionId
    }
    const subscription = notifications.addNotificationResponseReceivedListener((response) =>
      handleResponse(response),
    )
    void notifications.getLastNotificationResponseAsync().then((response) => {
      if (alive) handleResponse(response ?? null)
    })
    return () => {
      alive = false
      subscription.remove()
    }
  }, [])

  const closeModal = () => {
    if (modalBusy) return
    setSelected(null)
    setSessionReminders([])
    setEditingReminderId(null)
    setModalError(null)
    setModalNotice(null)
  }

  const handleSaveNote = async () => {
    if (!selected || modalBusy) return
    if (noteDraft.trim().length > NOTE_MAX) {
      setModalError(`La nota no puede superar ${NOTE_MAX} caracteres.`)
      return
    }
    setModalBusy('note')
    setModalError(null)
    setModalNotice(null)
    try {
      const updated = await updateParkingSession(selected.id, {
        note: noteDraft.trim().length > 0 ? noteDraft.trim() : null,
      })
      setSelected(updated)
      setSessions((current) =>
        current.map((session) => (session.id === updated.id ? updated : session)),
      )
      setModalNotice('Nota guardada.')
    } catch (saveError) {
      setModalError(translateError(saveError).message)
    } finally {
      setModalBusy(null)
    }
  }

  const handleDeleteSession = async () => {
    if (!selected || modalBusy) return
    const confirmed = await confirmAction(
      'Eliminar sesión',
      'Se eliminará esta sesión del historial junto con sus recordatorios. No se puede deshacer.',
    )
    if (!confirmed) return

    const sessionId = selected.id
    setModalBusy('delete')
    setModalError(null)
    try {
      await deleteParkingSession(sessionId)
      // La BD borra los recordatorios en cascada; aquí se limpian sus
      // notificaciones locales para no dejar avisos huérfanos.
      await cancelScheduledForSession(sessionId)
      setScheduledReminderIds(await getDeviceScheduledReminderIds())
      setSessions((current) => current.filter((session) => session.id !== sessionId))
      setReminders((current) => current.filter((reminder) => reminder.session_id !== sessionId))
      setSessionsTotal((total) => (total == null ? total : Math.max(0, total - 1)))
      setSelected(null)
      setSessionReminders([])
      setNotice('Sesión eliminada del historial.')
    } catch (deleteError) {
      setModalError(translateError(deleteError).message)
    } finally {
      setModalBusy(null)
    }
  }

  // ------------------------------------------------------------------
  // Recordatorios
  // ------------------------------------------------------------------
  const handleCreateReminder = async () => {
    if (!selected || modalBusy) return

    const draft = validateDraft(reminderDraft)
    if (!draft.ok) {
      setModalError(draft.error)
      return
    }

    setModalBusy('reminder')
    setModalError(null)
    setModalNotice(null)
    try {
      // 1) Permiso de notificaciones ANTES de crear el recordatorio.
      const hasPermission = await ensureNotificationPermission()

      // 2) Fila en Supabase.
      const reminder = await createReminder({
        session_id: selected.id,
        title: draft.title,
        message: draft.message.length > 0 ? draft.message : null,
        remind_at: draft.remindAt.toISOString(),
      })

      // 3) Notificación local: `sent` SOLO si el sistema confirma el agendado.
      const scheduled = hasPermission
        ? await scheduleReminderNotification(reminder, draft.remindAt)
        : false
      if (scheduled) {
        await markReminderAsSent(reminder.id)
        setModalNotice('Recordatorio guardado y programado.')
      } else {
        // Aviso breve, sólo visible al intentar la operación.
        setModalNotice('Recordatorio guardado. No se pudo programar la notificación en este dispositivo.')
      }

      setReminderDraft(defaultReminderDraft(locationNameFor(selected)))
      await refreshReminderLists(selected.id)
      setScheduledReminderIds(await getDeviceScheduledReminderIds())
    } catch (createError) {
      setModalError(translateError(createError).message)
    } finally {
      setModalBusy(null)
    }
  }

  const handleUpdateReminder = async (reminder: ParkingReminder) => {
    if (!selected || modalBusy) return

    const draft = validateDraft(reminderDraft)
    if (!draft.ok) {
      setModalError(draft.error)
      return
    }

    setModalBusy('reminder')
    setModalError(null)
    setModalNotice(null)
    try {
      const hasPermission = await ensureNotificationPermission()

      // 1) Fila en Supabase con los datos nuevos.
      const updated = await updateReminder(reminder.id, {
        title: draft.title,
        message: draft.message.length > 0 ? draft.message : null,
        remind_at: draft.remindAt.toISOString(),
      })

      // 2) La programación anterior queda invalidada ANTES de agendar la nueva:
      //    así nunca quedan dos avisos para el mismo recordatorio.
      await cancelScheduledForReminder(updated.id)

      // 3) Nueva notificación: `sent` SOLO si el sistema confirma el agendado.
      const scheduled = hasPermission
        ? await scheduleReminderNotification(updated, draft.remindAt)
        : false
      const finalReminder = scheduled
        ? await markReminderAsSent(updated.id)
        : await updateReminder(updated.id, { status: 'pending' })

      setReminders((current) =>
        current.map((item) => (item.id === finalReminder.id ? finalReminder : item)),
      )
      setSessionReminders((current) =>
        current.map((item) => (item.id === finalReminder.id ? finalReminder : item)),
      )
      setScheduledReminderIds(await getDeviceScheduledReminderIds())
      setEditingReminderId(null)
      setReminderDraft(defaultReminderDraft(locationNameFor(selected)))
      setModalNotice(
        scheduled
          ? 'Recordatorio actualizado y reprogramado.'
          : 'Recordatorio actualizado. No se pudo reprogramar la notificación en este dispositivo.',
      )
      await refreshReminderLists(selected.id)
    } catch (updateError) {
      setModalError(translateError(updateError).message)
    } finally {
      setModalBusy(null)
    }
  }

  /** Crea o edita según haya un recordatorio en edición. */
  const handleSaveReminder = async () => {
    const reminder = editingReminderId
      ? (sessionReminders.find((item) => item.id === editingReminderId) ?? null)
      : null
    if (editingReminderId && !reminder) {
      setEditingReminderId(null)
      setModalError('No se encontró el recordatorio a editar. Vuelve a abrir la sesión.')
      return
    }
    if (reminder) await handleUpdateReminder(reminder)
    else await handleCreateReminder()
  }

  const handleStartEditReminder = (reminder: ParkingReminder) => {
    if (modalBusy || listBusy) return
    setEditingReminderId(reminder.id)
    setReminderDraft(reminderDraftFromReminder(reminder))
    setModalError(null)
    setModalNotice(null)
  }

  const handleCancelEdit = () => {
    if (modalBusy) return
    setEditingReminderId(null)
    setModalError(null)
    setModalNotice(null)
    setReminderDraft(defaultReminderDraft(selected ? locationNameFor(selected) : undefined))
  }

  /** Editar desde la lista global: abre el detalle de su sesión en modo edición. */
  const handleEditFromGlobal = (reminder: ParkingReminder) => {
    if (modalBusy || listBusy) return
    const session = sessions.find((item) => item.id === reminder.session_id)
    if (!session) {
      setNotice('Para editar este recordatorio, abre la sesión a la que pertenece.')
      return
    }
    void openSession(session, reminder)
  }

  const handleDeleteReminder = async (reminder: ParkingReminder) => {
    if (modalBusy || listBusy) return
    const confirmed = await confirmAction(
      'Eliminar recordatorio',
      'El recordatorio se eliminará de forma permanente. No se puede deshacer.',
    )
    if (!confirmed) return

    const inModal = selected != null
    setListBusy('delete')
    try {
      // La BD manda: si el borrado falla, la programación local no se toca
      // (así la red de seguridad no "resucita" un recordatorio vivo).
      await deleteReminder(reminder.id)
      await cancelScheduledForReminder(reminder.id)
      setReminders((current) => current.filter((item) => item.id !== reminder.id))
      setSessionReminders((current) => current.filter((item) => item.id !== reminder.id))
      setScheduledReminderIds(await getDeviceScheduledReminderIds())
      if (editingReminderId === reminder.id) {
        setEditingReminderId(null)
        setReminderDraft(defaultReminderDraft(selected ? locationNameFor(selected) : undefined))
      }
      if (inModal) setModalNotice('Recordatorio eliminado.')
      else setNotice('Recordatorio eliminado.')
    } catch (deleteError) {
      const message = translateError(deleteError).message
      if (inModal) setModalError(message)
      else setError(message)
    } finally {
      setListBusy(null)
    }
  }

  const handleCancelReminder = async (reminder: ParkingReminder) => {
    if (modalBusy || listBusy) return
    const confirmed = await confirmAction(
      'Cancelar recordatorio',
      'El recordatorio dejará de avisarte. ¿Continuar?',
    )
    if (!confirmed) return

    const inModal = selected != null
    setListBusy('cancel')
    try {
      const updated = await cancelReminder(reminder.id)
      await cancelScheduledForReminder(reminder.id)
      setReminders((current) =>
        current.map((item) => (item.id === updated.id ? updated : item)),
      )
      setSessionReminders((current) =>
        current.map((item) => (item.id === updated.id ? updated : item)),
      )
      setScheduledReminderIds(await getDeviceScheduledReminderIds())
      if (inModal) setModalNotice('Recordatorio cancelado.')
      else setNotice('Recordatorio cancelado.')
    } catch (cancelError) {
      const message = translateError(cancelError).message
      if (inModal) setModalError(message)
      else setError(message)
    } finally {
      setListBusy(null)
    }
  }

  // ------------------------------------------------------------------
  // Render
  // ------------------------------------------------------------------
  if (isLoading) {
    return (
      <>
        <Stack.Screen options={{ title: 'Historial' }} />
        <LoadingScreen message="Cargando historial…" />
      </>
    )
  }

  const locationLabel = (session: ParkingSession): string => {
    const name = session.location_id ? locationsById[session.location_id] : undefined
    return name ?? formatCoordinates(session)
  }

  return (
    <>
      <Stack.Screen options={{ title: 'Historial' }} />
      <ScrollView contentContainerStyle={styles.container} showsVerticalScrollIndicator={false}>
        {error ? <ErrorMessage message={error} onRetry={handleRetry} /> : null}
        {notice ? (
          <View style={styles.noticeBox}>
            <Text style={styles.noticeText}>{notice}</Text>
          </View>
        ) : null}

        <Text style={styles.sectionTitle}>SESIONES</Text>

        {sessions.length === 0 ? (
          <View style={styles.emptyCard}>
            <Text style={styles.emptyTitle}>Aún no hay sesiones</Text>
            <Text style={styles.emptyText}>
              Cuando registres dónde dejaste tu vehículo con GPS, aparecerá aquí.
            </Text>
          </View>
        ) : (
          sessions.map((session) => {
            const duration = formatDuration(session)
            return (
              <Pressable
                key={session.id}
                style={({ pressed }) => [styles.card, pressed && styles.cardPressed]}
                onPress={() => void openSession(session)}
                accessibilityRole="button"
                accessibilityLabel={`Ver detalle de la sesión del ${formatDateTime(session.parked_at)}`}
              >
                <View style={styles.cardHeader}>
                  <Text style={styles.cardTitle} accessibilityRole="header">
                    {formatDateTime(session.parked_at)}
                  </Text>
                  <Text
                    style={[
                      styles.statusBadge,
                      session.status === 'active' ? styles.statusActive : styles.statusCompleted,
                    ]}
                  >
                    {SESSION_STATUS_LABELS[session.status]}
                  </Text>
                </View>
                <Text style={styles.meta}>Ubicación: {locationLabel(session)}</Text>
                {session.ended_at ? (
                  <Text style={styles.meta}>
                    Fin: {formatDateTime(session.ended_at)}
                    {duration ? ` · Duración: ${duration}` : ''}
                  </Text>
                ) : null}
                {session.note ? (
                  <Text style={styles.notePreview} numberOfLines={2}>
                    {session.note}
                  </Text>
                ) : null}
              </Pressable>
            )
          })
        )}

        {hasMore ? (
          <Pressable
            style={({ pressed }) => [
              styles.buttonSecondary,
              pressed && styles.buttonPressed,
              listBusy === 'more' && styles.buttonDisabled,
            ]}
            onPress={() => void handleLoadMore()}
            disabled={listBusy === 'more'}
            accessibilityRole="button"
            accessibilityState={{ disabled: listBusy === 'more' }}
          >
            <Text style={styles.buttonSecondaryText}>
              {listBusy === 'more' ? 'Cargando…' : 'Cargar más'}
            </Text>
          </Pressable>
        ) : null}

        <Text style={styles.sectionTitle}>RECORDATORIOS</Text>

        {reminders.length === 0 ? (
          <View style={styles.emptyCard}>
            <Text style={styles.emptyTitle}>Sin recordatorios</Text>
            <Text style={styles.emptyText}>
              Abre una sesión para programar un aviso y volver por tu vehículo.
            </Text>
          </View>
        ) : (
          reminders.map((reminder) => {
            const session = sessions.find((item) => item.id === reminder.session_id)
            return (
              <View key={reminder.id} style={styles.card}>
                <View style={styles.cardHeader}>
                  <Text style={styles.cardTitle} accessibilityRole="header">
                    {reminder.title}
                  </Text>
                  <Text
                    style={[
                      styles.statusBadge,
                      reminder.status === 'pending'
                        ? styles.statusActive
                        : reminder.status === 'sent'
                          ? styles.statusCompleted
                          : styles.statusCancelled,
                    ]}
                  >
                    {REMINDER_STATUS_LABELS[reminder.status]}
                  </Text>
                </View>
                <Text style={styles.meta}>Aviso: {formatDateTime(reminder.remind_at)}</Text>
                {session ? (
                  <Text style={styles.meta}>Sesión del {formatDateTime(session.parked_at)}</Text>
                ) : null}
                {reminder.message ? (
                  <Text style={styles.notePreview} numberOfLines={2}>
                    {reminder.message}
                  </Text>
                ) : null}
                {deviceScheduleLabel(reminder, scheduledReminderIds) ? (
                  <Text style={styles.meta}>
                    {deviceScheduleLabel(reminder, scheduledReminderIds)}
                  </Text>
                ) : null}
                {reminderIsManageable(reminder) ? (
                  <Pressable
                    style={({ pressed }) => [
                      styles.buttonSecondary,
                      pressed && styles.buttonPressed,
                      listBusy !== null && styles.buttonDisabled,
                    ]}
                    onPress={() => void handleCancelReminder(reminder)}
                    disabled={listBusy !== null}
                    accessibilityRole="button"
                    accessibilityLabel={`Cancelar recordatorio ${reminder.title}`}
                  >
                    <Text style={styles.buttonSecondaryText}>Cancelar recordatorio</Text>
                  </Pressable>
                ) : null}
                <View style={styles.buttonRow}>
                  {reminderIsManageable(reminder) ? (
                    <Pressable
                      style={({ pressed }) => [
                        styles.buttonSecondary,
                        styles.buttonRowItem,
                        pressed && styles.buttonPressed,
                        listBusy !== null && styles.buttonDisabled,
                      ]}
                      onPress={() => handleEditFromGlobal(reminder)}
                      disabled={listBusy !== null}
                      accessibilityRole="button"
                      accessibilityLabel={`Editar recordatorio ${reminder.title}`}
                    >
                      <Text style={styles.buttonSecondaryText}>Editar</Text>
                    </Pressable>
                  ) : null}
                  <Pressable
                    style={({ pressed }) => [
                      styles.buttonDanger,
                      styles.buttonRowItem,
                      pressed && styles.buttonPressed,
                      listBusy !== null && styles.buttonDisabled,
                    ]}
                    onPress={() => void handleDeleteReminder(reminder)}
                    disabled={listBusy !== null}
                    accessibilityRole="button"
                    accessibilityLabel={`Eliminar recordatorio ${reminder.title}`}
                  >
                    <Text style={styles.buttonDangerText}>Eliminar</Text>
                  </Pressable>
                </View>
              </View>
            )
          })
        )}
      </ScrollView>

      <Modal
        visible={selected !== null}
        animationType="slide"
        onRequestClose={closeModal}
        accessibilityViewIsModal
      >
        {selected ? (
          <View style={styles.modalRoot}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle} accessibilityRole="header">
                Detalle de la sesión
              </Text>
              <Pressable
                onPress={closeModal}
                disabled={modalBusy !== null}
                hitSlop={HIT_SLOP_MIN}
                accessibilityRole="button"
                accessibilityLabel="Cerrar detalle"
              >
                <Text style={styles.modalClose}>Cerrar</Text>
              </Pressable>
            </View>

            <ScrollView
              contentContainerStyle={styles.modalContent}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
            >
              {modalError ? <ErrorMessage message={modalError} /> : null}
              {modalNotice ? (
                <View style={styles.noticeBox}>
                  <Text style={styles.noticeText}>{modalNotice}</Text>
                </View>
              ) : null}

              <View style={styles.card}>
                <View style={styles.cardHeader}>
                  <Text style={styles.cardTitle}>Estado</Text>
                  <Text
                    style={[
                      styles.statusBadge,
                      selected.status === 'active'
                        ? styles.statusActive
                        : styles.statusCompleted,
                    ]}
                  >
                    {SESSION_STATUS_LABELS[selected.status]}
                  </Text>
                </View>
                <Text style={styles.meta}>
                  Guardado el {formatDateTime(selected.parked_at)}
                </Text>
                {selected.ended_at ? (
                  <Text style={styles.meta}>
                    Fin: {formatDateTime(selected.ended_at)}
                    {formatDuration(selected) ? ` · Duración: ${formatDuration(selected)}` : ''}
                  </Text>
                ) : null}
                <Text style={styles.meta}>Ubicación: {locationLabel(selected)}</Text>
                <Text style={styles.meta}>Coordenadas: {formatCoordinates(selected)}</Text>
                {selected.accuracy_m != null ? (
                  <Text style={styles.meta}>Precisión: ± {Math.round(selected.accuracy_m)} m</Text>
                ) : null}
              </View>

              <Text style={styles.sectionTitle}>NOTA</Text>
              <View style={styles.card}>
                <TextInput
                  style={styles.input}
                  value={noteDraft}
                  onChangeText={setNoteDraft}
                  placeholder="Ej. Nivel 2, junto a la escalera"
                  placeholderTextColor={colors.muted}
                  maxLength={NOTE_MAX}
                  multiline
                  accessibilityLabel="Nota de la sesión"
                />
                <Pressable
                  style={({ pressed }) => [
                    styles.buttonPrimary,
                    pressed && styles.buttonPressed,
                    modalBusy === 'note' && styles.buttonDisabled,
                  ]}
                  onPress={() => void handleSaveNote()}
                  disabled={modalBusy !== null}
                  accessibilityRole="button"
                  accessibilityState={{ disabled: modalBusy !== null, busy: modalBusy === 'note' }}
                >
                  <Text style={styles.buttonPrimaryText}>
                    {modalBusy === 'note' ? 'Guardando…' : 'Guardar nota'}
                  </Text>
                </Pressable>
              </View>

              <Text style={styles.sectionTitle}>RECORDATORIOS DE ESTA SESIÓN</Text>

              {sessionReminders.length === 0 ? (
                <View style={styles.emptyCard}>
                  <Text style={styles.emptyText}>
                    Esta sesión no tiene recordatorios todavía.
                  </Text>
                </View>
              ) : (
                sessionReminders.map((reminder) => (
                  <View key={reminder.id} style={styles.card}>
                    <View style={styles.cardHeader}>
                      <Text style={styles.cardTitle}>{reminder.title}</Text>
                      <Text
                        style={[
                          styles.statusBadge,
                          reminder.status === 'pending'
                            ? styles.statusActive
                            : reminder.status === 'sent'
                              ? styles.statusCompleted
                              : styles.statusCancelled,
                        ]}
                      >
                        {REMINDER_STATUS_LABELS[reminder.status]}
                      </Text>
                    </View>
                    <Text style={styles.meta}>Aviso: {formatDateTime(reminder.remind_at)}</Text>
                    {reminder.message ? (
                      <Text style={styles.notePreview}>{reminder.message}</Text>
                    ) : null}
                    {deviceScheduleLabel(reminder, scheduledReminderIds) ? (
                      <Text style={styles.meta}>
                        {deviceScheduleLabel(reminder, scheduledReminderIds)}
                      </Text>
                    ) : null}
                    {reminderIsManageable(reminder) ? (
                      <Pressable
                        style={({ pressed }) => [
                          styles.buttonSecondary,
                          pressed && styles.buttonPressed,
                          (modalBusy !== null || listBusy !== null) && styles.buttonDisabled,
                        ]}
                        onPress={() => void handleCancelReminder(reminder)}
                        disabled={modalBusy !== null || listBusy !== null}
                        accessibilityRole="button"
                        accessibilityLabel={`Cancelar recordatorio ${reminder.title}`}
                      >
                        <Text style={styles.buttonSecondaryText}>Cancelar</Text>
                      </Pressable>
                    ) : null}
                    <View style={styles.buttonRow}>
                      {reminderIsManageable(reminder) ? (
                        <Pressable
                          style={({ pressed }) => [
                            styles.buttonSecondary,
                            styles.buttonRowItem,
                            pressed && styles.buttonPressed,
                            (modalBusy !== null || listBusy !== null) && styles.buttonDisabled,
                          ]}
                          onPress={() => handleStartEditReminder(reminder)}
                          disabled={modalBusy !== null || listBusy !== null}
                          accessibilityRole="button"
                          accessibilityLabel={`Editar recordatorio ${reminder.title}`}
                        >
                          <Text style={styles.buttonSecondaryText}>Editar</Text>
                        </Pressable>
                      ) : null}
                      <Pressable
                        style={({ pressed }) => [
                          styles.buttonDanger,
                          styles.buttonRowItem,
                          pressed && styles.buttonPressed,
                          (modalBusy !== null || listBusy !== null) && styles.buttonDisabled,
                        ]}
                        onPress={() => void handleDeleteReminder(reminder)}
                        disabled={modalBusy !== null || listBusy !== null}
                        accessibilityRole="button"
                        accessibilityLabel={`Eliminar recordatorio ${reminder.title}`}
                      >
                        <Text style={styles.buttonDangerText}>Eliminar</Text>
                      </Pressable>
                    </View>
                  </View>
                ))
              )}

              <Text style={styles.sectionTitle}>
                {editingReminderId ? 'EDITAR RECORDATORIO' : 'NUEVO RECORDATORIO'}
              </Text>
              <View style={styles.card}>
                <Text style={styles.label}>Título</Text>
                <TextInput
                  style={styles.input}
                  value={reminderDraft.title}
                  onChangeText={(text) =>
                    setReminderDraft((draft) => ({ ...draft, title: text }))
                  }
                  placeholder="Volver por el auto"
                  placeholderTextColor={colors.muted}
                  maxLength={REMINDER_TITLE_MAX}
                  accessibilityLabel="Título del recordatorio"
                />

                <Text style={styles.label}>Mensaje</Text>
                <TextInput
                  style={[styles.input, styles.textArea]}
                  value={reminderDraft.message}
                  onChangeText={(text) =>
                    setReminderDraft((draft) => ({ ...draft, message: text }))
                  }
                  placeholder="Opcional"
                  placeholderTextColor={colors.muted}
                  maxLength={REMINDER_MESSAGE_MAX}
                  multiline
                  accessibilityLabel="Mensaje del recordatorio"
                />

                <Text style={styles.label}>Fecha y hora (dd/mm/aaaa hh:mm)</Text>
                <TextInput
                  style={styles.input}
                  value={reminderDraft.when}
                  onChangeText={(text) =>
                    setReminderDraft((draft) => ({ ...draft, when: text }))
                  }
                  placeholder="22/10/2026 18:30"
                  placeholderTextColor={colors.muted}
                  keyboardType="numbers-and-punctuation"
                  accessibilityLabel="Fecha y hora del recordatorio"
                />

                <View style={styles.chipsRow}>
                  {QUICK_REMINDERS.map((quick) => (
                    <Pressable
                      key={quick.label}
                      style={({ pressed }) => [styles.chip, pressed && styles.chipPressed]}
                      onPress={() =>
                        setReminderDraft((draft) => ({
                          ...draft,
                          when: reminderWhenIn(quick.minutes),
                        }))
                      }
                      accessibilityRole="button"
                      accessibilityLabel={`Programar en ${quick.label}`}
                    >
                      <Text style={styles.chipText}>{quick.label}</Text>
                    </Pressable>
                  ))}
                </View>

                {editingReminderId ? (
                  <Pressable
                    style={({ pressed }) => [
                      styles.buttonSecondary,
                      pressed && styles.buttonPressed,
                      modalBusy !== null && styles.buttonDisabled,
                    ]}
                    onPress={handleCancelEdit}
                    disabled={modalBusy !== null}
                    accessibilityRole="button"
                    accessibilityLabel="Cancelar la edición del recordatorio"
                  >
                    <Text style={styles.buttonSecondaryText}>Cancelar edición</Text>
                  </Pressable>
                ) : null}

                <Pressable
                  style={({ pressed }) => [
                    styles.buttonPrimary,
                    pressed && styles.buttonPressed,
                    modalBusy === 'reminder' && styles.buttonDisabled,
                  ]}
                  onPress={() => void handleSaveReminder()}
                  disabled={modalBusy !== null}
                  accessibilityRole="button"
                  accessibilityState={{
                    disabled: modalBusy !== null,
                    busy: modalBusy === 'reminder',
                  }}
                >
                  <Text style={styles.buttonPrimaryText}>
                    {modalBusy === 'reminder'
                      ? editingReminderId
                        ? 'Guardando…'
                        : 'Programando…'
                      : editingReminderId
                        ? 'Guardar cambios'
                        : 'Programar recordatorio'}
                  </Text>
                </Pressable>
              </View>

              <Text style={styles.sectionTitle}>ZONA DE RIESGO</Text>
              <Pressable
                style={({ pressed }) => [
                  styles.buttonDanger,
                  pressed && styles.buttonPressed,
                  modalBusy === 'delete' && styles.buttonDisabled,
                ]}
                onPress={() => void handleDeleteSession()}
                disabled={modalBusy !== null}
                accessibilityRole="button"
                accessibilityLabel="Eliminar esta sesión del historial"
                accessibilityState={{ disabled: modalBusy !== null }}
              >
                <Text style={styles.buttonDangerText}>
                  {modalBusy === 'delete' ? 'Eliminando…' : 'Eliminar sesión'}
                </Text>
              </Pressable>
            </ScrollView>
          </View>
        ) : null}
      </Modal>
    </>
  )
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.xl,
    paddingBottom: spacing.xxxl,
    gap: spacing.md,
  },
  sectionTitle: {
    ...typography.section,
    color: colors.muted,
    marginTop: spacing.lg,
    marginBottom: spacing.xs,
  },
  noticeBox: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line,
    borderLeftWidth: 3,
    borderRadius: radius.sm,
    padding: spacing.lg,
    marginBottom: spacing.lg,
  },
  noticeText: {
    ...typography.caption,
    color: colors.inkSoft,
    lineHeight: 18,
  },
  card: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.lineSoft,
    borderRadius: radius.md,
    padding: spacing.lg,
    gap: spacing.xs,
  },
  cardPressed: {
    opacity: 0.75,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  cardTitle: {
    ...typography.bodyStrong,
    color: colors.ink,
    flexShrink: 1,
  },
  meta: {
    ...typography.caption,
    color: colors.mutedOnCanvas,
  },
  notePreview: {
    ...typography.body,
    color: colors.inkSoft,
    marginTop: spacing.xs,
  },
  statusBadge: {
    ...typography.label,
    borderRadius: radius.pill,
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.sm,
    color: colors.onInk,
  },
  statusActive: {
    backgroundColor: colors.accent,
  },
  statusCompleted: {
    backgroundColor: colors.inkSoft,
  },
  statusCancelled: {
    backgroundColor: colors.muted,
  },
  emptyCard: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.lineSoft,
    borderRadius: radius.md,
    padding: spacing.lg,
    gap: spacing.xs,
  },
  emptyTitle: {
    ...typography.bodyStrong,
    color: colors.ink,
  },
  emptyText: {
    ...typography.caption,
    color: colors.mutedOnCanvas,
    lineHeight: 18,
  },
  label: {
    ...typography.label,
    color: colors.inkSoft,
    marginTop: spacing.sm,
  },
  input: {
    ...typography.body,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    color: colors.ink,
    minHeight: HIT_SLOP_MIN,
    textAlignVertical: 'top',
  },
  textArea: {
    minHeight: 70,
  },
  chipsRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  chip: {
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.pill,
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.md,
    backgroundColor: colors.surface,
  },
  chipPressed: {
    opacity: 0.75,
  },
  chipText: {
    ...typography.label,
    color: colors.ink,
  },
  buttonPrimary: {
    minHeight: HIT_SLOP_MIN,
    borderRadius: radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.accent,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    marginTop: spacing.md,
  },
  buttonSecondary: {
    minHeight: HIT_SLOP_MIN,
    borderRadius: radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    marginTop: spacing.sm,
  },
  buttonDanger: {
    minHeight: HIT_SLOP_MIN,
    borderRadius: radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.ink,
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    marginTop: spacing.sm,
  },
  buttonRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  buttonRowItem: {
    flex: 1,
    marginTop: 0,
  },
  buttonPressed: {
    opacity: 0.75,
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  buttonPrimaryText: {
    ...typography.bodyStrong,
    color: colors.onInk,
  },
  buttonSecondaryText: {
    ...typography.bodyStrong,
    color: colors.inkSoft,
  },
  buttonDangerText: {
    ...typography.bodyStrong,
    color: colors.ink,
  },
  modalRoot: {
    flex: 1,
    backgroundColor: colors.canvas,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.lg,
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.lineSoft,
  },
  modalTitle: {
    ...typography.title,
    color: colors.ink,
    flexShrink: 1,
  },
  modalClose: {
    ...typography.bodyStrong,
    color: colors.accent,
  },
  modalContent: {
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.xl,
    paddingBottom: spacing.xxxl,
    gap: spacing.md,
  },
})
