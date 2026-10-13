/**
 * Servicio de sesiones de estacionamiento (Personas 4 y 5).
 *
 * Una sesión = "dejé mi vehículo aquí". NO es una reserva y NO modifica el
 * estado del espacio: la app jamás llama a `setSpaceStatus` como efecto
 * secundario de guardar o cerrar una sesión.
 *
 * Reglas que la BD impone y este servicio respeta:
 * - Una única sesión `active` por usuario (índice parcial). Violarlo da 23505.
 * - `ended_at = now()` y `status = 'completed'` deben ir juntos (CHECK).
 * - `space_id` es opcional; si se usa, `location_id` debe ser la ubicación
 *   real de ese espacio (FK compuesta `session_space_fk`).
 * - `user_id` no se puede transferir: el trigger `private.guard_session_owner`
 *   rechaza el cambio.
 */

import { AppError, logTechnical, translateError } from '@/lib/errors'
import { assertSupabaseConfigured } from '@/lib/supabase'
import {
  areValidCoordinates,
  isUuid,
  isValidAccuracy,
  NOTE_MAX,
} from '@/lib/validation'
import { getVerifiedUserId } from '@/services/auth.service'
import type { Paginated, ParkingSession, SessionStatus } from '@/types/models'

const DEFAULT_PAGE_SIZE = 20
const MAX_PAGE_SIZE = 100

export interface CreateParkingSessionInput {
  latitude: number
  longitude: number
  /** Precisión del GPS en metros. Opcional. */
  accuracy_m?: number | null
  note?: string | null
  location_id?: string | null
  /** Opcional: se puede guardar sólo con coordenadas GPS. */
  space_id?: string | null
  parked_at?: string
}

export interface ListParkingSessionsParams {
  status?: SessionStatus
  page?: number
  pageSize?: number
}

/** Campos que un cliente puede modificar sobre su propia sesión. */
export interface UpdateParkingSessionInput {
  latitude?: number
  longitude?: number
  accuracy_m?: number | null
  note?: string | null
  location_id?: string | null
  space_id?: string | null
  parked_at?: string
}

function clampPaging(page?: number, pageSize?: number) {
  const safePage = Number.isFinite(page) && (page ?? 0) >= 1 ? Math.floor(page as number) : 1
  const requested = pageSize ?? DEFAULT_PAGE_SIZE
  const safePageSize = Math.min(Math.max(1, Math.floor(requested)), MAX_PAGE_SIZE)
  return { page: safePage, pageSize: safePageSize }
}

function validateCoordinates(latitude: number, longitude: number, accuracy?: number | null): void {
  if (!areValidCoordinates(latitude, longitude)) {
    throw new AppError('Las coordenadas no son válidas. Latitud [-90, 90], longitud [-180, 180].')
  }
  if (accuracy !== undefined && accuracy !== null && !isValidAccuracy(accuracy)) {
    throw new AppError('La precisión indicada no es válida.')
  }
}

function validateOptionalIds(locationId?: string | null, spaceId?: string | null): void {
  if (locationId != null && !isUuid(locationId)) {
    throw new AppError('El identificador de ubicación no es válido.')
  }
  if (spaceId != null && !isUuid(spaceId)) {
    throw new AppError('El identificador de espacio no es válido.')
  }
  // Comprobación rápida. La definitiva es la FK compuesta
  // `parking_sessions_session_space_fkey (space_id, location_id)` →
  // `parking_spaces(id, location_id)`, que además exige que el espacio exista.
  if (spaceId != null && locationId == null) {
    throw new AppError('Si eliges un espacio, también debes indicar su ubicación.')
  }
}

function validateNote(note?: string | null): string | null {
  if (note == null) return null
  if (note.length > NOTE_MAX) {
    throw new AppError(`La nota no puede superar ${NOTE_MAX} caracteres.`)
  }
  return note.trim() || null
}

/**
 * Guarda una sesión. `user_id` se toma de la sesión verificada, nunca de un
 * parámetro: RLS además exige `user_id = auth.uid()`.
 */
export async function createParkingSession(
  input: CreateParkingSessionInput,
): Promise<ParkingSession> {
  const client = assertSupabaseConfigured()
  const userId = await getVerifiedUserId()

  validateCoordinates(input.latitude, input.longitude, input.accuracy_m)
  validateOptionalIds(input.location_id, input.space_id)

  const { data, error } = await client
    .from('parking_sessions')
    .insert({
      user_id: userId,
      latitude: input.latitude,
      longitude: input.longitude,
      accuracy_m: input.accuracy_m ?? null,
      note: validateNote(input.note),
      location_id: input.location_id ?? null,
      space_id: input.space_id ?? null,
      ...(input.parked_at ? { parked_at: input.parked_at } : {}),
      // `status` y `ended_at` se dejan en su valor por defecto (active / null)
      // para no violar el CHECK parking_sessions_status_time_check.
    })
    .select('*')
    .maybeSingle()

  if (error) {
    logTechnical('sessions/create', translateError(error))
    throw translateError(error)
  }

  if (!data) throw translateError(new Error('No se pudo guardar la sesión.'))
  return data
}

/**
 * Sesión activa del usuario, o `null`.
 * Permite seguir las reglas del índice parcial: nunca se asume que exista.
 */
export async function getActiveParkingSession(): Promise<ParkingSession | null> {
  const client = assertSupabaseConfigured()
  const userId = await getVerifiedUserId()

  const { data, error } = await client
    .from('parking_sessions')
    .select('*')
    .eq('user_id', userId)
    .eq('status', 'active')
    .order('parked_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (error) {
    logTechnical('sessions/getActive', translateError(error))
    throw translateError(error)
  }

  return data
}

/**
 * Cierra la sesión: `status='completed'` y `ended_at` a la hora actual.
 * Van juntos porque el CHECK los liga; mandar sólo uno falla con 23514.
 */
export async function completeParkingSession(id: string): Promise<ParkingSession> {
  const client = assertSupabaseConfigured()

  const { data, error } = await client
    .from('parking_sessions')
    .update({ status: 'completed', ended_at: new Date().toISOString() })
    .eq('id', id)
    .select('*')
    .maybeSingle()

  if (error) {
    logTechnical('sessions/complete', translateError(error))
    throw translateError(error)
  }

  if (!data) throw translateError(new Error('No se encontró la sesión a cerrar.'))
  return data
}

/** Historial, de más reciente a más antiguo. */
export async function listParkingSessions(
  params: ListParkingSessionsParams = {},
): Promise<Paginated<ParkingSession>> {
  const client = assertSupabaseConfigured()
  const userId = await getVerifiedUserId()
  const { page, pageSize } = clampPaging(params.page, params.pageSize)
  const from = (page - 1) * pageSize

  let query = client
    .from('parking_sessions')
    .select('*', { count: 'exact' })
    .eq('user_id', userId)

  if (params.status) {
    query = query.eq('status', params.status)
  }

  const { data, error, count } = await query
    .order('parked_at', { ascending: false })
    .range(from, from + pageSize - 1)

  if (error) {
    logTechnical('sessions/list', translateError(error))
    throw translateError(error)
  }

  return { data: data ?? [], page, pageSize, total: count ?? null }
}

export async function getParkingSessionById(id: string): Promise<ParkingSession | null> {
  const client = assertSupabaseConfigured()

  const { data, error } = await client
    .from('parking_sessions')
    .select('*')
    .eq('id', id)
    .maybeSingle()

  if (error) {
    logTechnical('sessions/getById', translateError(error))
    throw translateError(error)
  }

  return data
}

/**
 * Edita una sesión propia. `user_id`, `status` y `ended_at` quedan fuera de
 * propósito: para cerrar hay que usar `completeParkingSession`, y el
 * propietario no se cambia.
 */
export async function updateParkingSession(
  id: string,
  input: UpdateParkingSessionInput,
): Promise<ParkingSession> {
  const client = assertSupabaseConfigured()

  const payload: UpdateParkingSessionInput = {}

  if (input.latitude !== undefined || input.longitude !== undefined) {
    const latitude = input.latitude
    const longitude = input.longitude
    // Si sólo llega uno de los dos, no se puede validar el par: se rechaza.
    if (latitude === undefined || longitude === undefined) {
      throw new AppError('Para mover una sesión hay que enviar latitud y longitud.')
    }
    validateCoordinates(latitude, longitude, input.accuracy_m)
    payload.latitude = latitude
    payload.longitude = longitude
  }

  if (input.accuracy_m !== undefined) {
    validateCoordinates(payload.latitude ?? 0, payload.longitude ?? 0, input.accuracy_m)
    payload.accuracy_m = input.accuracy_m
  }

  if (input.note !== undefined) payload.note = validateNote(input.note)

  if (input.location_id !== undefined || input.space_id !== undefined) {
    const locationId = input.location_id ?? null
    const spaceId = input.space_id ?? null
    validateOptionalIds(locationId, spaceId)
    payload.location_id = locationId
    payload.space_id = spaceId
  }

  if (input.parked_at !== undefined) payload.parked_at = input.parked_at

  if (Object.keys(payload).length === 0) {
    throw translateError(new Error('No hay cambios que guardar.'))
  }

  const { data, error } = await client
    .from('parking_sessions')
    .update(payload)
    .eq('id', id)
    .select('*')
    .maybeSingle()

  if (error) {
    logTechnical('sessions/update', translateError(error))
    throw translateError(error)
  }

  if (!data) throw translateError(new Error('No se encontró la sesión.'))
  return data
}

export async function deleteParkingSession(id: string): Promise<void> {
  const client = assertSupabaseConfigured()

  const { error } = await client.from('parking_sessions').delete().eq('id', id)

  if (error) {
    logTechnical('sessions/delete', translateError(error))
    throw translateError(error)
  }
}