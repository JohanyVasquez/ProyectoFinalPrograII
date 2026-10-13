/**
 * Validación de entrada, compartida por formularios y servicios.
 *
 * Deliberadamente sin dependencias de React Native: la app la usa en
 * `onChange` y los tests la ejercitan con el runner de Node.
 *
 * La validación del cliente es una COMODIDAD, no una garantía: la base de
 * datos vuelve a validar rangos (CHECK) y permisos (RLS). No confíes
 * únicamente en estas funciones para autorización.
 */

export const FULL_NAME_MAX = 120
export const PASSWORD_MIN = 8
/** `parking_sessions.note` acepta hasta 1000 caracteres (CHECK en SQL). */
export const NOTE_MAX = 1000
/** `profiles.phone` acepta hasta 25 caracteres (CHECK en SQL). */
export const PHONE_MAX = 25
/** `parking_locations.name` admite 1..120 caracteres tras `btrim`. */
export const LOCATION_NAME_MAX = 120
/** `parking_spaces.code` admite 1..30 caracteres tras `btrim`. */
export const SPACE_CODE_MAX = 30

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase()
}

export function isValidEmail(email: string): boolean {
  return EMAIL_RE.test(email.trim())
}

export function isValidFullName(fullName: string): boolean {
  const trimmed = fullName.trim()
  return trimmed.length > 0 && trimmed.length <= FULL_NAME_MAX
}

export function isValidPassword(password: string): boolean {
  return password.length >= PASSWORD_MIN
}

export function isUuid(value: string): boolean {
  return UUID_RE.test(value.trim())
}

/** Latitud válida: número finito en [-90, 90]. */
export function isValidLatitude(value: number): boolean {
  return Number.isFinite(value) && value >= -90 && value <= 90
}

/** Longitud válida: número finito en [-180, 180]. */
export function isValidLongitude(value: number): boolean {
  return Number.isFinite(value) && value >= -180 && value <= 180
}

/** Precisión GPS en metros: finita y no negativa. */
export function isValidAccuracy(value: number): boolean {
  return Number.isFinite(value) && value >= 0
}

export function areValidCoordinates(latitude: number, longitude: number): boolean {
  return isValidLatitude(latitude) && isValidLongitude(longitude)
}

/**
 * Escapa `%`, `_` y `\` para que un `ilike` no se convierta en comodín.
 * Sin esto, buscar "%" devolvería la tabla entera.
 */
export function escapeLikePattern(term: string): string {
  return term.replace(/[\\%_]/g, (char) => `\\${char}`)
}

/**
 * Une varios mensajes en uno solo. Devuelve `null` si no hay errores,
 * para poder hacer `if (error) setError(error)`.
 */
export function joinErrors(errors: readonly (string | null)[]): string | null {
  const present = errors.filter((error): error is string => Boolean(error))
  return present.length > 0 ? present.join(' ') : null
}