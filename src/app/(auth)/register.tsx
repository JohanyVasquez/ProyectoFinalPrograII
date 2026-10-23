
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
import { Logo } from '@/components/common/Logo'
import { ROUTES } from '@/constants/routes'
import { HIT_SLOP_MIN, colors, radius, spacing, typography } from '@/constants/theme'
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
        <View style={styles.brand}>
          <Logo size="lg" />
          <Text style={styles.title}>Crear cuenta</Text>
          <Text style={styles.subtitle}>
            Tu perfil se crea automáticamente al registrarte.
          </Text>
        </View>

        {error ? <ErrorMessage message={error} /> : null}

        {message ? (
          <View style={styles.success} accessibilityRole="alert">
            <Text style={styles.successText}>{message}</Text>
          </View>
        ) : null}

        <View style={styles.field}>
          <Text style={styles.label}>Nombre completo</Text>
          <TextInput
            style={[styles.input, !isSubmitting && styles.inputDisabled]}
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
            style={[styles.input, !isSubmitting && styles.inputDisabled]}
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
            style={[styles.input, !isSubmitting && styles.inputDisabled]}
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
            <ActivityIndicator color={colors.onInk} />
          ) : (
            <Text style={styles.buttonText}>Crear cuenta</Text>
          )}
        </TouchableOpacity>

        <View style={styles.footer}>
          <Text style={styles.footerText}>¿Ya tienes cuenta?</Text>
          <Link href={ROUTES.login} disabled={isSubmitting}>
            <Text style={styles.link}>Inicia sesión</Text>
          </Link>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  )
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.canvas },
  container: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.xxl,
    gap: spacing.lg,
  },
  brand: {
    alignItems: 'center',
    gap: spacing.xs,
    marginBottom: spacing.xl,
  },
  title: {
    ...typography.display,
    fontSize: 26,
    color: colors.ink,
    textAlign: 'center',
  },
  subtitle: {
    ...typography.body,
    color: colors.mutedOnCanvas,
    textAlign: 'center',
  },
  field: { gap: spacing.xs },
  label: {
    ...typography.label,
    color: colors.inkSoft,
  },
  input: {
    ...typography.body,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    color: colors.ink,
  },
  inputDisabled: {
    borderColor: colors.lineSoft,
    color: colors.muted,
  },
  hint: {
    ...typography.caption,
    color: colors.mutedOnCanvas,
  },
  button: {
    backgroundColor: colors.accent,
    borderRadius: radius.sm,
    paddingVertical: spacing.lg,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: HIT_SLOP_MIN,
    marginTop: spacing.sm,
  },
  buttonDisabled: { opacity: 0.5 },
  buttonText: {
    ...typography.bodyStrong,
    color: colors.onInk,
  },
  success: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line,
    borderLeftWidth: 3,
    borderRadius: radius.sm,
    padding: spacing.lg,
  },
  successText: {
    ...typography.caption,
    color: colors.inkSoft,
    lineHeight: 18,
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: spacing.xs,
    marginTop: spacing.sm,
  },
  footerText: {
    ...typography.body,
    color: colors.mutedOnCanvas,
  },
  link: {
    ...typography.bodyStrong,
    color: colors.ink,
    textDecorationLine: 'underline',
  },
})
