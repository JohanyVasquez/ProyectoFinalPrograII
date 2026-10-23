/**
 * Pantalla de GPS / vehículo (Persona 4).
 *
 * Guarda con el GPS real dónde se dejó el vehículo y ayuda a encontrarlo:
 * - Pide permiso de ubicación (`expo-location`) sólo cuando el usuario
 *   toca el botón, nunca al abrir la pantalla.
 * - Antes de crear una sesión consulta `getActiveParkingSession()`: sólo
 *   puede existir UNA sesión activa por usuario (índice parcial en la BD).
 * - Al guardar sólo se envían coordenadas GPS + nota. NO se elige espacio y
 *   NO se modifica `parking_spaces.status`: una sesión no es una reserva y
 *   el estado de un espacio es manual (Persona 3).
 * - "Encontrar mi vehículo" abre Google Maps fuera de la app con la ruta.
 * - El mapa de Android usa OpenStreetMap dentro de un WebView (Leaflet):
 *   es gratis y NO necesita API key de Google (en Android, react-native-maps
 *   usa Google Maps SDK por debajo y exigiría la clave). En iOS el mapa es
 *   Apple Maps con react-native-maps (tampoco necesita clave).
 *
 * Reglas que se respetan aquí:
 * - `user_id` nunca se manda: lo toma el servicio de la sesión verificada.
 * - Los errores crudos de Supabase pasan por `translateError()`.
 * - Módulo nativo (expo-location, react-native-maps, react-native-webview):
 *   requiere development build; en Expo Go no funciona.
 */

import { useCallback, useEffect, useState } from 'react'
import {
  Alert,
  Linking,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native'
import { Stack } from 'expo-router'
import * as Location from 'expo-location'

import { ErrorMessage } from '@/components/common/ErrorMessage'
import { LoadingScreen } from '@/components/common/LoadingScreen'
import { translateError } from '@/lib/errors'
import { NOTE_MAX } from '@/lib/validation'
import {
  completeParkingSession,
  createParkingSession,
  getActiveParkingSession,
} from '@/services/parking-sessions.service'
import {
  SESSION_STATUS_LABELS,
  type ParkingSession,
} from '@/types/models'
import { HIT_SLOP_MIN, colors, radius, spacing, typography } from '@/constants/theme'

/**
 * `react-native-maps` sólo se usa en iOS (Apple Maps: gratis, sin clave).
 * En Android y web el `require` es perezoso para no cargar el módulo donde
 * no se usa (y para no romper el bundle de Expo Web).
 */
const NativeMaps =
  Platform.OS !== 'ios'
    ? null
    : // eslint-disable-next-line @typescript-eslint/no-require-imports -- require perezoso a propósito: sólo se carga el módulo nativo en iOS.
      (require('react-native-maps') as typeof import('react-native-maps'))

/**
 * Mapa de Android: OpenStreetMap dentro de un `react-native-webview` con
 * Leaflet. Es gratuito y no necesita API key de Google Maps. En iOS y web
 * el `require` es perezoso por la misma razón que arriba.
 */
const OsmWebView =
  Platform.OS !== 'android'
    ? null
    : // eslint-disable-next-line @typescript-eslint/no-require-imports -- require perezoso a propósito: sólo se carga el WebView en Android.
      (require('react-native-webview').WebView as typeof import('react-native-webview').WebView)

/** Posición capturada por el GPS, aún NO guardada en Supabase. */
interface CapturedPosition {
  latitude: number
  longitude: number
  accuracyM: number | null
}

function formatDateTime(iso: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return '—'
  const pad = (value: number) => String(value).padStart(2, '0')
  return (
    `${pad(date.getDate())}/${pad(date.getMonth() + 1)}/${date.getFullYear()} ` +
    `${pad(date.getHours())}:${pad(date.getMinutes())}`
  )
}

function formatCoordinates(latitude: number, longitude: number): string {
  return `${latitude.toFixed(6)}, ${longitude.toFixed(6)}`
}

/** Abre Google Maps con la ruta hacia las coordenadas guardadas. */
function buildDirectionsUrl(latitude: number, longitude: number): string {
  return `https://www.google.com/maps/dir/?api=1&destination=${latitude},${longitude}`
}

/**
 * HTML de OpenStreetMap + Leaflet que se embebe en el WebView de Android.
 * Las coordenadas se inyectan con `toFixed(6)`: siempre números, nunca
 * texto del usuario, así no hay riesgo de inyección dentro del script.
 */
function buildOsmMapHtml(latitude: number, longitude: number): string {
  const lat = latitude.toFixed(6)
  const lng = longitude.toFixed(6)
  return `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
<style>
  html, body, #map { height: 100%; margin: 0; background: #e6e1d6; }
  .leaflet-control-attribution { font-size: 10px; }
</style>
</head>
<body>
<div id="map"></div>
<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
<script>
  (function () {
    var vehicle = [${lat}, ${lng}];
    var map = L.map('map').setView(vehicle, 17);
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; Colaboradores de OpenStreetMap'
    }).addTo(map);
    L.marker(vehicle).addTo(map).bindPopup('Mi vehículo').openPopup();
    setTimeout(function () { map.invalidateSize(); }, 200);
  })();
</script>
</body>
</html>`
}

/**
 * Mapa con la marca del vehículo, según plataforma:
 * - Android: OpenStreetMap en un WebView (gratis, sin clave de Google).
 * - iOS: Apple Maps con react-native-maps (gratis, sin clave).
 * - Web: sólo texto con las coordenadas, para que nunca quede en blanco.
 */
function VehicleMap({ latitude, longitude }: { latitude: number; longitude: number }) {
  const OsmWebViewComponent = OsmWebView
  if (OsmWebViewComponent) {
    return (
      <View style={styles.mapFrame}>
        <OsmWebViewComponent
          source={{ html: buildOsmMapHtml(latitude, longitude) }}
          originWhitelist={['*']}
          style={styles.mapInner}
          scrollEnabled={false}
          nestedScrollEnabled
          setSupportMultipleWindows={false}
          accessibilityLabel="Mapa con la ubicación de tu vehículo"
        />
      </View>
    )
  }

  const maps = NativeMaps
  if (!maps) {
    return (
      <View style={styles.mapFallback}>
        <Text style={styles.mapFallbackText}>
          Mapa no disponible en esta plataforma. Ubicación: {formatCoordinates(latitude, longitude)}
        </Text>
      </View>
    )
  }

  const MapViewComponent = maps.default
  const MarkerComponent = maps.Marker

  return (
    <MapViewComponent
      style={styles.map}
      initialRegion={{
        latitude,
        longitude,
        latitudeDelta: 0.005,
        longitudeDelta: 0.005,
      }}
      accessibilityLabel="Mapa con la ubicación de tu vehículo"
    >
      <MarkerComponent
        coordinate={{ latitude, longitude }}
        title="Mi vehículo"
        description={formatCoordinates(latitude, longitude)}
      />
    </MapViewComponent>
  )
}

export default function VehicleScreen() {
  const [activeSession, setActiveSession] = useState<ParkingSession | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [captured, setCaptured] = useState<CapturedPosition | null>(null)
  const [note, setNote] = useState('')
  const [action, setAction] = useState<'capture' | 'save' | 'complete' | null>(null)

  const [locationPermission, requestLocationPermission] = Location.useForegroundPermissions()

  /** Recarga manual (botón "Reintentar"). Fuera del effect para no encadenar renders. */
  const reloadSession = useCallback(async () => {
    try {
      const session = await getActiveParkingSession()
      setActiveSession(session)
      setError(null)
    } catch (loadError) {
      setError(translateError(loadError).message)
    } finally {
      setIsLoading(false)
    }
  }, [])

  // Carga inicial de la sesión activa.
  useEffect(() => {
    let cancelled = false
    const load = async () => {
      try {
        const session = await getActiveParkingSession()
        if (cancelled) return
        setActiveSession(session)
        setError(null)
      } catch (loadError) {
        if (!cancelled) setError(translateError(loadError).message)
      } finally {
        if (!cancelled) setIsLoading(false)
      }
    }
    void load()
    return () => {
      cancelled = true
    }
  }, [])

  const permissionDenied =
    locationPermission != null && locationPermission.status !== 'granted'
  const canOpenSettings = permissionDenied && !locationPermission?.canAskAgain

  // ------------------------------------------------------------------
  // Capturar posición con el GPS (permiso bajo demanda)
  // ------------------------------------------------------------------
  const handleCapture = async () => {
    if (action) return
    setAction('capture')
    setError(null)
    try {
      const servicesEnabled = await Location.hasServicesEnabledAsync()
      if (!servicesEnabled) {
        setError(
          'La ubicación del dispositivo está desactivada. Activa el GPS desde la barra de estado para guardar dónde dejaste tu vehículo.',
        )
        return
      }

      let permission = locationPermission
      if (permission?.status !== 'granted') {
        permission = await requestLocationPermission()
      }
      if (permission?.status !== 'granted') {
        setError(
          'ParkEasy necesita acceso a tu ubicación para registrar dónde dejaste el vehículo. Otorga el permiso para continuar.',
        )
        return
      }

      const position = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      })
      setCaptured({
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
        accuracyM: position.coords.accuracy,
      })
      setNote('')
    } catch (captureError) {
      setError(translateError(captureError).message)
    } finally {
      setAction(null)
    }
  }

  // ------------------------------------------------------------------
  // Guardar la sesión (una activa por usuario)
  // ------------------------------------------------------------------
  const handleSave = async () => {
    if (!captured || action) return
    if (note.trim().length > NOTE_MAX) {
      setError(`La nota no puede superar ${NOTE_MAX} caracteres.`)
      return
    }

    setAction('save')
    setError(null)
    try {
      // Revisa la regla de UNA sesión activa ANTES de insertar: si ya existe
      // (por ejemplo, creada desde otro dispositivo) se muestra en pantalla.
      const existing = await getActiveParkingSession()
      if (existing) {
        setActiveSession(existing)
        setCaptured(null)
        setNote('')
        setError('Ya tienes un estacionamiento activo. Finalízalo antes de registrar otro.')
        return
      }

      const session = await createParkingSession({
        latitude: captured.latitude,
        longitude: captured.longitude,
        accuracy_m: captured.accuracyM,
        note: note.trim().length > 0 ? note.trim() : null,
      })
      setActiveSession(session)
      setCaptured(null)
      setNote('')
    } catch (saveError) {
      setError(translateError(saveError).message)
    } finally {
      setAction(null)
    }
  }

  // ------------------------------------------------------------------
  // Finalizar la sesión activa
  // ------------------------------------------------------------------
  const runComplete = async (sessionId: string) => {
    setAction('complete')
    setError(null)
    try {
      await completeParkingSession(sessionId)
      setActiveSession(null)
    } catch (completeError) {
      setError(translateError(completeError).message)
    } finally {
      setAction(null)
    }
  }

  const handleComplete = () => {
    if (!activeSession || action) return
    const message = '¿Ya sacaste el auto? Esta acción cierra la sesión y no se puede deshacer.'
    const sessionId = activeSession.id

    if (Platform.OS === 'web') {
      if (globalThis.confirm?.(message)) {
        void runComplete(sessionId)
      }
      return
    }

    Alert.alert('Finalizar estacionamiento', message, [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Finalizar', style: 'destructive', onPress: () => void runComplete(sessionId) },
    ])
  }

  // ------------------------------------------------------------------
  // Encontrar el vehículo (app de mapas externa)
  // ------------------------------------------------------------------
  const handleFindVehicle = async () => {
    if (!activeSession) return
    const url = buildDirectionsUrl(activeSession.latitude, activeSession.longitude)
    try {
      const supported = await Linking.canOpenURL(url)
      if (!supported) {
        setError('No se pudo abrir la aplicación de mapas en este dispositivo.')
        return
      }
      await Linking.openURL(url)
    } catch (openError) {
      setError(translateError(openError).message)
    }
  }

  const handleOpenSettings = async () => {
    try {
      await Linking.openSettings()
    } catch (settingsError) {
      setError(translateError(settingsError).message)
    }
  }

  if (isLoading) {
    return (
      <>
        <Stack.Screen options={{ title: 'Mi vehículo' }} />
        <LoadingScreen message="Consultando tu estacionamiento…" />
      </>
    )
  }

  return (
    <>
      <Stack.Screen options={{ title: 'Mi vehículo' }} />
      <ScrollView contentContainerStyle={styles.container} showsVerticalScrollIndicator={false}>
        {error ? (
          <ErrorMessage
            message={error}
            onRetry={() => {
              setIsLoading(true)
              void reloadSession()
            }}
          />
        ) : null}

        {activeSession ? (
          <>
            <Text style={styles.sectionTitle}>ESTACIONAMIENTO ACTIVO</Text>

            <View style={styles.card}>
              <View style={styles.cardHeader}>
                <Text style={styles.cardTitle} accessibilityRole="header">
                  Vehículo estacionado
                </Text>
                <Text style={styles.statusBadge}>
                  {SESSION_STATUS_LABELS[activeSession.status]}
                </Text>
              </View>
              <Text style={styles.meta}>
                Guardado el {formatDateTime(activeSession.parked_at)}
              </Text>
              <Text style={styles.meta}>
                Ubicación: {formatCoordinates(activeSession.latitude, activeSession.longitude)}
              </Text>
              {activeSession.accuracy_m != null ? (
                <Text style={styles.meta}>
                  Precisión del GPS: ± {Math.round(activeSession.accuracy_m)} m
                </Text>
              ) : null}
              <Text style={styles.noteLabel}>Nota</Text>
              <Text style={styles.noteValue}>
                {activeSession.note ? activeSession.note : 'Sin nota.'}
              </Text>
            </View>

            <VehicleMap
              latitude={activeSession.latitude}
              longitude={activeSession.longitude}
            />

            <View style={styles.actionsColumn}>
              <Pressable
                style={({ pressed }) => [
                  styles.buttonPrimary,
                  pressed && styles.buttonPressed,
                ]}
                onPress={() => void handleFindVehicle()}
                accessibilityRole="button"
                accessibilityLabel="Encontrar mi vehículo en el mapa"
              >
                <Text style={styles.buttonPrimaryText}>Encontrar mi vehículo</Text>
              </Pressable>

              <Pressable
                style={({ pressed }) => [
                  styles.buttonSecondary,
                  pressed && styles.buttonPressed,
                  action === 'complete' && styles.buttonDisabled,
                ]}
                onPress={handleComplete}
                disabled={action === 'complete'}
                accessibilityRole="button"
                accessibilityState={{ disabled: action === 'complete', busy: action === 'complete' }}
              >
                <Text style={styles.buttonSecondaryText}>
                  {action === 'complete' ? 'Finalizando…' : 'Finalizar estacionamiento'}
                </Text>
              </Pressable>
            </View>
          </>
        ) : (
          <>
            <Text style={styles.sectionTitle}>¿DÓNDE DEJÉ MI AUTO?</Text>

            {captured ? (
              <>
                <View style={styles.card}>
                  <View style={styles.cardHeader}>
                    <Text style={styles.cardTitle} accessibilityRole="header">
                      Posición capturada
                    </Text>
                  </View>
                  <Text style={styles.meta}>
                    Ubicación: {formatCoordinates(captured.latitude, captured.longitude)}
                  </Text>
                  {captured.accuracyM != null ? (
                    <Text style={styles.meta}>
                      Precisión del GPS: ± {Math.round(captured.accuracyM)} m
                    </Text>
                  ) : null}

                  <Text style={styles.label}>Nota (opcional)</Text>
                  <TextInput
                    style={styles.input}
                    value={note}
                    onChangeText={setNote}
                    placeholder="Ej. Nivel 2, junto a la escalera"
                    placeholderTextColor={colors.muted}
                    maxLength={NOTE_MAX}
                    multiline
                    accessibilityLabel="Nota sobre el estacionamiento"
                  />
                </View>

                <VehicleMap latitude={captured.latitude} longitude={captured.longitude} />

                <View style={styles.actionsColumn}>
                  <Pressable
                    style={({ pressed }) => [
                      styles.buttonPrimary,
                      pressed && styles.buttonPressed,
                      action === 'save' && styles.buttonDisabled,
                    ]}
                    onPress={() => void handleSave()}
                    disabled={action === 'save'}
                    accessibilityRole="button"
                    accessibilityState={{ disabled: action === 'save', busy: action === 'save' }}
                  >
                    <Text style={styles.buttonPrimaryText}>
                      {action === 'save' ? 'Guardando…' : 'Confirmar y guardar'}
                    </Text>
                  </Pressable>

                  <Pressable
                    style={({ pressed }) => [styles.buttonSecondary, pressed && styles.buttonPressed]}
                    onPress={() => {
                      setCaptured(null)
                      setNote('')
                      setError(null)
                    }}
                    disabled={action === 'save'}
                    accessibilityRole="button"
                  >
                    <Text style={styles.buttonSecondaryText}>Descartar</Text>
                  </Pressable>
                </View>
              </>
            ) : (
              <View style={styles.card}>
                <Text style={styles.cardTitle} accessibilityRole="header">
                  Registra tu ubicación
                </Text>
                <Text style={styles.helpText}>
                  ParkEasy usará el GPS de tu dispositivo para guardar exactamente dónde dejaste el
                  vehículo. Sólo tú puedes ver esta ubicación.
                </Text>

                {permissionDenied ? (
                  <>
                    <Text style={styles.helpText}>
                      Sin permiso de ubicación no se puede guardar la posición del vehículo.
                    </Text>
                    {canOpenSettings ? (
                      <Pressable
                        style={({ pressed }) => [
                          styles.buttonSecondary,
                          pressed && styles.buttonPressed,
                        ]}
                        onPress={() => void handleOpenSettings()}
                        accessibilityRole="button"
                      >
                        <Text style={styles.buttonSecondaryText}>Abrir ajustes de la app</Text>
                      </Pressable>
                    ) : null}
                  </>
                ) : null}

                <Pressable
                  style={({ pressed }) => [
                    styles.buttonPrimary,
                    pressed && styles.buttonPressed,
                    action === 'capture' && styles.buttonDisabled,
                  ]}
                  onPress={() => void handleCapture()}
                  disabled={action === 'capture'}
                  accessibilityRole="button"
                  accessibilityState={{ disabled: action === 'capture', busy: action === 'capture' }}
                >
                  <Text style={styles.buttonPrimaryText}>
                    {action === 'capture' ? 'Obteniendo ubicación…' : 'Guardar dónde dejé mi auto'}
                  </Text>
                </Pressable>
              </View>
            )}
          </>
        )}
      </ScrollView>
    </>
  )
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.xl,
    paddingBottom: spacing.xxxl,
    gap: spacing.md,
  },
  sectionTitle: {
    ...typography.section,
    color: colors.muted,
    marginTop: spacing.lg,
    marginBottom: spacing.xs,
  },
  card: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.lineSoft,
    borderRadius: radius.md,
    padding: spacing.lg,
    gap: spacing.xs,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  cardTitle: {
    ...typography.bodyStrong,
    color: colors.ink,
  },
  statusBadge: {
    ...typography.label,
    borderRadius: radius.pill,
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.sm,
    backgroundColor: colors.accent,
    color: colors.onInk,
  },
  meta: {
    ...typography.caption,
    color: colors.mutedOnCanvas,
  },
  noteLabel: {
    ...typography.label,
    color: colors.inkSoft,
    marginTop: spacing.sm,
  },
  noteValue: {
    ...typography.body,
    color: colors.ink,
  },
  helpText: {
    ...typography.caption,
    color: colors.mutedOnCanvas,
    lineHeight: 18,
  },
  label: {
    ...typography.label,
    color: colors.inkSoft,
    marginTop: spacing.sm,
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
    minHeight: HIT_SLOP_MIN,
    textAlignVertical: 'top',
  },
  map: {
    width: '100%',
    height: 220,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.lineSoft,
  },
  mapFrame: {
    width: '100%',
    height: 220,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.lineSoft,
    overflow: 'hidden',
  },
  mapInner: {
    flex: 1,
  },
  mapFallback: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.lineSoft,
    borderRadius: radius.md,
    padding: spacing.lg,
  },
  mapFallbackText: {
    ...typography.caption,
    color: colors.mutedOnCanvas,
  },
  actionsColumn: {
    gap: spacing.md,
    marginTop: spacing.sm,
  },
  buttonPrimary: {
    minHeight: HIT_SLOP_MIN,
    borderRadius: radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.accent,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  buttonSecondary: {
    minHeight: HIT_SLOP_MIN,
    borderRadius: radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
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
