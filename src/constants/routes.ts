/**
 * Rutas de navegación de ParkEasy.
 *
 * Única fuente de verdad para los paths. Usa `as const` + `satisfies` para
 * que TypeScript detecte un path mal escrito en `router.push('/typo')`.
 *
 * Los grupos `(auth)` y `(app)` NO forman parte de la URL: no aparecen aquí.
 *
 * IMPORTANTE: NO crees `src/app/index.tsx`. `/(app)/index.tsx` ya produce `/`,
 * y un `index.tsx` en la raíz genera una ruta duplicada en `/` (Expo Router
 * aceptaría ambas y una pisaría a la otra). El ancla para usuarios sin sesión
 * es `(auth)/login`, no `/`: con `Stack.Protected`, cuando el grupo `(app)`
 * queda deshabilitado React Navigation redirige a la primera pantalla
 * disponible, y en `(auth)/_layout.tsx` la primera declarada es `login`.
 */

export const ROUTES = {
  /** Ancla de las rutas públicas. Primera pantalla declarada en `(auth)`. */
  login: '/login',
  register: '/register',

  /** Inicio del área privada: lo produce `(app)/index.tsx`. */
  home: '/',
  parking: '/parking',
  vehicle: '/vehicle',
  history: '/history',
  profile: '/profile',
} as const

export type Route = (typeof ROUTES)[keyof typeof ROUTES]

/** Rutas que sólo existen para usuarios con sesión. */
export const PRIVATE_ROUTES = [
  ROUTES.home,
  ROUTES.parking,
  ROUTES.vehicle,
  ROUTES.history,
  ROUTES.profile,
] as const satisfies readonly Route[]

/** Rutas públicas: Login y Registro. */
export const AUTH_ROUTES = [ROUTES.login, ROUTES.register] as const satisfies readonly Route[]