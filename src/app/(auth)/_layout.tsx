/**
 * Grupo de rutas públicas: Login y Registro.
 *
 * Solo accesible sin sesión. La protección la hace `Stack.Protected` en el
 * layout raíz; aquí sólo se declaran las pantallas del grupo.
 */

import { Stack } from 'expo-router'

export default function AuthLayout() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="login" />
      <Stack.Screen name="register" />
    </Stack>
  )
}