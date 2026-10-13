/**
 * Tests del mapeo de errores de Supabase a mensajes en español.
 *
 * Es la pieza que evita filtrar detalles técnicos al usuario (nombres de
 * tablas, políticas RLS). Si una regresión hace que un error crudo llegue a
 * la UI, estos tests lo detectan.
 *
 * Ejecutar con: npm test
 */

import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { AppError, missingEnvMessage, PG_ERROR, translateError } from '@/lib/errors'

describe('translateError', () => {
  it('traduce credenciales inválidas', () => {
    const error = translateError({ message: 'Invalid login credentials' })
    assert.equal(error.message, 'Correo o contraseña incorrectos.')
  })

  it('traduce email no confirmado', () => {
    const error = translateError({ message: 'Email not confirmed' })
    assert.equal(error.message, 'Revisa tu correo para confirmar la cuenta.')
  })

  it('traduce usuario ya registrado', () => {
    const error = translateError({ message: 'User already registered' })
    assert.equal(error.message, 'Ya existe una cuenta con ese correo.')
  })

  it('explica el índice de una sola sesión activa', () => {
    const error = translateError({
      code: PG_ERROR.uniqueViolation,
      message: 'duplicate key value violates unique constraint "one_active_session_per_user"',
    })
    assert.match(error.message, /sesión activa/i)
    assert.match(error.message, /Completa la anterior/i)
  })

  it('explica el código de espacio duplicado', () => {
    // `unique(location_id, code)` genera este nombre de constraint.
    const error = translateError({
      code: PG_ERROR.uniqueViolation,
      message: 'duplicate key value violates unique constraint "parking_spaces_location_id_code_key"',
    })
    assert.match(error.message, /código/i)
  })

  it('cae en el mensaje genérico si el nombre del constraint cambia', () => {
    const error = translateError({
      code: PG_ERROR.uniqueViolation,
      message: 'duplicate key value violates unique constraint "otro_constraint_key"',
    })
    assert.match(error.message, /ya existe/i)
  })

  it('traduce RLS insuficiente sin filtrar la política', () => {
    const error = translateError({
      code: PG_ERROR.insufficientPrivilege,
      message: 'new row violates row-level security policy "parking_spaces_insert_admin"',
    })
    assert.match(error.message, /no tiene permisos/i)
    // El detalle técnico se conserva aparte para logs, nunca en `message`.
    assert.doesNotMatch(error.message, /row-level security/)
    assert.match(error.technicalMessage ?? '', /row-level security/)
  })

  it('traduce sesión expirada', () => {
    const error = translateError({ code: PG_ERROR.invalidToken, message: 'JWT expired' })
    assert.match(error.message, /sesión expiró/i)
  })

  it('traduce error de red', () => {
    const error = translateError(new Error('TypeError: Failed to fetch'))
    assert.match(error.message, /conectar/i)
  })

  it('nunca devuelve el mensaje crudo para errores desconocidos', () => {
    const raw = 'column parking_spaces.status does not exist'
    const error = translateError({ message: raw, code: 'PGRST204' })
    assert.doesNotMatch(error.message, /parking_spaces/)
    assert.match(error.message, /error inesperado/i)
    assert.match(error.technicalMessage ?? '', /parking_spaces/)
  })

  it('tolera valores no-objeto', () => {
    const error = translateError(undefined)
    assert.ok(error instanceof AppError)
    assert.equal(error.message.length > 0, true)
  })
})

describe('missingEnvMessage', () => {
  it('menciona las variables que faltan y cómo resolverlo', () => {
    const error = missingEnvMessage(['EXPO_PUBLIC_SUPABASE_URL'])
    assert.match(error.message, /\.env/)
    assert.match(error.message, /EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY/)
    assert.match(error.technicalMessage ?? '', /EXPO_PUBLIC_SUPABASE_URL/)
  })
})