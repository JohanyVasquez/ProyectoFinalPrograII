/**
 * Pantalla principal (Persona 2).
 *
 * Sólo presentación. La lógica de sesión, el cierre de sesión y los enlaces
 * son exactamente los mismos que antes del rediseño.
 *
 * Lo que se eliminó a propósito: la tarjeta con correo, rol, UUID, estado y
 * proveedor. Parecía un panel de pruebas y esa información ahora vive en
 * `/profile`, bajo "Información de la cuenta".
 *
 * Para el saludo se usa `profile.full_name`, que YA está en el contexto de
 * auth: esta pantalla no hace ninguna consulta nueva a Supabase.
 */

import { useState } from 'react'
import { Link } from 'expo-router'
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native'

import { ErrorMessage } from '@/components/common/ErrorMessage'
import { Logo } from '@/components/common/Logo'
import { ROUTES } from '@/constants/routes'
import { HIT_SLOP_MIN, colors, radius, spacing, typography } from '@/constants/theme'
import { useAuth } from '@/hooks/useAuth'
import { translateError } from '@/lib/errors'

/**
 * Destinos privados. Los módulos 3/4/5 siguen siendo placeholders; mantener
 * estas rutas es parte del flujo de navegación existente.
 */
const MODULES = [
  {
    href: ROUTES.parking,
    title: 'Estacionamientos',
    subtitle: 'Consulta ubicaciones y el estado de los espacios',
  },
  {
    href: ROUTES.vehicle,
    title: 'Mi vehículo',
    subtitle: 'Guarda dónde lo estacionaste y encuéntralo luego',
  },
  {
    href: ROUTES.history,
    title: 'Historial',
    subtitle: 'Revisa tus sesiones y recordatorios',
  },
  {
    href: ROUTES.profile,
    title: 'Perfil',
    subtitle: 'Consulta tu información de cuenta',
  },
] as const

export default function HomeScreen() {
  const { profile, signOut } = useAuth()
  const [isSigningOut, setIsSigningOut] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Flujo de cierre de sesión sin cambios: `signOut()` del contexto.
  const handleSignOut = async () => {
    setError(null)
    setIsSigningOut(true)
    try {
      await signOut()
      // `Stack.Protected` del layout raíz devuelve al grupo `(auth)`.
    } catch (signOutError) {
      setError(translateError(signOutError).message)
    } finally {
      setIsSigningOut(false)
    }
  }

  const firstName = profile?.full_name?.trim().split(/\s+/)[0]

  return (
    <ScrollView
      contentContainerStyle={styles.container}
      showsVerticalScrollIndicator={false}
    >
      <View style={styles.brandRow}>
        <Logo size="md" />
        <View style={styles.header}>
          <Text style={styles.greeting} accessibilityRole="header">
            {firstName ? `¡Hola, ${firstName}!` : '¡Hola, bienvenido a ParkEasy!'}
          </Text>
          <Text style={styles.tagline}>Tu estacionamiento, más sencillo.</Text>
        </View>
      </View>

      {error ? <ErrorMessage message={error} /> : null}

      <Text style={styles.sectionTitle}>IR A</Text>

      <View style={styles.moduleList}>
        {MODULES.map((module) => (
          <Link key={module.href} href={module.href} asChild>
            <TouchableOpacity
              style={styles.module}
              accessibilityRole="button"
              accessibilityLabel={module.title}
              accessibilityHint={module.subtitle}
            >
              <View style={styles.moduleText}>
                <Text style={styles.moduleTitle}>{module.title}</Text>
                <Text style={styles.moduleSubtitle}>{module.subtitle}</Text>
              </View>
              <Text style={styles.chevron} accessibilityElementsHidden>
                ›
              </Text>
            </TouchableOpacity>
          </Link>
        ))}
      </View>

      <TouchableOpacity
        style={[styles.signOut, isSigningOut && styles.signOutDisabled]}
        onPress={handleSignOut}
        disabled={isSigningOut}
        accessibilityRole="button"
        accessibilityState={{ disabled: isSigningOut, busy: isSigningOut }}
      >
        <Text style={styles.signOutText}>
          {isSigningOut ? 'Cerrando sesión…' : 'Cerrar sesión'}
        </Text>
      </TouchableOpacity>
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.xxl,
    paddingBottom: spacing.xxxl,
  },
  brandRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.lg,
    marginBottom: spacing.xxl,
  },
  header: {
    flex: 1,
    gap: spacing.xs,
  },
  greeting: {
    ...typography.display,
    color: colors.ink,
  },
  tagline: {
    ...typography.body,
    color: colors.mutedOnCanvas,
  },
  sectionTitle: {
    ...typography.section,
    color: colors.muted,
    marginBottom: spacing.md,
  },
  moduleList: {
    gap: spacing.sm,
  },
  module: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.lineSoft,
    borderRadius: radius.md,
    paddingVertical: spacing.lg,
    paddingHorizontal: spacing.lg,
    minHeight: HIT_SLOP_MIN + 8,
  },
  moduleText: {
    flex: 1,
    gap: 2,
  },
  moduleTitle: {
    ...typography.bodyStrong,
    color: colors.ink,
  },
  moduleSubtitle: {
    ...typography.caption,
    color: colors.muted,
  },
  chevron: {
    ...typography.title,
    color: colors.muted,
    lineHeight: 26,
  },
  signOut: {
    marginTop: spacing.xxl,
    minHeight: HIT_SLOP_MIN,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.line,
  },
  signOutDisabled: {
    opacity: 0.5,
  },
  signOutText: {
    ...typography.bodyStrong,
    color: colors.mutedOnCanvas,
  },
})