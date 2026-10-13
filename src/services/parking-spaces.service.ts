/**
 * Servicio de espacios de estacionamiento (Persona 3).
 *
 * El estado de un espacio es MANUAL: lo marca una persona. No hay sensores
 * ni verificación física, así que la UI nunca debe presentarlo como
 * "disponibilidad en tiempo real".
 *
 * Permisos reales (los impone RLS, no este archivo):
 * - `admin`: crear, editar metadatos, desactivar/eliminar, marcar estado.
 * - `operator`: SÓLO cambiar `status`.
 * - `user`: sólo lectura de espacios activos de ubicaciones activas.
 */

import { AppError, logTechnical, translateError } from '@/lib/errors'
import { assertSupabaseConfigured } from '@/lib/supabase'
import { escapeLikePattern, SPACE_CODE_MAX } from '@/lib/validation'
import type { Paginated, ParkingSpace, SpaceStatus } from '@/types/models'

const DEFAULT_PAGE_SIZE = 20
const MAX_PAGE_SIZE = 100

export interface ListSpacesParams {
  locationId?: string
  status?: SpaceStatus
  /** Atajo para `status: 'available'`. Si se pasan ambos, gana `status`. */
  availableOnly?: boolean
  /** Sólo surte efecto con rol operator/admin (ver RLS). */
  includeInactive?: boolean
  search?: string
  page?: number
  pageSize?: number
}

export interface CreateSpaceInput {
  location_id: string
  code: string
  floor_label?: string | null
  description?: string | null
  status?: SpaceStatus
}

export interface UpdateSpaceInput {
  code?: string
  floor_label?: string | null
  description?: string | null
  is_active?: boolean
}

function clampPaging(page?: number, pageSize?: number) {
  const safePage = Number.isFinite(page) && (page ?? 0) >= 1 ? Math.floor(page as number) : 1
  const requested = pageSize ?? DEFAULT_PAGE_SIZE
  const safePageSize = Math.min(Math.max(1, Math.floor(requested)), MAX_PAGE_SIZE)
  return { from: (safePage - 1) * safePageSize, page: safePage, pageSize: safePageSize }
}

export async function listSpaces(
  params: ListSpacesParams = {},
): Promise<Paginated<ParkingSpace>> {
  const client = assertSupabaseConfigured()
  const { page, pageSize } = clampPaging(params.page, params.pageSize)
  const from = (page - 1) * pageSize

  let query = client.from('parking_spaces').select('*', { count: 'exact' })

  if (params.locationId) {
    query = query.eq('location_id', params.locationId)
  }

  if (!params.includeInactive) {
    query = query.eq('is_active', true)
  }

  if (params.status) {
    query = query.eq('status', params.status)
  } else if (params.availableOnly) {
    query = query.eq('status', 'available')
  }

  const term = params.search?.trim()
  if (term) {
    query = query.ilike('code', `%${escapeLikePattern(term)}%`)
  }

  const { data, error, count } = await query
    .order('code', { ascending: true })
    .range(from, from + pageSize - 1)

  if (error) {
    logTechnical('spaces/list', translateError(error))
    throw translateError(error)
  }

  return { data: data ?? [], page, pageSize, total: count ?? null }
}

export async function getSpaceById(id: string): Promise<ParkingSpace | null> {
  const client = assertSupabaseConfigured()

  const { data, error } = await client
    .from('parking_spaces')
    .select('*')
    .eq('id', id)
    .maybeSingle()

  if (error) {
    logTechnical('spaces/getById', translateError(error))
    throw translateError(error)
  }

  return data
}

/** Sólo `admin`. La unicidad de `(location_id, code)` la impone la BD (23505). */
export async function createSpace(input: CreateSpaceInput): Promise<ParkingSpace> {
  const client = assertSupabaseConfigured()

  const code = input.code.trim()
  if (code.length === 0 || code.length > SPACE_CODE_MAX) {
    throw new AppError(`El código debe tener entre 1 y ${SPACE_CODE_MAX} caracteres.`)
  }

  const { data, error } = await client
    .from('parking_spaces')
    .insert({
      location_id: input.location_id,
      code,
      floor_label: input.floor_label?.trim() || null,
      description: input.description?.trim() || null,
      status: input.status ?? 'available',
    })
    .select('*')
    .maybeSingle()

  if (error) {
    logTechnical('spaces/create', translateError(error))
    throw translateError(error)
  }

  if (!data) throw translateError(new Error('No se pudo crear el espacio.'))
  return data
}

/**
 * Edita METADATOS del espacio. Sólo `admin`.
 * `status` NO va aquí: para eso está `setSpaceStatus`, que acepta operator.
 */
export async function updateSpace(id: string, input: UpdateSpaceInput): Promise<ParkingSpace> {
  const client = assertSupabaseConfigured()

  const payload: UpdateSpaceInput = {}
  if (input.code !== undefined) {
    const code = input.code.trim()
    if (code.length === 0 || code.length > SPACE_CODE_MAX) {
      throw new AppError(`El código debe tener entre 1 y ${SPACE_CODE_MAX} caracteres.`)
    }
    payload.code = code
  }
  if (input.floor_label !== undefined) payload.floor_label = input.floor_label?.trim() || null
  if (input.description !== undefined) payload.description = input.description?.trim() || null
  if (input.is_active !== undefined) payload.is_active = input.is_active

  if (Object.keys(payload).length === 0) {
    throw translateError(new Error('No hay cambios que guardar.'))
  }

  const { data, error } = await client
    .from('parking_spaces')
    .update(payload)
    .eq('id', id)
    .select('*')
    .maybeSingle()

  if (error) {
    logTechnical('spaces/update', translateError(error))
    throw translateError(error)
  }

  if (!data) throw translateError(new Error('No se encontró el espacio.'))
  return data
}

/**
 * Marca el estado manual. `operator` y `admin`.
 *
 * `status_updated_at` y `status_updated_by` los rellena el trigger
 * `trg_parking_spaces_status_audit`; mandarlos desde el cliente sería
 * un error de auditoría.
 */
export async function setSpaceStatus(id: string, status: SpaceStatus): Promise<ParkingSpace> {
  const client = assertSupabaseConfigured()

  const { data, error } = await client
    .from('parking_spaces')
    .update({ status })
    .eq('id', id)
    .select('*')
    .maybeSingle()

  if (error) {
    logTechnical('spaces/setStatus', translateError(error))
    throw translateError(error)
  }

  if (!data) throw translateError(new Error('No se encontró el espacio.'))
  return data
}

/**
 * Sólo `admin`. Desactivar es preferible a borrar cuando hay sesiones
 * apuntando a este espacio: el borrado duro fallaría por la FK.
 */
export async function deactivateSpace(id: string): Promise<ParkingSpace> {
  return updateSpace(id, { is_active: false })
}

/**
 * Borrado real. Sólo `admin`.
 * Falla con 23503 si hay sesiones que lo referencian: la FK
 * `session_space_fk` es `on delete no action` a propósito, para que borrar
 * un espacio no destruya el historial de Parking de un usuario.
 */
export async function deleteSpace(id: string): Promise<void> {
  const client = assertSupabaseConfigured()

  const { error } = await client.from('parking_spaces').delete().eq('id', id)

  if (error) {
    logTechnical('spaces/delete', translateError(error))
    throw translateError(error)
  }
}

/**
 * Copia de seguridad: aplica `setSpaceStatus` a varios espacios seguidos.
 * No es una transacción; si el tercero falla, los dos anteriores quedan
 * aplicados. Úsalo sólo para marcador masivo y reporta los fallos.
 */
export async function setSpaceStatusMany(
  ids: readonly string[],
  status: SpaceStatus,
): Promise<{ updated: string[]; failed: { id: string; reason: string }[] }> {
  const updated: string[] = []
  const failed: { id: string; reason: string }[] = []

  for (const id of ids) {
    try {
      await setSpaceStatus(id, status)
      updated.push(id)
    } catch (error) {
      failed.push({ id, reason: translateError(error).message })
    }
  }

  return { updated, failed }
}