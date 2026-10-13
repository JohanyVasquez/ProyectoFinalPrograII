/**
 * Servicio de perfil y rol (consumido por Persona 2).
 *
 * El `user_id` SIEMPRE se deriva de la sesión verificada, nunca de un
 * parámetro de la UI: si se aceptara un `userId` externo, un usuario podría
 * leer o escribir el perfil de otro.
 */

import { AppError, logTechnical, translateError } from '@/lib/errors'
import { assertSupabaseConfigured } from '@/lib/supabase'
import { FULL_NAME_MAX, PHONE_MAX } from '@/lib/validation'
import type { TableRow, UserRole } from '@/types/database.types'
import { getVerifiedUserId } from '@/services/auth.service'

export type Profile = TableRow<'profiles'>

/** Campos que el usuario puede editar sobre su propio perfil. */
export interface UpdateProfileInput {
  full_name?: string
  phone?: string | null
  avatar_url?: string | null
}

/**
 * Normaliza y valida antes de enviar. Los CHECK de la BD son la autoridad,
 * pero fallar aquí da un mensaje claro en vez de un 23514 genérico.
 */
function sanitize(input: UpdateProfileInput): UpdateProfileInput {
  const payload: UpdateProfileInput = {}

  if (input.full_name !== undefined) {
    const fullName = input.full_name.trim()
    if (fullName.length === 0) {
      throw new AppError('El nombre no puede estar vacío.')
    }
    if (fullName.length > FULL_NAME_MAX) {
      throw new AppError(`El nombre no puede superar ${FULL_NAME_MAX} caracteres.`)
    }
    payload.full_name = fullName
  }

  if (input.phone !== undefined) {
    const phone = input.phone?.trim() || null
    if (phone && phone.length > PHONE_MAX) {
      throw new AppError(`El teléfono no puede superar ${PHONE_MAX} caracteres.`)
    }
    payload.phone = phone
  }

  if (input.avatar_url !== undefined) {
    payload.avatar_url = input.avatar_url?.trim() || null
  }

  return payload
}

/**
 * Perfil del usuario autenticado.
 * Devuelve `null` si el trigger aún no ha creado la fila (p. ej. cuenta
 * creada antes de aplicar la migración).
 */
export async function getMyProfile(): Promise<Profile | null> {
  const client = assertSupabaseConfigured()
  const userId = await getVerifiedUserId()

  const { data, error } = await client
    .from('profiles')
    .select('*')
    .eq('id', userId)
    .maybeSingle()

  if (error) {
    logTechnical('profiles/getMyProfile', translateError(error))
    throw translateError(error)
  }

  return data
}

/**
 * Actualiza el perfil propio.
 * RLS (`profiles_update_own`) + el grant por columnas impedirán tocar
 * `id`, `created_at` o `updated_at` aunque se intentara.
 */
export async function updateMyProfile(input: UpdateProfileInput): Promise<Profile> {
  const client = assertSupabaseConfigured()
  const userId = await getVerifiedUserId()
  const payload = sanitize(input)

  if (Object.keys(payload).length === 0) {
    const current = await getMyProfile()
    if (current) return current
    throw translateError(new Error('No hay cambios que guardar.'))
  }

  const { data, error } = await client
    .from('profiles')
    .update(payload)
    .eq('id', userId)
    .select('*')
    .maybeSingle()

  if (error) {
    logTechnical('profiles/updateMyProfile', translateError(error))
    throw translateError(error)
  }

  if (!data) {
    throw translateError(new Error('No se encontró el perfil del usuario.'))
  }

  return data
}

/**
 * Rol del usuario autenticado. Por defecto `'user'` si la fila no existe:
 * nunca dar por hecho permisos especialees aunque la consulta falle.
 */
export async function getMyRole(): Promise<UserRole> {
  const client = assertSupabaseConfigured()
  const userId = await getVerifiedUserId()

  const { data, error } = await client
    .from('user_roles')
    .select('role')
    .eq('user_id', userId)
    .maybeSingle()

  if (error) {
    logTechnical('profiles/getMyRole', translateError(error))
    return 'user'
  }

  return data?.role ?? 'user'
}

/** Perfil + rol en una sola ida y vuelta. Útil para la pantalla de perfil. */
export async function getMyProfileWithRole(): Promise<{
  profile: Profile | null
  role: UserRole
}> {
  const [profile, role] = await Promise.all([getMyProfile(), getMyRole()])
  return { profile, role }
}