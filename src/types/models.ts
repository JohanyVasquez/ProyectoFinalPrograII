/**
 * Modelos de dominio de ParkEasy.
 *
 * Son alias y tipos derivados de `database.types.ts`. Si necesitas un tipo
 * de fila, importa de `@/types/database.types`; aquí vive lo que las
 * pantallas necesitan (labels, filtros, formularios).
 */

import type {
  ReminderStatus,
  SessionStatus,
  SpaceStatus,
  UserRole,
} from '@/types/database.types'

export type { ReminderStatus, SessionStatus, SpaceStatus, UserRole }

/** Fila de `public.profiles`. */
export type Profile = import('@/types/database.types').TableRow<'profiles'>
/** Fila de `public.user_roles`. */
export type UserRoleRecord = import('@/types/database.types').TableRow<'user_roles'>
/** Fila de `public.parking_locations`. */
export type ParkingLocation = import('@/types/database.types').TableRow<'parking_locations'>
/** Fila de `public.parking_spaces`. */
export type ParkingSpace = import('@/types/database.types').TableRow<'parking_spaces'>
/** Fila de `public.parking_sessions`. */
export type ParkingSession = import('@/types/database.types').TableRow<'parking_sessions'>
/** Fila de `public.parking_reminders`. */
export type ParkingReminder = import('@/types/database.types').TableRow<'parking_reminders'>

/** Texto en español para cada valor de enum. Úsalo en las pantallas. */
export const ROLE_LABELS: Record<UserRole, string> = {
  user: 'Usuario',
  operator: 'Operador',
  admin: 'Administrador',
}

/**
 * El estado de un espacio es MANUAL: lo marca una persona y puede quedar
 * desactualizado. La app nunca debe presentarlo como disponibilidad en vivo.
 */
export const SPACE_STATUS_LABELS: Record<SpaceStatus, string> = {
  available: 'Disponible',
  occupied: 'Ocupado',
  maintenance: 'Mantenimiento',
}

export const SPACE_STATUS_VALUES = Object.keys(
  SPACE_STATUS_LABELS,
) as readonly SpaceStatus[]

export const SESSION_STATUS_LABELS: Record<SessionStatus, string> = {
  active: 'Activa',
  completed: 'Finalizada',
}

export const REMINDER_STATUS_LABELS: Record<ReminderStatus, string> = {
  pending: 'Pendiente',
  cancelled: 'Cancelado',
  sent: 'Enviado',
}

/** Un rol de staff puede, como mínimo, marcar el estado manual de un espacio. */
export function canManageSpaceStatus(role: UserRole | null): boolean {
  return role === 'admin' || role === 'operator'
}

/** Crear/editar/eliminar ubicaciones y espacios es exclusivo de admin. */
export function canManageParkingCatalog(role: UserRole | null): boolean {
  return role === 'admin'
}

/** Una página de resultados con metadatos de paginación. */
export interface Paginated<T> {
  data: T[]
  page: number
  pageSize: number
  /** `null` cuando el total no está disponible. */
  total: number | null
}

/** Rango de valores para los filtros de listado. */
export interface Coordinates {
  latitude: number
  longitude: number
}