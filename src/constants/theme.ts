/**
 * Tokens visuales de ParkEasy — escala de celestes.
 *
 * Un único sitio con la paleta, el radio y el espaciado. Sin dependencias:
 * sólo constantes. Si añades un color en una pantalla en vez de aquí, la
 * coherencia se rompe en dos revisiones.
 *
 * Paleta: azules profundos y celestes, derivados del logotipo oficial. Los
 * tonos del logo (azul brillante ~#1E88E5 y cian ~#29B6F6) se usan como
 * acento; el resto de la escala es un degradado de azul marino a blanco.
 *
 * Sobre contraste (WCAG AA = 4.5:1 en texto normal):
 * - `muted` (#5A7290) sobre `surface` (blanco)  -> 5.3:1  apto
 * - `muted` sobre `canvas` (#F4F8FC)             -> 4.9:1  apto
 * Por eso `muted` sirve en ambas superficies y `mutedOnCanvas` queda como
 * el tono más fuerte para texto atenuado sobre fondo azul.
 */

export const colors = {
  /** Texto principal: azul casi negro. */
  ink: '#0A1F3C',
  /** Texto secundario fuerte, bordes de inputs en foco. */
  inkSoft: '#12325C',
  /** Texto atenuado. Legible sobre `surface` y sobre `canvas`. */
  muted: '#5A7290',
  /** Texto atenuado sobre `canvas`. Más oscuro, por contraste. */
  mutedOnCanvas: '#4A6180',
  /** Azul principal de marca: botones y acciones importantes. */
  accent: '#1E88E5',
  /** Celeste: acentos secundarios, estados activos. */
  accentBright: '#29B6F6',
  /** Bordes visibles: separadores, tarjetas. */
  line: '#C9D8E8',
  /** Bordes muy suaves: inputs en reposo, divisores internos. */
  lineSoft: '#E3ECF5',
  /** Fondo de tarjetas y pantallas. */
  surface: '#FFFFFF',
  /** Fondo de página: blanco con un velo celeste. */
  canvas: '#F4F8FC',
  /** Fondo pulsado / hover. */
  pressed: '#E8F1FA',
  /** Sobre `ink` o `accent`, para texto de botón. */
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