/**
 * Servicio de ubicaciones de estacionamiento (Persona 3).
 *
 * La autorización final la dicta RLS, NO este archivo. Ocultar botones en la
 * UI es cortesía; lo que realmente impide un borrado indebido es la política
 * `parking_locations_*_admin`. Por eso estos métodos se pueden llamar
 * siempre: si el usuario no tiene rol, la BD responde 42501 y
 * `translateError` lo traduce.
 */

import { AppError, logTechnical, translateError } from '@/lib/errors'
import { assertSupabaseConfigured } from '@/lib/supabase'
import { getVerifiedUserId } from '@/services/auth.service'
import type { Paginated, ParkingLocation } from '@/types/models'
import { escapeLikePattern, LOCATION_NAME_MAX } from '@/lib/validation'

const DEFAULT_PAGE_SIZE = 20
const MAX_PAGE_SIZE = 100

export interface ListLocationsParams {
  /** Búsqueda por nombre o dirección. Se escapan los comodines de `ilike`. */
  search?: string
  /**
   * Sólo surte efecto si RLS ya permite ver inactivas (rol operator/admin).
   * Para un usuario normal la BD seguirá ocultándolas.
   */
  includeInactive?: boolean
  page?: number
  pageSize?: number
}

export interface CreateLocationInput {
  name: string
  address: string
  description?: string | null
  latitude?: number | null
  longitude?: number | null
}

export type UpdateLocationInput = Partial<CreateLocationInput> & {
  is_active?: boolean
}

function clampPaging(page?: number, pageSize?: number) {
  const safePage = Number.isFinite(page) && (page ?? 0) >= 1 ? Math.floor(page as number) : 1
  const requested = pageSize ?? DEFAULT_PAGE_SIZE
  const safePageSize = Math.min(Math.max(1, Math.floor(requested)), MAX_PAGE_SIZE)
  return { from: (safePage - 1) * safePageSize, to: safePage, pageSize: safePageSize }
}

export async function listLocations(
  params: ListLocationsParams = {},
): Promise<Paginated<ParkingLocation>> {
  const client = assertSupabaseConfigured()
  const { pageSize } = clampPaging(params.page, params.pageSize)
  const { from, to } = clampPaging(params.page, params.pageSize)

  let query = client.from('parking_locations').select('*', { count: 'exact' })

  // No filtramos por `is_active` si el usuario no pidió inactivas: la
  // política RLS ya devuelve las que le corresponden.
  if (!params.includeInactive) {
    query = query.eq('is_active', true)
  }

  const term = params.search?.trim()
  if (term) {
    const pattern = `%${escapeLikePattern(term)}%`
    query = query.or(`name.ilike.${pattern},address.ilike.${pattern}`)
  }

  const { data, error, count } = await query
    .order('name', { ascending: true })
    .range(from, to - 1)

  if (error) {
    logTechnical('locations/list', translateError(error))
    throw translateError(error)
  }

  return { data: data ?? [], page: to, pageSize, total: count ?? null }
}

export async function getLocationById(id: string): Promise<ParkingLocation | null> {
  const client = assertSupabaseConfigured()

  const { data, error } = await client
    .from('parking_locations')
    .select('*')
    .eq('id', id)
    .maybeSingle()

  if (error) {
    logTechnical('locations/getById', translateError(error))
    throw translateError(error)
  }

  return data
}

/** Sólo `admin`. `created_by` se fija al usuario autenticado, no al payload. */
export async function createLocation(input: CreateLocationInput): Promise<ParkingLocation> {
  const client = assertSupabaseConfigured()
  const userId = await getVerifiedUserId()

  const name = input.name.trim()
  if (name.length === 0 || name.length > LOCATION_NAME_MAX) {
    throw new AppError(`El nombre debe tener entre 1 y ${LOCATION_NAME_MAX} caracteres.`)
  }

  const { data, error } = await client
    .from('parking_locations')
    .insert({
      name,
      address: input.address.trim(),
      description: input.description?.trim() || null,
      latitude: input.latitude ?? null,
      longitude: input.longitude ?? null,
      // Nunca se toma del payload: el autor es siempre quien tiene sesión.
      created_by: userId,
    })
    .select('*')
    .maybeSingle()

  if (error) {
    logTechnical('locations/create', translateError(error))
    throw translateError(error)
  }

  if (!data) throw translateError(new Error('No se pudo crear la ubicación.'))
  return data
}

/** Sólo `admin`. */
export async function updateLocation(
  id: string,
  input: UpdateLocationInput,
): Promise<ParkingLocation> {
  const client = assertSupabaseConfigured()

  const payload: UpdateLocationInput = {}
  if (input.name !== undefined) {
    const name = input.name.trim()
    if (name.length === 0 || name.length > LOCATION_NAME_MAX) {
      throw new AppError(`El nombre debe tener entre 1 y ${LOCATION_NAME_MAX} caracteres.`)
    }
    payload.name = name
  }
  if (input.address !== undefined) payload.address = input.address.trim()
  if (input.description !== undefined) payload.description = input.description?.trim() || null
  if (input.latitude !== undefined) payload.latitude = input.latitude
  if (input.longitude !== undefined) payload.longitude = input.longitude
  if (input.is_active !== undefined) payload.is_active = input.is_active

  if (Object.keys(payload).length === 0) {
    throw translateError(new Error('No hay cambios que guardar.'))
  }

  const { data, error } = await client
    .from('parking_locations')
    .update(payload)
    .eq('id', id)
    .select('*')
    .maybeSingle()

  if (error) {
    logTechnical('locations/update', translateError(error))
    throw translateError(error)
  }

  if (!data) throw translateError(new Error('No se encontró la ubicación.'))
  return data
}

/**
 * Desactiva en lugar de borrar.
 * Un borrado duro puede dejar `parking_sessions` huérfanas y chocar con
 * las FK; desactivar es la operación reversible y recomendada.
 */
export async function deactivateLocation(id: string): Promise<ParkingLocation> {
  return updateLocation(id, { is_active: false })
}

/** Borrado real. Sólo `admin`, y sólo si nada lo referencia. */
export async function deleteLocation(id: string): Promise<void> {
  const client = assertSupabaseConfigured()

  const { error } = await client.from('parking_locations').delete().eq('id', id)

  if (error) {
    logTechnical('locations/delete', translateError(error))
    throw translateError(error)
  }
}