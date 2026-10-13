/**
 * Pantalla de perfil PROVISIONAL (Persona 1).
 *
 * Muestra los datos reales que devuelve `profile.service` para que Persona 2
 * verifique que el trigger `private.handle_new_user` creó la fila. NO hay
 * formulario de edición: ese es el módulo de Persona 2.
 */

import { useCallback, useEffect, useState } from 'react'
import { ScrollView, StyleSheet, Text, View } from 'react-native'

import { ErrorMessage } from '@/components/common/ErrorMessage'
import { LoadingScreen } from '@/components/common/LoadingScreen'
import { useAuth } from '@/hooks/useAuth'
import { translateError } from '@/lib/errors'
import { getMyProfileWithRole } from '@/services/profile.service'
import type { Profile } from '@/services/profile.service'
import type { UserRole } from '@/types/database.types'
import { ROLE_LABELS } from '@/types/models'

export default function ProfileScreen() {
  const { user, refreshProfile } = useAuth()
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

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.title}>Perfil</Text>
      <Text style={styles.subtitle}>Datos provisionales. Persona 2 implementa la edición.</Text>

      {error ? <ErrorMessage message={error} onRetry={load} /> : null}

      <View style={styles.card}>
        <Row label="Nombre" value={profile?.full_name ?? '—'} />
        <Row label="Correo" value={user?.email ?? '—'} />
        <Row label="Teléfono" value={profile?.phone ?? 'Sin registrar'} />
        <Row label="Avatar" value={profile?.avatar_url ?? 'Sin registrar'} />
        <Row label="Rol" value={role ? ROLE_LABELS[role] : '—'} />
        <Row label="Creado" value={profile?.created_at ?? '—'} mono />
      </View>

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

function Row({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={[styles.rowValue, mono && styles.mono]}>{value}</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  container: { padding: 20, gap: 12, paddingBottom: 40 },
  title: { fontSize: 24, fontWeight: '700' },
  subtitle: { fontSize: 14, opacity: 0.7 },
  card: {
    borderWidth: 1,
    borderColor: '#e0e0e0',
    borderRadius: 10,
    padding: 14,
    gap: 8,
  },
  row: { flexDirection: 'row', justifyContent: 'space-between', gap: 12 },
  rowLabel: { fontSize: 14, opacity: 0.65 },
  rowValue: { fontSize: 14, fontWeight: '600', flexShrink: 1, textAlign: 'right' },
  mono: { fontSize: 12 },
  refresh: { color: '#1f6feb', textAlign: 'center', marginTop: 8, paddingVertical: 12 },
})