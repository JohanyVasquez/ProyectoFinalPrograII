/**
 * Pantalla privada temporal (Persona 1).
 *
 * Muestra datos REALES de la sesión para que el resto del equipo pueda
 * verificar la integración: nombre del perfil, rol efectivo y estado de
 * conexión. El botón de cerrar sesión llama a `signOut()` de verdad.
 *
 * Persona 2 reemplaza el diseño; los enlaces a los placeholders deben
 * mantenerse para que los módulos 3/4/5 sigan siendo alcanzables.
 */

import { useState } from 'react'
import { Link } from 'expo-router'
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native'

import { ErrorMessage } from '@/components/common/ErrorMessage'
import { ROUTES } from '@/constants/routes'
import { useAuth } from '@/hooks/useAuth'
import { translateError } from '@/lib/errors'
import { ROLE_LABELS } from '@/types/models'

const MODULES = [
  {
    href: ROUTES.parking,
    title: 'Estacionamientos',
    subtitle: 'Listado y estado de espacios · Persona 3',
  },
  {
    href: ROUTES.vehicle,
    title: 'Mi vehículo',
    subtitle: 'Guardar y encontrar dónde lo estacioné · Persona 4',
  },
  {
    href: ROUTES.history,
    title: 'Historial',
    subtitle: 'Sesiones y recordatorios · Persona 5',
  },
  {
    href: ROUTES.profile,
    title: 'Perfil',
    subtitle: 'Editar tus datos · Persona 2',
  },
] as const

export default function HomeScreen() {
  const { profile, role, user, isAuthenticated, signOut } = useAuth()
  const [isSigningOut, setIsSigningOut] = useState(false)
  const [error, setError] = useState<string | null>(null)

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

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.title}>Hola{profile?.full_name ? `, ${profile.full_name}` : ''}</Text>
      <Text style={styles.subtitle}>Sesión activa y datos conectados a Supabase.</Text>

      <View style={styles.card}>
        <Row label="Correo" value={user?.email ?? '—'} />
        <Row label="Rol" value={role ? ROLE_LABELS[role] : '—'} />
        <Row label="ID de usuario" value={user?.id ?? '—'} mono />
        <Row label="Estado" value={isAuthenticated ? 'Autenticado' : 'Sin sesión'} />
        <Row
          label="Proveedor"
          value={user?.app_metadata?.provider ?? 'email'}
        />
      </View>

      {error ? <ErrorMessage message={error} /> : null}

      <Text style={styles.sectionTitle}>Módulos</Text>
      {MODULES.map((module) => (
        <Link key={module.href} href={module.href} asChild>
          <TouchableOpacity style={styles.module} accessibilityRole="button">
            <Text style={styles.moduleTitle}>{module.title}</Text>
            <Text style={styles.moduleSubtitle}>{module.subtitle}</Text>
          </TouchableOpacity>
        </Link>
      ))}

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
      <Text style={[styles.rowValue, mono && styles.mono]} numberOfLines={1}>
        {value}
      </Text>
    </View>
  )
}

const styles = StyleSheet.create({
  container: { padding: 20, gap: 12, paddingBottom: 40 },
  title: { fontSize: 26, fontWeight: '700' },
  subtitle: { fontSize: 15, opacity: 0.7 },
  card: {
    borderWidth: 1,
    borderColor: '#e0e0e0',
    borderRadius: 10,
    padding: 14,
    gap: 8,
    backgroundColor: '#fafafa',
  },
  row: { flexDirection: 'row', justifyContent: 'space-between', gap: 12 },
  rowLabel: { fontSize: 14, opacity: 0.65 },
  rowValue: { fontSize: 14, fontWeight: '600', flexShrink: 1, textAlign: 'right' },
  mono: { fontFamily: 'monospace', fontSize: 12 },
  sectionTitle: { fontSize: 17, fontWeight: '700', marginTop: 8 },
  module: {
    borderWidth: 1,
    borderColor: '#e0e0e0',
    borderRadius: 10,
    padding: 14,
    gap: 2,
  },
  moduleTitle: { fontSize: 16, fontWeight: '600' },
  moduleSubtitle: { fontSize: 13, opacity: 0.65 },
  signOut: {
    marginTop: 24,
    borderWidth: 1,
    borderColor: '#c0392b',
    borderRadius: 8,
    paddingVertical: 14,
    alignItems: 'center',
    minHeight: 48,
    justifyContent: 'center',
  },
  signOutDisabled: { opacity: 0.6 },
  signOutText: { color: '#c0392b', fontWeight: '600', fontSize: 16 },
})