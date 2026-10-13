/**
 * Traducción de errores de Supabase/Postgres a mensajes en español.
 *
 * Sin dependencias de React Native: se puede testear con `npm test`.
 *
 * REGLA: nunca muestres `error.message` crudo de Supabase al usuario final;
 * puede filtrar nombres de tablas, políticas o columnas. El detalle técnico
 * se registra en consola (solo en desarrollo); el usuario ve texto limpio.
 */

/** Códigos SQLSTATE de Postgres relevantes para esta app. */
export const PG_ERROR = {
  uniqueViolation: '23505',
  foreignKeyViolation: '23503',
  notNullViolation: '23502',
  checkViolation: '23514',
  /** insufficient_privilege: operación permitida por la UI pero bloqueada por RLS. */
  insufficientPrivilege: '42501',
  invalidTextRepresentation: '22P02',
  invalidAuthorization: '28000',
  invalidToken: '28001',
} as const

/**
 * Error de la aplicación, listo para renderizar.
 * `technicalMessage` sólo se usa en consola durante desarrollo.
 */
export class AppError extends Error {
  readonly code: string | null
  readonly technicalMessage: string | null

  constructor(message: string, options?: { code?: string | null; technicalMessage?: string | null }) {
    super(message)
    this.name = 'AppError'
    this.code = options?.code ?? null
    this.technicalMessage = options?.technicalMessage ?? null
  }
}

/** Extrae el código y el mensaje técnico de cualquier error de Supabase. */
interface RawError {
  code?: unknown
  message?: unknown
  error_description?: unknown
}

function readCode(error: unknown): string | null {
  if (typeof error !== 'object' || error === null) return null
  const code = (error as RawError).code
  return typeof code === 'string' ? code : null
}

function readTechnicalMessage(error: unknown): string | null {
  if (typeof error !== 'object' || error === null) return null
  const raw = error as RawError
  const message = typeof raw.message === 'string' ? raw.message : null
  const description =
    typeof raw.error_description === 'string' ? raw.error_description : null
  return message ?? description ?? (typeof error === 'string' ? error : null)
}

/**
 * Convierte cualquier error en un mensaje mostrable en español.
 * Desconocidos -> mensaje genérico, nunca el texto crudo.
 */
export function translateError(error: unknown): AppError {
  const code = readCode(error)
  const technical = readTechnicalMessage(error)

  switch (code) {
    case PG_ERROR.invalidAuthorization:
    case PG_ERROR.invalidToken:
      return new AppError('Tu sesión expiró. Inicia sesión de nuevo.', {
        code,
        technicalMessage: technical,
      })

    case PG_ERROR.insufficientPrivilege:
      return new AppError('Tu rol no tiene permisos para realizar esta acción.', {
        code,
        technicalMessage: technical,
      })

    case PG_ERROR.uniqueViolation:
      // La app tiene una sola sesión activa por usuario; este código casi
      // siempre es ese índice parcial.
      if (technical?.includes('one_active_session_per_user')) {
        return new AppError(
          'Ya tienes una sesión activa. Completa la anterior antes de guardar otra.',
          { code, technicalMessage: technical },
        )
      }
      if (technical?.includes('parking_spaces_location_id_code_key')) {
        return new AppError('Ya existe un espacio con ese código en esta ubicación.', {
          code,
          technicalMessage: technical,
        })
      }
      if (technical?.includes('user_roles_pkey') || technical?.includes('user_roles_user_id_key')) {
        return new AppError('Este usuario ya tiene un rol asignado.', {
          code,
          technicalMessage: technical,
        })
      }
      return new AppError('Ese registro ya existe.', { code, technicalMessage: technical })

    case PG_ERROR.foreignKeyViolation:
      return new AppError('El registro relacionado no existe o ya fue eliminado.', {
        code,
        technicalMessage: technical,
      })

    case PG_ERROR.checkViolation:
      return new AppError('Los datos no cumplen las reglas del sistema.', {
        code,
        technicalMessage: technical,
      })

    case PG_ERROR.notNullViolation:
      return new AppError('Faltan datos obligatorios.', { code, technicalMessage: technical })

    case PG_ERROR.invalidTextRepresentation:
      return new AppError('Alguno de los valores enviados tiene un formato inválido.', {
        code,
        technicalMessage: technical,
      })

    default:
      break
  }

  // Errores de autenticación: mensajes frecuentes de GoTrue por texto.
  const lower = technical?.toLowerCase() ?? ''
  if (lower.includes('invalid login credentials')) {
    return new AppError('Correo o contraseña incorrectos.', { technicalMessage: technical })
  }
  if (lower.includes('email not confirmed')) {
    return new AppError('Revisa tu correo para confirmar la cuenta.', {
      technicalMessage: technical,
    })
  }
  if (lower.includes('user already registered')) {
    return new AppError('Ya existe una cuenta con ese correo.', { technicalMessage: technical })
  }
  if (lower.includes('password should be at least')) {
    return new AppError('La contraseña es demasiado corta.', { technicalMessage: technical })
  }
  if (lower.includes('rate limit') || code === '429') {
    return new AppError('Demasiados intentos. Espera un momento e inténtalo de nuevo.', {
      code,
      technicalMessage: technical,
    })
  }
  if (lower.includes('failed to fetch') || lower.includes('network')) {
    return new AppError('No se pudo conectar con el servidor. Revisa tu conexión.', {
      technicalMessage: technical,
    })
  }

  return new AppError('Ocurrió un error inesperado. Inténtalo de nuevo.', {
    code,
    technicalMessage: technical,
  })
}

/**
 * Marca los valores `EXPO_PUBLIC_*` ausentes. Se llama en el arranque para
 * que el error sea visible en pantalla y no un crash oscuro de Metro.
 */
export function missingEnvMessage(missing: readonly string[]): AppError {
  return new AppError(
    'Faltan variables de entorno de Supabase. Copia .env.example a .env y rellena EXPO_PUBLIC_SUPABASE_URL y EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY.',
    { code: 'ENV_MISSING', technicalMessage: `Faltan: ${missing.join(', ')}` },
  )
}

/**
 * Helper para logging: imprime el detalle técnico sólo en desarrollo.
 * Nunca expone el mensaje crudo de Postgres al usuario.
 */
export function logTechnical(context: string, error: AppError | unknown): void {
  if (!__DEV__) return
  if (error instanceof AppError) {
    console.warn(`[${context}] ${error.code ?? 'sin-codigo'}`, error.technicalMessage ?? error.message)
    return
  }
  console.warn(`[${context}]`, error)
}