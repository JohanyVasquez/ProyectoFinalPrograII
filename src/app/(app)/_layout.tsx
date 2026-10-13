/**
 * Grupo de rutas privadas: todo lo que exige sesión.
 *
 * La protección está en el layout raíz (`Stack.Protected`). Este layout sólo
 * configura el header de cada pantalla. Persona 2 ajusta aquí el estilo
 * final (colores, títulos, transiciones) sin tocar la lógica de auth.
 */

import { Stack } from 'expo-router'

import { colors } from '@/constants/theme'

export default function AppLayout() {
  return (
    <Stack
      screenOptions={{
        // Header monocromático: fondo blanco, texto casi negro, sin sombra.
        headerStyle: { backgroundColor: colors.surface },
        headerShadowVisible: false,
        headerTintColor: colors.ink,
        headerTitleStyle: { color: colors.ink, fontWeight: '600' },
        contentStyle: { backgroundColor: colors.canvas },
      }}
    >
      <Stack.Screen name="index" options={{ title: 'ParkEasy' }} />
      <Stack.Screen name="parking/index" options={{ title: 'Estacionamientos' }} />
      <Stack.Screen name="vehicle/index" options={{ title: 'Mi vehículo' }} />
      <Stack.Screen name="history/index" options={{ title: 'Historial' }} />
      <Stack.Screen name="profile/index" options={{ title: 'Perfil' }} />
    </Stack>
  )
}