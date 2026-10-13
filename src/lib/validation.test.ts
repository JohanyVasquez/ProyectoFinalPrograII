/**
 * Tests de la validación de entrada.
 *
 * Estos helpers concentran la lógica pura y son el único punto donde una
 * regresión pasaría desapercibida: un `escapeLikePattern` roto convertiría
 * una búsqueda en un comodín que descarga la tabla entera.
 *
 * Ejecutar con: npm test
 */

import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import {
  areValidCoordinates,
  escapeLikePattern,
  isUuid,
  isValidAccuracy,
  isValidEmail,
  isValidFullName,
  isValidGuatemalaPhone,
  isValidLatitude,
  isValidLongitude,
  isValidPassword,
  joinErrors,
  normalizeEmail,
  phoneDigitsOnly,
} from '@/lib/validation'

describe('normalizeEmail', () => {
  it('recorta espacios y baja a minúsculas', () => {
    assert.equal(normalizeEmail('  Juan@Example.COM '), 'juan@example.com')
  })
})

describe('isValidEmail', () => {
  it('acepta direcciones válidas', () => {
    assert.equal(isValidEmail('juan@example.com'), true)
    assert.equal(isValidEmail('  a.b+tag@sub.dominio.co  '), true)
  })

  it('rechaza entradas sin @ o sin dominio', () => {
    assert.equal(isValidEmail('juanexample.com'), false)
    assert.equal(isValidEmail('juan@'), false)
    assert.equal(isValidEmail('juan@example'), false)
    assert.equal(isValidEmail('@example.com'), false)
    assert.equal(isValidEmail('con espacio@example.com'), false)
  })
})

describe('isValidFullName', () => {
  it('rechaza vacío o sólo espacios', () => {
    assert.equal(isValidFullName(''), false)
    assert.equal(isValidFullName('    '), false)
  })

  it('rechaza más de 120 caracteres', () => {
    assert.equal(isValidFullName('a'.repeat(120)), true)
    assert.equal(isValidFullName('a'.repeat(121)), false)
  })
})

describe('isValidPassword', () => {
  it('exige al menos 8 caracteres', () => {
    assert.equal(isValidPassword('1234567'), false)
    assert.equal(isValidPassword('12345678'), true)
  })
})

describe('isUuid', () => {
  it('acepta UUID v4 y rechaza otros formatos', () => {
    assert.equal(isUuid('9f1b1a4e-0c1f-4b3e-8f2a-1c2d3e4f5a6b'), true)
    assert.equal(isUuid('9F1B1A4E-0C1F-4B3E-8F2A-1C2D3E4F5A6B'), true)
    assert.equal(isUuid('no-es-uuid'), false)
    assert.equal(isUuid(''), false)
  })
})

describe('coordenadas', () => {
  it('acepta los límites del rango', () => {
    assert.equal(isValidLatitude(-90), true)
    assert.equal(isValidLatitude(90), true)
    assert.equal(isValidLongitude(-180), true)
    assert.equal(isValidLongitude(180), true)
  })

  it('rechaza valores fuera de rango', () => {
    assert.equal(isValidLatitude(90.1), false)
    assert.equal(isValidLatitude(-90.1), false)
    assert.equal(isValidLongitude(180.1), false)
    assert.equal(isValidLongitude(-180.1), false)
  })

  it('rechaza NaN e Infinity', () => {
    assert.equal(isValidLatitude(Number.NaN), false)
    assert.equal(isValidLongitude(Number.POSITIVE_INFINITY), false)
    assert.equal(areValidCoordinates(Number.NaN, 0), false)
  })

  it('valida el par completo', () => {
    assert.equal(areValidCoordinates(-33.4372, -70.6506), true)
    assert.equal(areValidCoordinates(-33.4372, 200), false)
  })
})

describe('isValidAccuracy', () => {
  it('rechaza negativos y no finitos', () => {
    assert.equal(isValidAccuracy(0), true)
    assert.equal(isValidAccuracy(12.5), true)
    assert.equal(isValidAccuracy(-1), false)
    assert.equal(isValidAccuracy(Number.NaN), false)
  })
})

describe('escapeLikePattern', () => {
  it('escapa los comodines de SQL LIKE', () => {
    assert.equal(escapeLikePattern('100%'), '100\\%')
    assert.equal(escapeLikePattern('a_b'), 'a\\_b')
    assert.equal(escapeLikePattern('c\\d'), 'c\\\\d')
  })

  it('deja intacto el texto normal', () => {
    assert.equal(escapeLikePattern('Estacionamiento Central'), 'Estacionamiento Central')
  })
})

describe('teléfono de Guatemala', () => {
  it('acepta el formato local de 8 dígitos', () => {
    assert.equal(isValidGuatemalaPhone('51234567'), true)
    assert.equal(isValidGuatemalaPhone('22223333'), true)
  })

  it('acepta espacios, guiones y paréntesis como separadores', () => {
    assert.equal(isValidGuatemalaPhone('5123 4567'), true)
    assert.equal(isValidGuatemalaPhone('5123-4567'), true)
    assert.equal(isValidGuatemalaPhone('(5123) 4567'), true)
    assert.equal(isValidGuatemalaPhone('  5123 4567  '), true)
  })

  it('acepta el prefijo +502 con y sin signos', () => {
    assert.equal(isValidGuatemalaPhone('+502 5123 4567'), true)
    assert.equal(isValidGuatemalaPhone('+502-5123-4567'), true)
    assert.equal(isValidGuatemalaPhone('50251234567'), true)
    assert.equal(isValidGuatemalaPhone('+50251234567'), true)
  })

  it('rechaza longitudes que no cuadran', () => {
    assert.equal(isValidGuatemalaPhone('512345'), false) // 6 dígitos
    assert.equal(isValidGuatemalaPhone('5123456789'), false) // 10, ni local ni +502
    assert.equal(isValidGuatemalaPhone('+502 5123 45'), false) // prefijo + 7
  })

  it('rechaza vacío y valores sin dígitos', () => {
    // "" es una decisión del llamador (borrar el campo), no un formato válido.
    assert.equal(isValidGuatemalaPhone(''), false)
    assert.equal(isValidGuatemalaPhone('   '), false)
    assert.equal(isValidGuatemalaPhone('abc-defg'), false)
  })

  it('rechaza un prefijo internacional distinto de 502', () => {
    assert.equal(isValidGuatemalaPhone('+1 5123456789'), false)
    assert.equal(isValidGuatemalaPhone('503 51234567'), false)
  })

  it('extrae sólo dígitos para contar', () => {
    assert.equal(phoneDigitsOnly('+502 (5123) 4567'), '50251234567')
    assert.equal(phoneDigitsOnly('5123-4567'), '51234567')
    assert.equal(phoneDigitsOnly('sin dígitos'), '')
  })
})

describe('joinErrors', () => {
  it('devuelve null si no hay errores', () => {
    assert.equal(joinErrors([null, null]), null)
  })

  it('une los mensajes presentes', () => {
    assert.equal(joinErrors([null, 'a', 'b']), 'a b')
  })
})