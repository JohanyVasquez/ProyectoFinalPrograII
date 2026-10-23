
import type { Session } from '@supabase/supabase-js'

import { AppError, logTechnical, translateError } from '@/lib/errors'
import { assertSupabaseConfigured } from '@/lib/supabase'
import {
  isValidEmail,
  isValidFullName,
  isValidPassword,
  normalizeEmail,
} from '@/lib/validation'

export interface RegisterInput {
  fullName: string
  email: string
  password: string
}

export interface LoginInput {
  email: string
  password: string
}

/**
 * `pending_confirmation` significa que el proyecto de Supabase tiene activa
 * la confirmación de correo: la cuenta existe pero NO hay sesión. La UI debe
 * pedir revisar el correo y NO abrir el área privada.
 */
export type RegisterResult =
  | { status: 'registered'; userId: string; session: Session }
  | { status: 'pending_confirmation'; userId: string | null }

export type LoginResult = { status: 'signed_in'; session: Session }

function validateCredentials(email: string, password: string): void {
  if (!isValidEmail(email)) {
    throw new AppError('Introduce un correo electrónico válido.')
  }
  if (!isValidPassword(password)) {
    throw new AppError('La contraseña debe tener al menos 8 caracteres.')
  }
}

export async function register(input: RegisterInput): Promise<RegisterResult> {
  const fullName = input.fullName.trim()

  if (!isValidFullName(fullName)) {
    throw new AppError('El nombre no puede estar vacío ni superar 120 caracteres.')
  }
  validateCredentials(input.email, input.password)

  const client = assertSupabaseConfigured()
  const email = normalizeEmail(input.email)

  // `options.data.full_name` lo lee el trigger `private.handle_new_user`
  // para crear `public.profiles` en el mismo alta.
  const { data, error } = await client.auth.signUp({
    email,
    password: input.password,
    options: { data: { full_name: fullName } },
  })

  if (error) {
    logTechnical('auth/register', translateError(error))
    throw translateError(error)
  }

  if (data.session && data.user) {
    return { status: 'registered', userId: data.user.id, session: data.session }
  }

  // Sin sesión: el proyecto exige confirmar el correo.
  return { status: 'pending_confirmation', userId: data.user?.id ?? null }
}

export async function login(input: LoginInput): Promise<LoginResult> {
  validateCredentials(input.email, input.password)

  const client = assertSupabaseConfigured()
  const { data, error } = await client.auth.signInWithPassword({
    email: normalizeEmail(input.email),
    password: input.password,
  })

  if (error) {
    logTechnical('auth/login', translateError(error))
    throw translateError(error)
  }

  if (!data.session) {
    throw new AppError('No se pudo iniciar sesión. Inténtalo de nuevo.')
  }

  return { status: 'signed_in', session: data.session }
}

/**
 * Cierra sesión. A diferencia del resto de servicios, limpia el estado local
 * aunque Supabase falle: si el token ya no vale, el usuario debe poder salir
 * de la app y no quedarse atrapado en una sesión muerta.
 */
export async function logout(): Promise<void> {
  const client = assertSupabaseConfigured()
  const { error } = await client.auth.signOut()

  if (error) {
    logTechnical('auth/logout', translateError(error))
    throw translateError(error)
  }
}

/** Sesión actual sin comprobar la red. `null` si no hay sesión guardada. */
export async function getCurrentSession(): Promise<Session | null> {
  const client = assertSupabaseConfigured()
  const { data, error } = await client.auth.getSession()

  if (error) {
    logTechnical('auth/getCurrentSession', translateError(error))
    return null
  }

  return data.session
}

/**
 * User ID verificado por el servidor. Úsalo antes de escribir filas con
 * `user_id`: un JWT manipulado no pasa esta comprobación.
 */
export async function getVerifiedUserId(): Promise<string> {
  const client = assertSupabaseConfigured()
  const { data, error } = await client.auth.getUser()

  if (error || !data.user) {
    logTechnical('auth/getVerifiedUserId', error ?? 'sin usuario')
    throw new AppError('Tu sesión expiró. Inicia sesión de nuevo.')
  }

  return data.user.id
}

/** Borra la sesión local sin contactar al servidor. Útil ante un 401. */
export async function clearLocalSession(): Promise<void> {
  const client = assertSupabaseConfigured()
  const { error } = await client.auth.signOut({ scope: 'local' })
  if (error) logTechnical('auth/clearLocalSession', error)
}