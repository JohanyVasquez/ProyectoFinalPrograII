/**
 * Pantalla de carga provisional (Persona 1).
 *
 * Persona 2 puede sustituirla por su propio componente sin tocar nada más:
 * todas las rutas la usan a través de `<LoadingScreen />` y sólo dependen
 * de que exporte un componente.
 */

import { ActivityIndicator, StyleSheet, Text, View } from 'react-native'

export interface LoadingScreenProps {
  message?: string
}

export function LoadingScreen({ message = 'Cargando…' }: LoadingScreenProps) {
  return (
    <View style={styles.container} accessibilityRole="progressbar">
      <ActivityIndicator size="large" />
      <Text style={styles.message}>{message}</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    gap: 12,
  },
  message: {
    fontSize: 15,
    opacity: 0.7,
  },
})