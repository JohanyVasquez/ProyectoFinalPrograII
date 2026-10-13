/**
 * Pantalla placeholder para los módulos de otras personas.
 *
 * Persona 3 (listado de espacios), Persona 4 (GPS/mapa) y Persona 5
 * (historial) reemplazarán el contenido de estas pantallas. Esta versión
 * sólo confirma que la ruta está protegida y que el usuario puede navegar;
 * NO implementa lógica de esos módulos.
 */

import { StyleSheet, Text, View } from 'react-native'
import { Stack } from 'expo-router'

export interface PlaceholderScreenProps {
  title: string
  description: string
  owner: string
}

export function PlaceholderScreen({ title, description, owner }: PlaceholderScreenProps) {
  return (
    <>
      <Stack.Screen options={{ title }} />
      <View style={styles.container}>
        <Text style={styles.title}>{title}</Text>
        <Text style={styles.description}>{description}</Text>
        <Text style={styles.owner}>Módulo de {owner} — todavía no implementado.</Text>
      </View>
    </>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    gap: 8,
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
  },
  description: {
    fontSize: 15,
    textAlign: 'center',
    opacity: 0.75,
  },
  owner: {
    fontSize: 13,
    opacity: 0.5,
    marginTop: 8,
  },
})