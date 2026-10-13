/**
 * Logotipo oficial de ParkEasy (Persona 2).
 *
 * Componente único para las cuatro pantallas que lo muestran, para que el
 * tamaño y la proporción se definan en un solo sitio.
 *
 * Sobre el asset: `assets/images/parkeasy-logo.png` (512×512, 85 KB) es un
 * derivado del original de 1254×1254 que trajiste en `assets/parkeasy-logo.png`.
 * El original no se toca. El derivado va reescalado (bicúbica) y con el fondo
 * blancotransparentado mediante relleno por inundación desde los bordes, que
 * respeta el blanco INTERIOR del logo (la pantalla del teléfono). Ese fondo
 * transparente es lo que evita que se vea un cuadro blanco sobre el fondo
 * celeste de la app.
 *
 * Si necesitas regenerarlo: `scripts/optimize-logo.ps1`.
 */

import { Image, StyleSheet, View, type ImageSourcePropType } from 'react-native'

import { radius } from '@/constants/theme'

/** @format png */
const LOGO_SOURCE: ImageSourcePropType = require('@/../assets/images/parkeasy-logo.png')

/** Tamaños pensados para cada contexto. Alturas en dp. */
export const LOGO_SIZES = {
  /** Encabezado del perfil. */
  sm: 40,
  /** Junto al saludo de inicio. */
  md: 56,
  /** Login y registro. */
  lg: 96,
} as const

export type LogoSize = keyof typeof LOGO_SIZES

export interface LogoProps {
  size?: LogoSize
  /**
   * Si el logo va sobre un fondo de color, pasa aquí ese color y el componente
   * pinta un `View` detrás con ese mismo tono. Si el fondo es transparente,
   * no hace nada. Evita depender del color del padre.
   */
  backgroundColor?: string
  /** Ancho del contenedor cuando se pasa `backgroundColor`. */
  backgroundPadding?: number
  accessibilityLabel?: string
}

export function Logo({
  size = 'md',
  backgroundColor,
  backgroundPadding = 12,
  accessibilityLabel = 'ParkEasy',
}: LogoProps) {
  const height = LOGO_SIZES[size]
  const width = height // El asset es cuadrado; Image mantiene la proporción.

  const image = (
    <Image
      source={LOGO_SOURCE}
      // `contain` preserva las proporciones aunque el contenedor no sea
      // cuadrado. Nunca `stretch`, que deformaría el logo.
      resizeMode="contain"
      style={{ width, height }}
      // El PNG ya está optimizado a 512 px, así que basta un solo nivel.
      // Image no reescala en nativo; esto afecta sobre todo a web.
      accessibilityRole="image"
      accessibilityLabel={accessibilityLabel}
    />
  )

  if (!backgroundColor) return image

  return (
    <View
      style={[
        styles.plate,
        {
          backgroundColor,
          width: width + backgroundPadding * 2,
          height: height + backgroundPadding * 2,
          borderRadius: radius.lg,
        },
      ]}
    >
      {image}
    </View>
  )
}

const styles = StyleSheet.create({
  plate: {
    alignItems: 'center',
    justifyContent: 'center',
  },
})