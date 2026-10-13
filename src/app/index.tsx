/**
 * Ruta raíz `/`.
 *
 * NO contiene lógica de auth. Cuando `Stack.Protected` protege el grupo
 * `(app)`, esta ruta ya no es alcanzable y el router redirige al ancla
 * (`/(auth)/login`). Existe sólo para que el árbol de Expo Router tenga un
 * punto de entrada válido y para no depender del comportamiento de
 * redirección por defecto.
 *
 * Si esta pantalla aparece, significa que se rompió la protección: comprobar
 * `isLoading` e `isAuthenticated` en `src/app/_layout.tsx`.
 */

import { Redirect } from 'expo-router'

import { LoadingScreen } from '@/components/common/LoadingScreen'
import { ROUTES } from '@/constants/routes'
import { useAuth } from '@/hooks/useAuth'

export default function IndexScreen() {
  const { isLoading, isAuthenticated } = useAuth()

  if (isLoading) return <LoadingScreen />

  return <Redirect href={isAuthenticated ? ROUTES.home : ROUTES.login} />
}