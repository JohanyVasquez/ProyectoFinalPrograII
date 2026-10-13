/**
 * Tokens visuales de ParkEasy — identidad monocromática.
 *
 * Un único sitio con la paleta, el radio y el espaciado. Sin dependencias:
 * sólo constantes. Si añades un color en una pantalla en vez de aquí, la
 * coherencia se rompe en dos revisioness.
 *
 * Paleta: escala de grises, sin color.
 *
 * Sobre contraste (WCAG AA = 4.5:1 en texto normal):
 * - `muted` (#737373) sobre `surface` (blanco) = 4.7:1  -> apto
 * - `muted` sobre `canvas` (#F5F5F5) = 4.3:1           -> NO apto
 * Por eso existe `mutedOnCanvas`: úsala para texto atenuado sobre el fondo
 * gris, nunca `muted`. `mutedOnCanvas` da 6.3:1.
 */

export const colors = {
  /** Texto principal, acciones importantes, iconos. */
  ink: '#111111',
  /** Texto secundario fuerte, bordes de inputs en foco. */
  inkSoft: '#262626',
  /** Texto atenuado sobre superficie blanca. */
  muted: '#737373',
  /** Texto atenuado sobre `canvas`. Mismo gris, más oscuro, por contraste. */
  mutedOnCanvas: '#5A5A5A',
  /** Bordes visibles: separadores, tarjetas. */
  line: '#D4D4D4',
  /** Bordes muy suaves: inputs en reposo, divisores internos. */
  lineSoft: '#E6E6E6',
  /** Fondo de tarjetas y pantallas. */
  surface: '#FFFFFF',
  /** Fondo de página. */
  canvas: '#F5F5F5',
  /** Fondo pulsado / hover. */
  pressed: '#EDEDED',
  /** Sobre `ink`, para texto de botón primario. */
  onInk: '#FFFFFF',
} as const

/** Escala de espaciado. Múltiplos de 4 para que todo cuadre. */
export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 28,
  xxxl: 40,
} as const

/** Radios. "Ligeramente redondeados", nada de cápsulas. */
export const radius = {
  sm: 6,
  md: 10,
  lg: 14,
  pill: 999,
} as const

/**
 * Escala tipográfica. `fontWeight` en números y `letterSpacing` sutil: son los
 * dos ajustes que más cambian la percepción de una app sin tocar fuentes.
 */
export const typography = {
  display: { fontSize: 30, fontWeight: '700', letterSpacing: -0.6 },
  title: { fontSize: 22, fontWeight: '700', letterSpacing: -0.3 },
  section: { fontSize: 12, fontWeight: '700', letterSpacing: 0.8 },
  body: { fontSize: 15, fontWeight: '400' },
  bodyStrong: { fontSize: 15, fontWeight: '600' },
  label: { fontSize: 13, fontWeight: '500' },
  caption: { fontSize: 12, fontWeight: '400' },
} as const

/** Altura mínima de un control táctil. Recomendación de accesibilidad. */
export const HIT_SLOP_MIN = 48