/**
 * Pantalla de registro PROVISIONAL (Persona 1).
 *
 * Punto delicado: si el proyecto de Supabase tiene la confirmación de
 * correo activa, `signUp` devuelve `pending_confirmation` con `session ===
 * null`. En ese caso NO se entra al área privada: se pide revisar el correo.
 * Saltarse esa comprobación dejaría al usuario en una pantalla que se
 * vacía sola al no existir sesión.
 *
 * Persona 2 reemplaza el diseño conservando el campo `fullName` (es el que
 * el trigger usa para crear `profiles.full_name`) y los estados
 * `isSubmitting` / `error` / `message`.
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
import {
  isValidEmail,
  isValidFullName,
  isValidPassword,
  normalizeEmail,
  PASSWORD_MIN,
} from '@/lib/validation'

export default function RegisterScreen() {
  const { signUp } = useAuth()

  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)

  const handleSubmit = async () => {
    setError(null)
    setMessage(null)

    if (!isValidFullName(fullName)) {
      setError('El nombre no puede estar vacío ni superar 120 caracteres.')
      return
    }
    if (!isValidEmail(email)) {
      setError('Introduce un correo electrónico válido.')
      return
    }
    if (!isValidPassword(password)) {
      setError(`La contraseña debe tener al menos ${PASSWORD_MIN} caracteres.`)
      return
    }

    setIsSubmitting(true)
    try {
      const result = await signUp({
        fullName: fullName.trim(),
        email: normalizeEmail(email),
        password,
      })

      if (result.status === 'pending_confirmation') {
        setMessage('Revisa tu correo para confirmar la cuenta. Después podrás iniciar sesión.')
        setPassword('')
      }
      // Si `registered`, hay sesión: `Stack.Protected` del layout raíz
      // redirige al grupo `(app)` automáticamente.
    } catch (submitError) {
      setError(
        submitError instanceof Error ? submitError.message : 'No se pudo crear la cuenta.',
      )
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
        <Text style={styles.title}>Crear cuenta</Text>
        <Text style={styles.subtitle}>
          Tu perfil se crea automáticamente al registrarte.
        </Text>

        {error ? <ErrorMessage message={error} /> : null}

        {message ? (
          <View style={styles.success} accessibilityRole="alert">
            <Text style={styles.successText}>{message}</Text>
          </View>
        ) : null}

        <View style={styles.field}>
          <Text style={styles.label}>Nombre completo</Text>
          <TextInput
            style={styles.input}
            value={fullName}
            onChangeText={setFullName}
            autoCapitalize="words"
            autoComplete="name"
            textContentType="name"
            editable={!isSubmitting}
            accessibilityLabel="Nombre completo"
          />
        </View>

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
            autoComplete="new-password"
            textContentType="newPassword"
            editable={!isSubmitting}
            accessibilityLabel="Contraseña"
          />
          <Text style={styles.hint}>Mínimo {PASSWORD_MIN} caracteres.</Text>
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
            <Text style={styles.buttonText}>Crear cuenta</Text>
          )}
        </TouchableOpacity>

        <View style={styles.footer}>
          <Text>¿Ya tienes cuenta? </Text>
          <Link href={ROUTES.login} disabled={isSubmitting}>
            <Text style={styles.link}>Inicia sesión</Text>
          </Link>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  )
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  container: { flexGrow: 1, justifyContent: 'center', padding: 24, gap: 12 },
  title: { fontSize: 28, fontWeight: '700', textAlign: 'center' },
  subtitle: {
    fontSize: 15,
    textAlign: 'center',
    opacity: 0.7,
    marginBottom: 8,
  },
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
  hint: { fontSize: 12, opacity: 0.6 },
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
  success: {
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#1e8449',
    backgroundColor: '#e8f6ee',
  },
  successText: { color: '#186a3b' },
  footer: { flexDirection: 'row', justifyContent: 'center', marginTop: 16 },
  link: { color: '#1f6feb', fontWeight: '600' },
})