/**
 * Pantalla placeholder para los módulos de otras personas (Persona 2).
 *
 * Persona 3 (listado de espacios), Persona 4 (GPS/mapa) y Persona 5
 * (historial) reemplazarán el contenido de estas pantallas. Esta versión
 * sólo confirma que la ruta está protegida y que el usuario puede navegar;
 * NO implementa lógica de esos módulos.
 *
 * Mantiene `Stack.Screen options={{ title }}` para el header del layout.
 */

import { StyleSheet, Text, View } from 'react-native'
import { Stack } from 'expo-router'

import { colors, radius, spacing, typography } from '@/constants/theme'

export interface PlaceholderScreenProps {
  title: string
  description: string
  owner: string
}

export function PlaceholderScreen({ title, description, owner }: PlaceholderScreenProps) {
  return (
    <>
      <Stack.Screen options={{ title }} />
      <View style={styles.container}>
        <View style={styles.card}>
          <Text style={styles.title} accessibilityRole="header">
            {title}
          </Text>
          <Text style={styles.description}>{description}</Text>
          <View style={styles.badge}>
            <Text style={styles.badgeText}>En desarrollo · {owner}</Text>
          </View>
        </View>
      </View>
    </>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xl,
    backgroundColor: colors.canvas,
  },
  card: {
    width: '100%',
    maxWidth: 420,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.lineSoft,
    borderRadius: radius.lg,
    padding: spacing.xxl,
    gap: spacing.md,
  },
  title: {
    ...typography.title,
    color: colors.ink,
  },
  description: {
    ...typography.body,
    color: colors.mutedOnCanvas,
    lineHeight: 22,
  },
  badge: {
    alignSelf: 'flex-start',
    marginTop: spacing.xs,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.sm,
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.sm,
  },
  badgeText: {
    ...typography.caption,
    color: colors.muted,
  },
})