/**
 * Pantalla de login PROVISIONAL (Persona 1).
 *
 * Persona 2 reemplaza el diseño, pero debe conservar:
 * - los campos `email` y `password`,
 * - `secureTextEntry` en la contraseña,
 * - el botón deshabilitado + spinner mientras `isSubmitting`,
 * - el render de `error` y de `message`.
 *
 * También puede sustituirla ENTERA: la lógica vive en `auth.service` y en
 * `useAuth()`. Lo único que no debe cambiar es la ruta `/login`.
 */

import { useState } from 'react'
import { Link } from 'expo-router'
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native'

import { ErrorMessage } from '@/components/common/ErrorMessage'
import { ROUTES } from '@/constants/routes'
import { useAuth } from '@/hooks/useAuth'
import { isValidEmail, normalizeEmail } from '@/lib/validation'

export default function LoginScreen() {
  const { signIn } = useAuth()

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSubmit = async () => {
    setError(null)

    if (!isValidEmail(email)) {
      setError('Introduce un correo electrónico válido.')
      return
    }
    if (password.length === 0) {
      setError('Introduce tu contraseña.')
      return
    }

    setIsSubmitting(true)
    try {
      await signIn({ email: normalizeEmail(email), password })
      // No se navega a mano: al cambiar la sesión, `Stack.Protected` del
      // layout raíz redirige solo al grupo `(app)`. Forzar el `push`
      // competitionaría con esa redirección.
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : 'No se pudo iniciar sesión.')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView
        contentContainerStyle={styles.container}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={styles.title}>ParkEasy</Text>
        <Text style={styles.subtitle}>Inicia sesión para continuar</Text>

        {error ? <ErrorMessage message={error} /> : null}

        <View style={styles.field}>
          <Text style={styles.label}>Correo electrónico</Text>
          <TextInput
            style={styles.input}
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            autoComplete="email"
            keyboardType="email-address"
            textContentType="emailAddress"
            editable={!isSubmitting}
            accessibilityLabel="Correo electrónico"
          />
        </View>

        <View style={styles.field}>
          <Text style={styles.label}>Contraseña</Text>
          <TextInput
            style={styles.input}
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            autoCapitalize="none"
            autoComplete="current-password"
            textContentType="password"
            editable={!isSubmitting}
            accessibilityLabel="Contraseña"
          />
        </View>

        <TouchableOpacity
          style={[styles.button, isSubmitting && styles.buttonDisabled]}
          onPress={handleSubmit}
          disabled={isSubmitting}
          accessibilityRole="button"
          accessibilityState={{ disabled: isSubmitting, busy: isSubmitting }}
        >
          {isSubmitting ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.buttonText}>Entrar</Text>
          )}
        </TouchableOpacity>

        <View style={styles.footer}>
          <Text>¿No tienes cuenta? </Text>
          <Link href={ROUTES.register} disabled={isSubmitting}>
            <Text style={styles.link}>Regístrate</Text>
          </Link>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  )
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  container: {
    flexGrow: 1,
    justifyContent: 'center',
    padding: 24,
    gap: 12,
  },
  title: { fontSize: 28, fontWeight: '700', textAlign: 'center' },
  subtitle: { fontSize: 15, textAlign: 'center', opacity: 0.7, marginBottom: 8 },
  field: { gap: 4 },
  label: { fontSize: 13, fontWeight: '600' },
  input: {
    borderWidth: 1,
    borderColor: '#c8c8c8',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 16,
  },
  button: {
    backgroundColor: '#1f6feb',
    borderRadius: 8,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 8,
    minHeight: 48,
    justifyContent: 'center',
  },
  buttonDisabled: { opacity: 0.6 },
  buttonText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  footer: { flexDirection: 'row', justifyContent: 'center', marginTop: 16 },
  link: { color: '#1f6feb', fontWeight: '600' },
})