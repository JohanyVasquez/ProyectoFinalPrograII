/**
 * Mensaje de error provisional (Persona 1).
 *
 * Muestra texto ya traducido por `translateError`, nunca el error crudo de
 * Supabase: podría filtrar nombres de tablas o políticas.
 */

import { StyleSheet, Text, View } from 'react-native'

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
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#c0392b',
    backgroundColor: '#fdecea',
    gap: 4,
  },
  title: {
    fontWeight: '600',
    color: '#922b21',
  },
  message: {
    color: '#922b21',
  },
  retry: {
    marginTop: 4,
    color: '#922b21',
    textDecorationLine: 'underline',
  },
})