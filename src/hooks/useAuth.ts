/**
 * Reexportación del hook de auth.
 *
 * Existe para que las pantallas importen siempre de `@/hooks/useAuth`
 * y no directamente de `@/contexts/AuthContext`. Persona 2 puede cambiar
 * la implementación del contexto sin romper 40 imports.
 */

export { AuthProvider, useAuth } from '@/contexts/AuthContext'
export type { AuthContextValue } from '@/contexts/AuthContext'