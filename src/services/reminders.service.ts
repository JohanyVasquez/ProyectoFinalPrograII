/**
 * Servicio de recordatorios (Persona 5).
 *
 * Persistencia de "avisarme cuando vuelva al auto". Este archivo sólo
 * guarda y lee filas: NO programa notificaciones ni las envía.
 *
 * Puntos críticos:
 * - `user_id` siempre del usuario actual (RLS además lo exige).
 * - El trigger `trg_parking_reminders_validate` verifica que `session_id`
 *   sea una sesión del mismo usuario. Un recordatorio sobre la sesión de
 *   otro usuario falla con 42501.
 * - Poner `status = 'sent'` en la BD NO envía nada. Quien dispara la
 *   notificación es Persona 5, en el cliente.
 */

import { AppError, logTechnical, translateError } from '@/lib/errors'
import { assertSupabaseConfigured } from '@/lib/supabase'
import { isUuid } from '@/lib/validation'
import { getVerifiedUserId } from '@/services/auth.service'
import type { Paginated, ParkingReminder, ReminderStatus } from '@/types/models'

const DEFAULT_PAGE_SIZE = 20
const MAX_PAGE_SIZE = 100
/** CHECK `char_length(btrim(title)) between 1 and 120`. */
const TITLE_MAX = 120
/**
 * `parking_reminders.message` NO tiene CHECK de longitud en el SQL.
 * El límite es una convención de la app, no una garantía de la BD.
 */
const MESSAGE_MAX = 500

export interface ListRemindersParams {
  sessionId?: string
  status?: ReminderStatus
  page?: number
  pageSize?: number
}

export interface CreateReminderInput {
  session_id: string
  title: string
  message?: string | null
  /** ISO 8601. Debe ser posterior a "ahora" para tener sentido. */
  remind_at: string
}

export type UpdateReminderInput = Partial<Omit<CreateReminderInput, 'session_id'>> & {
  session_id?: string
  status?: ReminderStatus
}

function clampPaging(page?: number, pageSize?: number) {
  const safePage = Number.isFinite(page) && (page ?? 0) >= 1 ? Math.floor(page as number) : 1
  const requested = pageSize ?? DEFAULT_PAGE_SIZE
  const safePageSize = Math.min(Math.max(1, Math.floor(requested)), MAX_PAGE_SIZE)
  return { page: safePage, pageSize: safePageSize }
}

function validateTitle(title: string): string {
  const trimmed = title.trim()
  if (trimmed.length === 0) throw new AppError('El título del recordatorio no puede estar vacío.')
  if (trimmed.length > TITLE_MAX) {
    throw new AppError(`El título no puede superar ${TITLE_MAX} caracteres.`)
  }
  return trimmed
}

function validateMessage(message?: string | null): string | null {
  if (message == null) return null
  if (message.length > MESSAGE_MAX) {
    throw new AppError(`El mensaje no puede superar ${MESSAGE_MAX} caracteres.`)
  }
  
  return message.trim() || null
}

function validateRemindAt(remindAt: string): string {
  const parsed = Date.parse(remindAt)
  if (Number.isNaN(parsed)) {
    throw new AppError('La fecha del recordatorio no es válida.')
  }
  return new Date(parsed).toISOString()
}

export async function listReminders(
  params: ListRemindersParams = {},
): Promise<Paginated<ParkingReminder>> {
  const client = assertSupabaseConfigured()
  const userId = await getVerifiedUserId()
  const { page, pageSize } = clampPaging(params.page, params.pageSize)
  const from = (page - 1) * pageSize

  let query = client.from('parking_reminders').select('*', { count: 'exact' }).eq('user_id', userId)

  if (params.sessionId) {
    query = query.eq('session_id', params.sessionId)
  }
  if (params.status) {
    query = query.eq('status', params.status)
  }

  const { data, error, count } = await query
    .order('remind_at', { ascending: true })
    .range(from, from + pageSize - 1)

  if (error) {
    logTechnical('reminders/list', translateError(error))
    throw translateError(error)
  }

  return { data: data ?? [], page, pageSize, total: count ?? null }
}

export async function getReminderById(id: string): Promise<ParkingReminder | null> {
  const client = assertSupabaseConfigured()

  const { data, error } = await client
    .from('parking_reminders')
    .select('*')
    .eq('id', id)
    .maybeSingle()

  if (error) {
    logTechnical('reminders/getById', translateError(error))
    throw translateError(error)
  }

  return data
}

export async function createReminder(input: CreateReminderInput): Promise<ParkingReminder> {
  const client = assertSupabaseConfigured()
  const userId = await getVerifiedUserId()

  if (!isUuid(input.session_id)) {
    throw new AppError('El identificador de sesión no es válido.')
  }

  const { data, error } = await client
    .from('parking_reminders')
    .insert({
      user_id: userId,
      session_id: input.session_id,
      title: validateTitle(input.title),
      message: validateMessage(input.message),
      remind_at: validateRemindAt(input.remind_at),
      status: 'pending',
    })
    .select('*')
    .maybeSingle()

  if (error) {
    logTechnical('reminders/create', translateError(error))
    throw translateError(error)
  }

  if (!data) throw translateError(new Error('No se pudo crear el recordatorio.'))
  return data
}

export async function updateReminder(
  id: string,
  input: UpdateReminderInput,
): Promise<ParkingReminder> {
  const client = assertSupabaseConfigured()

  const payload: UpdateReminderInput = {}
  if (input.title !== undefined) payload.title = validateTitle(input.title)
  if (input.message !== undefined) payload.message = validateMessage(input.message)
  if (input.remind_at !== undefined) payload.remind_at = validateRemindAt(input.remind_at)
  if (input.status !== undefined) payload.status = input.status
  if (input.session_id !== undefined) {
    if (!isUuid(input.session_id)) {
      throw new AppError('El identificador de sesión no es válido.')
    }
    payload.session_id = input.session_id
  }

  if (Object.keys(payload).length === 0) {
    throw translateError(new Error('No hay cambios que guardar.'))
  }

  const { data, error } = await client
    .from('parking_reminders')
    .update(payload)
    .eq('id', id)
    .select('*')
    .maybeSingle()

  if (error) {
    logTechnical('reminders/update', translateError(error))
    throw translateError(error)
  }

  if (!data) throw translateError(new Error('No se encontró el recordatorio.'))
  return data
}

export async function deleteReminder(id: string): Promise<void> {
  const client = assertSupabaseConfigured()

  const { error } = await client.from('parking_reminders').delete().eq('id', id)

  if (error) {
    logTechnical('reminders/delete', translateError(error))
    throw translateError(error)
  }
}

/**
 * Marca un recordatorio como enviado.
 * OJO: sólo actualiza la fila. La notificación la envía Persona 5.
 */
export async function markReminderAsSent(id: string): Promise<ParkingReminder> {
  return updateReminder(id, { status: 'sent' })
}

export async function cancelReminder(id: string): Promise<ParkingReminder> {
  return updateReminder(id, { status: 'cancelled' })
}

/** Recordatorios `pending` cuya hora ya pasó. Base para Persona 5. */
export async function listDueReminders(now: Date = new Date()): Promise<ParkingReminder[]> {
  const client = assertSupabaseConfigured()
  const userId = await getVerifiedUserId()

  const { data, error } = await client
    .from('parking_reminders')
    .select('*')
    .eq('user_id', userId)
    .eq('status', 'pending')
    .lte('remind_at', now.toISOString())
    .order('remind_at', { ascending: true })

  if (error) {
    logTechnical('reminders/listDue', translateError(error))
    throw translateError(error)
  }

  return data ?? []
}