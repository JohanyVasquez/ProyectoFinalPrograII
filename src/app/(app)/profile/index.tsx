/**
 * Pantalla de perfil (Persona 2).
 *
 * Sólo presentación. La carga de datos es la misma de antes
 * (`getMyProfileWithRole` + `refreshProfile` del contexto): no se añadió
 * ninguna consulta, ni se tocó el servicio, ni las políticas RLS.
 *
 * Aquí viven ahora los datos que se quitaron de la pantalla principal. La
 * información técnica (UUID, proveedor, fecha de alta) va agrupada bajo
 * "Información de la cuenta" para no competir con lo esencial.
 *
 * NO hay formulario de edición: eso requiere decisiones de producto que
 * siguen abiertas.
 */

import { useCallback, useEffect, useState } from 'react'
import { ScrollView, StyleSheet, Text, View } from 'react-native'

import { ErrorMessage } from '@/components/common/ErrorMessage'
import { LoadingScreen } from '@/components/common/LoadingScreen'
import { HIT_SLOP_MIN, colors, radius, spacing, typography } from '@/constants/theme'
import { useAuth } from '@/hooks/useAuth'
import { translateError } from '@/lib/errors'
import { getMyProfileWithRole } from '@/services/profile.service'
import type { Profile } from '@/services/profile.service'
import type { UserRole } from '@/types/database.types'
import { ROLE_LABELS } from '@/types/models'

export default function ProfileScreen() {
  const { user, isAuthenticated, refreshProfile } = useAuth()
  const [profile, setProfile] = useState<Profile | null>(null)
  const [role, setRole] = useState<UserRole | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // La carga vive en un callback aparte para que el botón "Actualizar" y el
  // montaje inicial compartan exactamente el mismo camino.
  // `isLoading` nace en `true` y sólo lo baja la propia carga: así el
  // efecto inicial no hace falta para arrancar el spinner y se evita el
  // setState síncrono dentro del efecto (react-hooks/set-state-in-effect).
  const load = useCallback(async () => {
    try {
      const { profile: loaded, role: loadedRole } = await getMyProfileWithRole()
      setProfile(loaded)
      setRole(loadedRole)
      setError(
        loaded
          ? null
          : 'No se encontró tu perfil. Suele significar que la cuenta se creó antes de aplicar la migración 001.',
      )
    } catch (loadError) {
      setError(translateError(loadError).message)
    } finally {
      setIsLoading(false)
    }
  }, [])

  // El IIFE empieza por un `await`: los setState ocurren en una microtarea,
  // nunca de forma síncrona dentro del cuerpo del efecto.
  useEffect(() => {
    void (async () => {
      await load()
    })()
  }, [load])

  if (isLoading) return <LoadingScreen message="Cargando perfil…" />

  const fullName = profile?.full_name?.trim() || null
  const initials =
    fullName
      ?.split(/\s+/)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase() ?? '')
      .join('') || null

  return (
    <ScrollView
      contentContainerStyle={styles.container}
      showsVerticalScrollIndicator={false}
    >
      <View style={styles.identity}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>{initials ?? '—'}</Text>
        </View>
        <View style={styles.identityText}>
          <Text style={styles.name} accessibilityRole="header">
            {fullName ?? 'Sin nombre'}
          </Text>
          <Text style={styles.identityMeta}>
            {user?.email ?? '—'}
            {role ? ` · ${ROLE_LABELS[role]}` : ''}
          </Text>
        </View>
      </View>

      {error ? <ErrorMessage message={error} onRetry={load} /> : null}

      <Text style={styles.sectionTitle}>DATOS</Text>
      <Card>
        <Row label="Nombre" value={profile?.full_name ?? '—'} />
        <Divider />
        <Row label="Correo" value={user?.email ?? '—'} />
        <Divider />
        <Row label="Rol" value={role ? ROLE_LABELS[role] : '—'} />
        <Divider />
        <Row label="Teléfono" value={profile?.phone ?? 'Sin registrar'} />
        <Divider />
        <Row label="Avatar" value={profile?.avatar_url ?? 'Sin registrar'} />
      </Card>

      {/* Datos técnicos: agrupados y al final, no compiten con lo esencial. */}
      <Text style={styles.sectionTitle}>INFORMACIÓN DE LA CUENTA</Text>
      <Card>
        <Row label="Identificador" value={user?.id ?? '—'} mono />
        <Divider />
        <Row
          label="Estado"
          value={isAuthenticated ? 'Autenticado' : 'Sin sesión'}
        />
        <Divider />
        <Row
          label="Proveedor"
          value={user?.app_metadata?.provider ?? 'email'}
        />
        <Divider />
        <Row label="Cuenta creada" value={formatDate(profile?.created_at)} />
      </Card>

      <Text
        style={styles.refresh}
        onPress={() => {
          void refreshProfile()
          void load()
        }}
        accessibilityRole="button"
      >
        Actualizar
      </Text>
    </ScrollView>
  )
}

/**
 * `created_at` es un timestamptz en ISO 8601. Se formatea a la zona local;
 * si el valor no es una fecha válida se devuelve tal cual en vez de "Invalid
 * Date", que es lo que haría `new Date(texto).toLocaleString()` a secas.
 */
function formatDate(value: string | null | undefined): string {
  if (!value) return '—'
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return value
  return parsed.toLocaleDateString('es-ES', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })
}

function Card({ children }: { children: React.ReactNode }) {
  return <View style={styles.card}>{children}</View>
}

function Divider() {
  return <View style={styles.divider} />
}

function Row({
  label,
  value,
  mono = false,
}: {
  label: string
  value: string
  mono?: boolean
}) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={[styles.rowValue, mono && styles.mono]} selectable>
        {value}
      </Text>
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.xl,
    paddingBottom: spacing.xxxl,
  },
  identity: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.lg,
    marginBottom: spacing.xxl,
  },
  avatar: {
    width: 56,
    height: 56,
    borderRadius: radius.pill,
    backgroundColor: colors.ink,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    ...typography.bodyStrong,
    color: colors.onInk,
    letterSpacing: 0.4,
  },
  identityText: {
    flex: 1,
    gap: 2,
  },
  name: {
    ...typography.title,
    color: colors.ink,
  },
  identityMeta: {
    ...typography.caption,
    color: colors.mutedOnCanvas,
  },
  sectionTitle: {
    ...typography.section,
    color: colors.muted,
    marginBottom: spacing.md,
  },
  card: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.lineSoft,
    borderRadius: radius.md,
    paddingHorizontal: spacing.lg,
    marginBottom: spacing.xl,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: spacing.lg,
    paddingVertical: spacing.md,
    minHeight: 32,
  },
  rowLabel: {
    ...typography.label,
    color: colors.muted,
  },
  rowValue: {
    ...typography.body,
    color: colors.ink,
    flexShrink: 1,
    textAlign: 'right',
  },
  mono: {
    fontSize: 12,
    color: colors.inkSoft,
  },
  divider: {
    height: 1,
    backgroundColor: colors.lineSoft,
  },
  refresh: {
    ...typography.bodyStrong,
    color: colors.inkSoft,
    textAlign: 'center',
    minHeight: HIT_SLOP_MIN,
    paddingVertical: spacing.lg,
  },
})