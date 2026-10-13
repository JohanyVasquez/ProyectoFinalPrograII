/**
 * Pantalla de carga (Persona 2).
 *
 * Mismo contrato: exporta `LoadingScreen` con una prop `message?`.
 * Se muestra en el arranque de la app mientras se restaura la sesión, así que
 * su fondo debe coincidir con el de las pantallas para que no parpadee.
 */

import { ActivityIndicator, StyleSheet, Text, View } from 'react-native'

import { colors, spacing, typography } from '@/constants/theme'

export interface LoadingScreenProps {
  message?: string
}

export function LoadingScreen({ message = 'Cargando…' }: LoadingScreenProps) {
  return (
    <View style={styles.container} accessibilityRole="progressbar">
      <ActivityIndicator size="large" color={colors.ink} />
      <Text style={styles.message}>{message}</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xl,
    gap: spacing.md,
    backgroundColor: colors.canvas,
  },
  message: {
    ...typography.body,
    color: colors.mutedOnCanvas,
  },
})