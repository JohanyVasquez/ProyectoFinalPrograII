/**
 * Fuente única de verdad del estado de autenticación.
 *
 * Las pantallas NO crean su propio estado de auth ni llaman a
 * `supabase.auth` directamente: leen de aquí con `useAuth()`.
 *
 * Detalles de implementación que importan:
 * - `getClaims()` (no `getSession()`) es lo que valida el JWT contra el
 *   servidor. `getSession()` lee sólo el almacenamiento local y podría
 *   devolver una sesión caducada.
 * - El callback de `onAuthStateChange` NO hace `await` dentro: el SDK
 *   recomienda devolver la promesa hacia fuera para evitar interbloqueos.
 *   La carga de perfil se dispara fuera, en un efecto.
 * - Al cambiar de cuenta, el perfil del usuario anterior se limpia ANTES
 *   de pedir el nuevo: si no, se vería el nombre de otra persona un instante.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import type { Session, User } from '@supabase/supabase-js'

import { AppError, logTechnical, translateError } from '@/lib/errors'
import { configError, supabase } from '@/lib/supabase'
import {
  login as loginService,
  logout as logoutService,
  register as registerService,
  type RegisterResult,
} from '@/services/auth.service'
import { getMyProfileWithRole } from '@/services/profile.service'
import type { Profile } from '@/services/profile.service'
import type { UserRole } from '@/types/database.types'

export interface AuthContextValue {
  user: User | null
  session: Session | null
  profile: Profile | null
  role: UserRole | null
  /** `true` mientras se restaura la sesión al arrancar. Evita el flash de pantallas privadas. */
  isLoading: boolean
  isAuthenticated: boolean
  /** Error de configuración de `.env`, si falta algo. */
  configError: AppError | null
  signUp: (input: { fullName: string; email: string; password: string }) => Promise<RegisterResult>
  signIn: (input: { email: string; password: string }) => Promise<void>
  signOut: () => Promise<void>
  refreshProfile: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [role, setRole] = useState<UserRole | null>(null)
  // Sin cliente de Supabase no hay nada que restaurar, así que se arranca
  // ya en `false`. Hacerlo con un setState dentro del efecto provocaría un
  // render en cascada (regla react-hooks/set-state-in-effect).
  const [isLoading, setIsLoading] = useState(supabase !== null)

  // Guarda el userId para el que se cargó el perfil. Evita que la respuesta
  // de una petición lenta se pinte sobre el usuario que acaba de entrar.
  const profileOwnerRef = useRef<string | null>(null)

  const clearLocalState = useCallback(() => {
    profileOwnerRef.current = null
    setProfile(null)
    setRole(null)
  }, [])

  const loadProfileFor = useCallback(async (userId: string) => {
    try {
      const { profile: loadedProfile, role: loadedRole } = await getMyProfileWithRole()
      // Si mientras cargábamos el usuario cambió de cuenta, se descarta.
      if (profileOwnerRef.current !== userId) return
      setProfile(loadedProfile)
      setRole(loadedRole)
    } catch (error) {
      logTechnical('auth/loadProfile', error)
      if (profileOwnerRef.current === userId) {
        setProfile(null)
        setRole(null)
      }
    }
  }, [])

  const refreshProfile = useCallback(async () => {
    const userId = session?.user?.id
    if (!userId) return
    profileOwnerRef.current = userId
    await loadProfileFor(userId)
  }, [loadProfileFor, session?.user?.id])

  // ------------------------------------------------------------------
  // Restauración inicial + suscripción a cambios de sesión
  // ------------------------------------------------------------------
  useEffect(() => {
    // Constante local: TS no estrecha `supabase` (posiblemente null) dentro
    // de los callbacks async definidos después del chequeo.
    const client = supabase
    if (!client) return

    let cancelled = false

    const hydrate = async () => {
      try {
        // `getSession()` lee el almacenamiento local (rápido, puede estar
        // caducado); `getClaims()` valida el JWT contra el servidor.
        // Se usan ambos: el primero para tener el objeto Session, el
        // segundo para no confiar en un token manipulado o vencido.
        const { data: sessionData } = await client.auth.getSession()
        if (cancelled) return

        const currentSession = sessionData.session ?? null
        setSession(currentSession)

        if (currentSession?.user?.id) {
          const { error: claimsError } = await client.auth.getClaims()
          if (cancelled) return
          if (claimsError) {
            // Token rechazado: se descarta la sesión en vez de dejarla
            // "aparentemente" activa.
            logTechnical('auth/getClaims', claimsError)
            setSession(null)
            return
          }
          profileOwnerRef.current = currentSession.user.id
          await loadProfileFor(currentSession.user.id)
        }
      } catch (error) {
        logTechnical('auth/hydrate', error)
      } finally {
        if (!cancelled) setIsLoading(false)
      }
    }

    void hydrate()

    const { data: subscription } = client.auth.onAuthStateChange(
      (event, nextSession) => {
        // NADA de async aquí dentro: el callback no espera, React actualiza.
        const previousUserId = profileOwnerRef.current
        const nextUserId = nextSession?.user?.id ?? null

        if (event === 'SIGNED_OUT' || nextUserId === null) {
          clearLocalState()
          setSession(null)
          return
        }

        if (previousUserId !== nextUserId) {
          // Cambio de cuenta: limpiar antes de pedir el perfil nuevo evita
          // mostrar datos del usuario anterior.
          clearLocalState()
          profileOwnerRef.current = nextUserId
          void loadProfileFor(nextUserId)
        }

        setSession(nextSession)
      },
    )

    return () => {
      cancelled = true
      subscription.subscription.unsubscribe()
    }
  }, [clearLocalState, loadProfileFor])

  // ------------------------------------------------------------------
  // Acciones
  // ------------------------------------------------------------------
  const signUp = useCallback(
    async (input: { fullName: string; email: string; password: string }) => {
      const result = await registerService(input)
      if (result.status === 'pending_confirmation') {
        // Confirmación pendiente: se limpian los restos de cualquier sesión
        // anterior para que el usuario no entre al área privada.
        clearLocalState()
        setSession(null)
      }
      return result
    },
    [clearLocalState],
  )

  const signIn = useCallback(async (input: { email: string; password: string }) => {
    await loginService(input)
    // No se fija `session` a mano: `onAuthStateChange` la propagará y así
    // el perfil y la sesión nunca pueden quedar desincronizados.
  }, [])

  const signOut = useCallback(async () => {
    try {
      await logoutService()
    } catch (error) {
      // Aunque Supabase falle, el usuario debe salir de la UI: si no,
      // podría quedar atrapado en una sesión que ya no vale.
      logTechnical('auth/signOut', error)
    } finally {
      clearLocalState()
      setSession(null)
    }
  }, [clearLocalState])

  const value = useMemo<AuthContextValue>(
    () => ({
      user: session?.user ?? null,
      session,
      profile,
      role,
      isLoading,
      isAuthenticated: Boolean(session),
      configError,
      signUp,
      signIn,
      signOut,
      refreshProfile,
    }),
    [session, profile, role, isLoading, signUp, signIn, signOut, refreshProfile],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

/**
 * Acceso al contexto de auth.
 * Lanza si se usa fuera de `AuthProvider`: es un bug de cableado, no algo
 * que deba "arreglarse" con un valor por defecto silencioso.
 */
export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext)
  if (context === undefined) {
    throw new Error('useAuth() debe usarse dentro de <AuthProvider>.')
  }
  return context
}

/** Helper para traducir errores en la capa de UI. */
export { translateError }

export type { Profile, UserRole }