/**
 * Layout raíz de ParkEasy.
 *
 * Hace tres cosas y ninguna más:
 * 1. Envuelve toda la app en `AuthProvider`.
 * 2. Espera a que la sesión se restaure (`isLoading`) para no mostrar un
 *    flash de la pantalla privada antes de tiempo.
 * 3. Monta el Stack con `Stack.Protected`: los grupos `(app)` y `(auth)`
 *    se protegen mutuamente.
 *
 * Persona 2 puede envolver en providers nuevos (tema, i18n) AQUÍ, sin tocar
 * las rutas.
 *
 * SDK 57: `Stack.Protected` acepta `guard`, pero NO `redirectTo` (eso es
 * SDK 58+). Cuando el guard es falso, React Navigation redirige al ancla.
 */

import { Stack } from 'expo-router'
import { StatusBar } from 'expo-status-bar'

import { ErrorMessage } from '@/components/common/ErrorMessage'
import { LoadingScreen } from '@/components/common/LoadingScreen'
import { AuthProvider, useAuth } from '@/hooks/useAuth'

function RootNavigator() {
  const { isLoading, isAuthenticated, configError } = useAuth()

  if (configError) {
    return (
      <ErrorMessage
        title="Falta configurar Supabase"
        message={configError.message}
      />
    )
  }

  if (isLoading) {
    return <LoadingScreen message="Restaurando sesión…" />
  }

  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Protected guard={!isAuthenticated}>
        <Stack.Screen name="(auth)" />
      </Stack.Protected>

      <Stack.Protected guard={isAuthenticated}>
        <Stack.Screen name="(app)" />
      </Stack.Protected>
    </Stack>
  )
}

export default function RootLayout() {
  return (
    <AuthProvider>
      <StatusBar style="dark" />
      <RootNavigator />
    </AuthProvider>
  )
}