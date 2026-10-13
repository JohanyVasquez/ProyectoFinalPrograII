/**
 * Rutas de navegación de ParkEasy.
 *
 * Única fuente de verdad para los paths. Usa `as const` + `satisfies` para
 * que TypeScript detects un path mal escrito en `router.push('/typo')`.
 *
 * Los grupos `(auth)` y `(app)` NO forman parte de la URL: no aparecen aquí.
 */

export const ROUTES = {
  login: '/login',
  register: '/register',

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