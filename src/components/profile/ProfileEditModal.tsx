/**
 * Modal de edición de perfil (Persona 2).
 *
 * Sólo permite editar `full_name` y `phone`. El resto de datos de la cuenta
 * (correo, rol, UUID, proveedor, fecha de alta) NO aparece como campo: son de
 * sólo lectura y no se pueden cambiar desde aquí. No hace falta "ocultar"
 * nada porque el componente nunca los toca.
 *
 * Guarda mediante `updateMyProfile()`, que es la capa de servicios existente:
 * este componente no habla con Supabase directamente.
 */

import { useState } from 'react'
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native'

import { ErrorMessage } from '@/components/common/ErrorMessage'
import { HIT_SLOP_MIN, colors, radius, spacing, typography } from '@/constants/theme'
import { translateError } from '@/lib/errors'
import { updateMyProfile } from '@/services/profile.service'
import type { Profile } from '@/services/profile.service'
import {
  FULL_NAME_MAX,
  isValidFullName,
  isValidGuatemalaPhone,
} from '@/lib/validation'

export interface ProfileEditModalProps {
  visible: boolean
  /** Valores actuales; se copian a los campos al abrir. */
  profile: Profile | null
  onCancel: () => void
  /** Se llama sólo cuando Supabase ha confirmado. */
  onSaved: (updated: Profile) => void
}

export function ProfileEditModal({
  visible,
  profile,
  onCancel,
  onSaved,
}: ProfileEditModalProps) {
  // Los campos nacen con los valores actuales. Para que se recarguen en cada
  // apertura, el padre pasa una `key` distinta mientras el modal está abierto:
  // eso remonta el componente y vuelve a ejecutar estos inicializadores, sin
  // ningún `useEffect` que escriba estado (react-hooks/set-state-in-effect).
  const [fullName, setFullName] = useState(() => profile?.full_name ?? '')
  const [phone, setPhone] = useState(() => profile?.phone ?? '')
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSave = async () => {
    // Doble clic no debe disparar dos actualizaciones.
    if (isSaving) return

    const name = fullName.trim()
    const rawPhone = phone.trim()

    if (!isValidFullName(name)) {
      setError('El nombre no puede estar vacío ni superar 120 caracteres.')
      return
    }
    // Vacío está permitido (la columna admite NULL). Con contenido, tiene que
    // ser un teléfono guatemalteco razonable.
    if (rawPhone.length > 0 && !isValidGuatemalaPhone(rawPhone)) {
      setError('Revisa el teléfono. Ejemplos válidos: 5123 4567 o +502 5123 4567.')
      return
    }

    setError(null)
    setIsSaving(true)
    try {
      // El servicio valida otra vez y se encarga del RLS: `user_id` sale
      // siempre de la sesión verificada, nunca de este formulario.
      const updated = await updateMyProfile({
        full_name: name,
        phone: rawPhone.length > 0 ? rawPhone : null,
      })
      onSaved(updated)
    } catch (saveError) {
      // Se conservan los valores escritos para que el usuario pueda reintentar.
      setError(translateError(saveError).message)
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent
      onRequestClose={onCancel}
    >
      <View style={styles.backdrop}>
        <KeyboardAvoidingView
          style={styles.sheetWrapper}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <View style={styles.sheet}>
            <ScrollView
              contentContainerStyle={styles.content}
              keyboardShouldPersistTaps="handled"
            >
              <Text style={styles.title} accessibilityRole="header">
                Editar perfil
              </Text>

              {error ? <ErrorMessage message={error} /> : null}

              <View style={styles.field}>
                <Text style={styles.label}>Nombre completo</Text>
                <TextInput
                  style={[
                    styles.input,
                    isSaving && styles.inputDisabled,
                    Boolean(error) && fullName.trim().length === 0 && styles.inputError,
                  ]}
                  value={fullName}
                  onChangeText={setFullName}
                  autoCapitalize="words"
                  autoComplete="name"
                  textContentType="name"
                  editable={!isSaving}
                  maxLength={FULL_NAME_MAX}
                  accessibilityLabel="Nombre completo"
                />
                <Text style={styles.hint}>
                  Hasta {FULL_NAME_MAX} caracteres.
                </Text>
              </View>

              <View style={styles.field}>
                <Text style={styles.label}>Teléfono</Text>
                <TextInput
                  style={[styles.input, isSaving && styles.inputDisabled]}
                  value={phone}
                  onChangeText={setPhone}
                  keyboardType="phone-pad"
                  autoComplete="tel"
                  textContentType="telephoneNumber"
                  editable={!isSaving}
                  accessibilityLabel="Teléfono"
                />
                <Text style={styles.hint}>
                  8 dígitos, con o sin +502. Ej. 5123 4567 o +502 5123 4567.
                  Puedes dejarlo vacío.
                </Text>
              </View>

              {/* De sólo lectura: se muestran, no se editan. */}
              <View style={styles.readonly}>
                <Text style={styles.readonlyTitle}>No editable</Text>
                <Text style={styles.readonlyText}>
                  El correo y el rol están vinculados a la cuenta y sólo se
                  cambian desde Supabase.
                </Text>
              </View>
            </ScrollView>

            <View style={styles.actions}>
              <Pressable
                style={({ pressed }) => [
                  styles.button,
                  styles.buttonSecondary,
                  pressed && styles.buttonPressed,
                  isSaving && styles.buttonDisabled,
                ]}
                onPress={onCancel}
                disabled={isSaving}
                accessibilityRole="button"
                accessibilityState={{ disabled: isSaving }}
              >
                <Text style={styles.buttonSecondaryText}>Cancelar</Text>
              </Pressable>

              <Pressable
                style={({ pressed }) => [
                  styles.button,
                  styles.buttonPrimary,
                  pressed && styles.buttonPressed,
                  isSaving && styles.buttonDisabled,
                ]}
                onPress={handleSave}
                disabled={isSaving}
                accessibilityRole="button"
                accessibilityState={{ disabled: isSaving, busy: isSaving }}
              >
                {isSaving ? (
                  <ActivityIndicator color={colors.onInk} />
                ) : (
                  <Text style={styles.buttonPrimaryText}>Guardar cambios</Text>
                )}
              </Pressable>
            </View>
          </View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  )
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(10, 31, 60, 0.45)',
  },
  sheetWrapper: {
    maxHeight: '92%',
  },
  sheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: radius.lg + 6,
    borderTopRightRadius: radius.lg + 6,
    overflow: 'hidden',
  },
  content: {
    padding: spacing.xl,
    gap: spacing.lg,
  },
  title: {
    ...typography.title,
    color: colors.ink,
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
  inputError: {
    borderColor: colors.muted,
  },
  hint: {
    ...typography.caption,
    color: colors.mutedOnCanvas,
    lineHeight: 16,
  },
  readonly: {
    backgroundColor: colors.canvas,
    borderRadius: radius.sm,
    padding: spacing.lg,
    gap: 2,
  },
  readonlyTitle: {
    ...typography.label,
    color: colors.inkSoft,
  },
  readonlyText: {
    ...typography.caption,
    color: colors.mutedOnCanvas,
    lineHeight: 16,
  },
  actions: {
    flexDirection: 'row',
    gap: spacing.md,
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.lg,
    paddingBottom: spacing.xxl,
    borderTopWidth: 1,
    borderTopColor: colors.lineSoft,
  },
  button: {
    flex: 1,
    minHeight: HIT_SLOP_MIN,
    borderRadius: radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonPrimary: {
    backgroundColor: colors.accent,
  },
  buttonSecondary: {
    borderWidth: 1,
    borderColor: colors.line,
  },
  buttonPressed: {
    opacity: 0.75,
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  buttonPrimaryText: {
    ...typography.bodyStrong,
    color: colors.onInk,
  },
  buttonSecondaryText: {
    ...typography.bodyStrong,
    color: colors.inkSoft,
  },
})