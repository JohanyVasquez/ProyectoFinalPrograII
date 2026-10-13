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
import { Logo } from '@/components/common/Logo'
import { ROUTES } from '@/constants/routes'
import { HIT_SLOP_MIN, colors, radius, spacing, typography } from '@/constants/theme'
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
        <View style={styles.brand}>
          <Logo size="lg" />
          <Text style={styles.title}>ParkEasy</Text>
          <Text style={styles.subtitle}>Tu estacionamiento, más sencillo.</Text>
        </View>

        {error ? <ErrorMessage message={error} /> : null}

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
            <ActivityIndicator color={colors.onInk} />
          ) : (
            <Text style={styles.buttonText}>Entrar</Text>
          )}
        </TouchableOpacity>

        <View style={styles.footer}>
          <Text style={styles.footerText}>¿No tienes cuenta?</Text>
          <Link href={ROUTES.register} disabled={isSubmitting}>
            <Text style={styles.link}>Regístrate</Text>
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
