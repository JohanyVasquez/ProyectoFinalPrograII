/**
 * Mensaje de error (Persona 2).
 *
 * Sin cambios de comportamiento ni de props: sólo se recolorea a la paleta
 * monocromática. Un error en rojo era el único color fuera de la escala de
 * grises, y rompía la identidad visual.
 */

import { StyleSheet, Text, View } from 'react-native'

import { colors, radius, spacing, typography } from '@/constants/theme'

export interface ErrorMessageProps {
  /** Mensaje en español. Si se pasa un error sin traducir, se muestra su `message`. */
  message?: string | null
  title?: string
  onRetry?: () => void
}

export function ErrorMessage({ message, title = 'Algo salió mal', onRetry }: ErrorMessageProps) {
  if (!message) return null

  return (
    <View style={styles.container} accessibilityRole="alert">
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.message}>{message}</Text>
      {onRetry ? (
        <Text style={styles.retry} onPress={onRetry} accessibilityRole="button">
          Reintentar
        </Text>
      ) : null}
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line,
    borderLeftWidth: 3,
    borderRadius: radius.sm,
    padding: spacing.lg,
    marginBottom: spacing.lg,
    gap: spacing.xs,
  },
  title: {
    ...typography.bodyStrong,
    color: colors.ink,
  },
  message: {
    ...typography.caption,
    color: colors.inkSoft,
    lineHeight: 18,
  },
  retry: {
    ...typography.label,
    color: colors.ink,
    textDecorationLine: 'underline',
    paddingTop: spacing.xs,
  },
})