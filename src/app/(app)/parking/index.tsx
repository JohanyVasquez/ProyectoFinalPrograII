/**
 * Pantalla de estacionamientos (Persona 3).
 *
 * Listado de ubicaciones registradas en Supabase con los espacios asociados,
 * su estado manual (disponible / ocupado / mantenimiento), búsqueda y filtros,
 * y gestión del catálogo (sólo `admin`).
 *
 * Reglas que se respetan aquí:
 * - El estado de un espacio es MANUAL: lo marca una persona vía
 *   `setSpaceStatus` y puede estar desactualizado. Nunca se presenta como
 *   disponibilidad en tiempo real.
 * - Sólo `admin` ve los botones de creación de ubicaciones/espacios.
 * - Sólo `operator`/`admin` (staff) ven los botones de cambio de estado.
 * - Las autorizaciones reales de escritura las dicta RLS, no esta pantalla.
 * - El formulario "Nueva ubicación" puede autocompletar latitud/longitud con
 *   el GPS: el permiso sólo se pide al tocar el botón; al abrir el formulario
 *   se rellena en automático sólo si el permiso ya estaba concedido.
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import {
  ActivityIndicator,
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
import { useAuth } from '@/hooks/useAuth'
import { AppError, translateError } from '@/lib/errors'
import { areValidCoordinates, LOCATION_NAME_MAX, SPACE_CODE_MAX } from '@/lib/validation'
import { createLocation, listLocations } from '@/services/parking-locations.service'
import { createSpace, listSpaces, setSpaceStatus } from '@/services/parking-spaces.service'
import {
  canManageParkingCatalog,
  canManageSpaceStatus,
  SPACE_STATUS_LABELS,
  SPACE_STATUS_VALUES,
  type ParkingLocation,
  type ParkingSpace,
  type SpaceStatus,
} from '@/types/models'
import { HIT_SLOP_MIN, colors, radius, spacing, typography } from '@/constants/theme'

/** Filtro de estado de espacios. `null` = todos. */
type StatusFilter = SpaceStatus | null

/** Tope de espera de las consultas: la pantalla nunca carga para siempre. */
const QUERY_TIMEOUT_MS = 15_000
const QUERY_TIMEOUT_CODE = 'query_timeout'

/**
 * Si Supabase no responde (red inestable), la consulta se rechaza con un
 * mensaje claro y la pantalla ofrece **Reintentar** en lugar de quedarse
 * cargando indefinidamente.
 */
function withQueryTimeout<T>(promise: Promise<T>, ms: number = QUERY_TIMEOUT_MS): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(
        new AppError('La consulta tardó demasiado. Revisa tu conexión e inténtalo de nuevo.', {
          code: QUERY_TIMEOUT_CODE,
        }),
      )
    }, ms)
    promise.then(
      (value) => {
        clearTimeout(timer)
        resolve(value)
      },
      (error: unknown) => {
        clearTimeout(timer)
        reject(error)
      },
    )
  })
}

/** El error de espera máxima se muestra tal cual; el resto pasa por `translateError`. */
function loadErrorMessage(error: unknown): string {
  if (error instanceof AppError && error.code === QUERY_TIMEOUT_CODE) return error.message
  return translateError(error).message
}

export default function ParkingScreen() {
  const { role } = useAuth()
  const isStaff = canManageSpaceStatus(role)
  const isAdmin = canManageParkingCatalog(role)

  const [locations, setLocations] = useState<ParkingLocation[]>([])
  const [spaces, setSpaces] = useState<ParkingSpace[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [search, setSearch] = useState('')
  const [selectedLocationId, setSelectedLocationId] = useState<string | null>(null)
  const [statusFilter, setStatusFilter] = useState<StatusFilter>(null)

  const [showCreateLocation, setShowCreateLocation] = useState(false)
  const [showCreateSpace, setShowCreateSpace] = useState(false)
  const [savingSpaceId, setSavingSpaceId] = useState<string | null>(null)

  const selectedLocation = locations.find((location) => location.id === selectedLocationId) ?? null

  // ------------------------------------------------------------------
  // Listado de ubicaciones (búsqueda por nombre o dirección)
  // ------------------------------------------------------------------
  useEffect(() => {
    let cancelled = false
    const load = async () => {
      setIsLoading(true)
      try {
        const result = await withQueryTimeout(
          listLocations({ search, includeInactive: isAdmin }),
        )
        if (cancelled) return
        setLocations(result.data)
        setError(null)
      } catch (loadError) {
        if (!cancelled) setError(loadErrorMessage(loadError))
      } finally {
        if (!cancelled) setIsLoading(false)
      }
    }
    void load()
    return () => {
      cancelled = true
    }
  }, [search, isAdmin])

  const reloadLocations = useCallback(async () => {
    setIsLoading(true)
    try {
      const result = await withQueryTimeout(
        listLocations({ search, includeInactive: isAdmin }),
      )
      setLocations(result.data)
      setError(null)
    } catch (loadError) {
      setError(loadErrorMessage(loadError))
    } finally {
      setIsLoading(false)
    }
  }, [search, isAdmin])

  const reload = useCallback(async () => {
    await reloadLocations()
  }, [reloadLocations])

  // ------------------------------------------------------------------
  // Espacios del estacionamiento seleccionado (filtro por estado)
  // ------------------------------------------------------------------
  const loadSpaces = useCallback(async () => {
    setIsLoading(true)
    try {
      if (selectedLocationId) {
        const result = await withQueryTimeout(
          listSpaces({
            locationId: selectedLocationId,
            status: statusFilter ?? undefined,
            includeInactive: isAdmin,
          }),
        )
        setSpaces(result.data)
      } else {
        setSpaces([])
      }
      setError(null)
    } catch (loadError) {
      setError(loadErrorMessage(loadError))
    } finally {
      setIsLoading(false)
    }
  }, [selectedLocationId, statusFilter, isAdmin])

  useEffect(() => {
    let cancelled = false
    const load = async () => {
      setIsLoading(true)
      try {
        if (selectedLocationId) {
          const result = await withQueryTimeout(
            listSpaces({
              locationId: selectedLocationId,
              status: statusFilter ?? undefined,
              includeInactive: isAdmin,
            }),
          )
          if (cancelled) return
          setSpaces(result.data)
        } else {
          setSpaces([])
        }
        setError(null)
      } catch (loadError) {
        if (!cancelled) setError(loadErrorMessage(loadError))
      } finally {
        if (!cancelled) setIsLoading(false)
      }
    }
    void load()
    return () => {
      cancelled = true
    }
  }, [selectedLocationId, statusFilter, isAdmin])

  // ------------------------------------------------------------------
  // Cambio manual del estado de un espacio (operator / admin)
  // ------------------------------------------------------------------
  const handleSetSpaceStatus = async (spaceId: string, nextStatus: SpaceStatus) => {
    if (savingSpaceId) return
    setSavingSpaceId(spaceId)
    try {
      const updated = await setSpaceStatus(spaceId, nextStatus)
      setSpaces((current) => current.map((space) => (space.id === updated.id ? updated : space)))
      setError(null)
    } catch (statusError) {
      setError(translateError(statusError).message)
    } finally {
      setSavingSpaceId(null)
    }
  }

  // ------------------------------------------------------------------
  // Creación de ubicación (admin)
  // ------------------------------------------------------------------
  const [locationDraft, setLocationDraft] = useState({
    name: '',
    address: '',
    description: '',
    latitude: '',
    longitude: '',
  })
  const [locationSaving, setLocationSaving] = useState(false)
  const [locationFormError, setLocationFormError] = useState<string | null>(null)
  const [locationGpsBusy, setLocationGpsBusy] = useState(false)
  const [locationGpsMessage, setLocationGpsMessage] = useState<string | null>(null)

  const resetLocationDraft = () => {
    setLocationDraft({ name: '', address: '', description: '', latitude: '', longitude: '' })
    setLocationFormError(null)
    setLocationGpsMessage(null)
  }

  const handleCreateLocation = async () => {
    const name = locationDraft.name.trim()
    const address = locationDraft.address.trim()
    const description = locationDraft.description.trim()
    const latitude = locationDraft.latitude.trim()
    const longitude = locationDraft.longitude.trim()

    if (name.length === 0 || name.length > LOCATION_NAME_MAX) {
      setLocationFormError(`El nombre debe tener entre 1 y ${LOCATION_NAME_MAX} caracteres.`)
      return
    }

    // `coordinates_together` en la BD: las coordenadas van juntas o no van.
    let parsedLatitude: number | null = null
    let parsedLongitude: number | null = null
    if (latitude.length > 0 || longitude.length > 0) {
      const latNumber = Number(latitude)
      const lngNumber = Number(longitude)
      if (Number.isNaN(latNumber) || Number.isNaN(lngNumber)) {
        setLocationFormError('Las coordenadas deben ser números válidos.')
        return
      }
      if (!areValidCoordinates(latNumber, lngNumber)) {
        setLocationFormError('Las coordenadas no son válidas. Latitud [-90, 90], longitud [-180, 180].')
        return
      }
      if (latitude.length > 0 && longitude.length > 0) {
        parsedLatitude = latNumber
        parsedLongitude = lngNumber
      }
    }

    setLocationSaving(true)
    setLocationFormError(null)
    try {
      await createLocation({
        name,
        address,
        description: description.length > 0 ? description : null,
        latitude: parsedLatitude,
        longitude: parsedLongitude,
      })
      setShowCreateLocation(false)
      resetLocationDraft()
      await reloadLocations()
    } catch (createError) {
      setLocationFormError(translateError(createError).message)
    } finally {
      setLocationSaving(false)
    }
  }

  // ------------------------------------------------------------------
  // Coordenadas por GPS del formulario "Nueva ubicación"
  // ------------------------------------------------------------------
  const locationPrefillRef = useRef(false)

  /**
   * Autocompletado al abrir el formulario: sólo si el permiso YA estaba
   * concedido (aquí nunca se pide), una sola vez por apertura y sin pisar
   * valores escritos a mano. Si el GPS falla, el formulario sigue siendo
   * usable: las coordenadas son opcionales.
   */
  useEffect(() => {
    if (!showCreateLocation) {
      locationPrefillRef.current = false
      return
    }
    if (locationPrefillRef.current) return
    locationPrefillRef.current = true
    let cancelled = false
    const prefill = async () => {
      try {
        const permission = await Location.getForegroundPermissionsAsync()
        if (!permission.granted || cancelled) return
        const position = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Balanced,
        })
        if (cancelled) return
        setLocationDraft((draft) =>
          draft.latitude.trim().length === 0 && draft.longitude.trim().length === 0
            ? {
                ...draft,
                latitude: position.coords.latitude.toFixed(6),
                longitude: position.coords.longitude.toFixed(6),
              }
            : draft,
        )
      } catch {
        // Best-effort: sin GPS el usuario completa las coordenadas a mano.
      }
    }
    void prefill()
    return () => {
      cancelled = true
    }
  }, [showCreateLocation])

  /** Rellena Latitud/Longitud con la posición real del dispositivo. */
  const handleFillCurrentLocation = async () => {
    if (locationGpsBusy) return
    setLocationGpsBusy(true)
    setLocationGpsMessage(null)
    try {
      const servicesEnabled = await Location.hasServicesEnabledAsync()
      if (!servicesEnabled) {
        setLocationGpsMessage(
          'La ubicación del dispositivo está desactivada. Activa el GPS o escribe las coordenadas a mano.',
        )
        return
      }
      let permission = await Location.getForegroundPermissionsAsync()
      if (!permission.granted) {
        // El permiso sólo se pide al tocar este botón, nunca al abrir el formulario.
        permission = await Location.requestForegroundPermissionsAsync()
      }
      if (!permission.granted) {
        setLocationGpsMessage(
          'ParkEasy necesita acceso a tu ubicación para autocompletar las coordenadas. Puedes escribirlas a mano.',
        )
        return
      }
      const position = await withQueryTimeout(
        Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }),
      )
      setLocationDraft((draft) => ({
        ...draft,
        latitude: position.coords.latitude.toFixed(6),
        longitude: position.coords.longitude.toFixed(6),
      }))
      setLocationGpsMessage('Ubicación obtenida. Puedes editar los valores antes de guardar.')
    } catch (gpsError) {
      setLocationGpsMessage(loadErrorMessage(gpsError))
    } finally {
      setLocationGpsBusy(false)
    }
  }

  // ------------------------------------------------------------------
  // Creación de espacio (admin)
  // ------------------------------------------------------------------
  const [spaceDraft, setSpaceDraft] = useState({
    location_id: '',
    code: '',
    floor_label: '',
    description: '',
    status: 'available' as SpaceStatus,
  })
  const [spaceSaving, setSpaceSaving] = useState(false)
  const [spaceFormError, setSpaceFormError] = useState<string | null>(null)
  const [spaceNotice, setSpaceNotice] = useState<string | null>(null)

  const resetSpaceDraft = () => {
    setSpaceDraft({
      location_id: selectedLocationId ?? locations[0]?.id ?? '',
      code: '',
      floor_label: '',
      description: '',
      status: 'available',
    })
    setSpaceFormError(null)
    setSpaceNotice(null)
  }

  const handleCreateSpace = async () => {
    if (!spaceDraft.location_id) {
      setSpaceFormError('Selecciona una ubicación para registrar el espacio.')
      return
    }
    const code = spaceDraft.code.trim()
    if (code.length === 0 || code.length > SPACE_CODE_MAX) {
      setSpaceFormError(`El código debe tener entre 1 y ${SPACE_CODE_MAX} caracteres.`)
      return
    }
    setSpaceSaving(true)
    setSpaceFormError(null)
    try {
      await createSpace({
        location_id: spaceDraft.location_id,
        code,
        floor_label: spaceDraft.floor_label.trim() || null,
        description: spaceDraft.description.trim() || null,
        status: spaceDraft.status,
      })
      setShowCreateSpace(false)
      setSpaceNotice(`Espacio «${code}» registrado correctamente.`)
      if (selectedLocationId !== spaceDraft.location_id) {
        // Mostrar el listado de la ubicación donde se creó el espacio.
        setSelectedLocationId(spaceDraft.location_id)
        setStatusFilter(null)
      } else {
        await loadSpaces()
      }
      await reloadLocations()
    } catch (createError) {
      setSpaceFormError(translateError(createError).message)
    } finally {
      setSpaceSaving(false)
    }
  }

  const statusChips: { value: StatusFilter; label: string }[] = [
    { value: null, label: 'Todos' },
    ...SPACE_STATUS_VALUES.map((value) => ({
      value,
      label: SPACE_STATUS_LABELS[value],
    })),
  ]

  if (isLoading) {
    return (
      <>
        <Stack.Screen options={{ title: 'Estacionamientos' }} />
        <LoadingScreen message="Cargando estacionamientos…" />
      </>
    )
  }

  return (
    <>
      <Stack.Screen options={{ title: 'Estacionamientos' }} />
      <ScrollView contentContainerStyle={styles.container} showsVerticalScrollIndicator={false}>
        {error ? <ErrorMessage message={error} onRetry={() => void reload()} /> : null}

        <Text style={styles.sectionTitle}>BUSCAR</Text>
        <View style={styles.searchBox}>
          <TextInput
            style={styles.searchInput}
            value={search}
            onChangeText={setSearch}
            placeholder="Buscar por nombre o dirección"
            placeholderTextColor={colors.muted}
            autoCapitalize="none"
            autoCorrect={false}
            returnKeyType="search"
            accessibilityLabel="Buscar estacionamiento por nombre o dirección"
          />
        </View>

        <Text style={styles.sectionTitle}>UBICACIONES</Text>

        {locations.length === 0 ? (
          <View style={styles.emptyCard}>
            <Text style={styles.emptyTitle}>Sin estacionamientos registrados</Text>
            <Text style={styles.emptyText}>
              Aún no hay ubicaciones. Si tienes permisos de administrador, registra la primera.
            </Text>
          </View>
        ) : (
          locations.map((location) => (
            <Pressable
              key={location.id}
              style={({ pressed }) => [
                styles.locationCard,
                pressed && styles.locationCardPressed,
              ]}
              onPress={() => {
                setSelectedLocationId(location.id)
                setStatusFilter(null)
              }}
              accessibilityRole="button"
              accessibilityLabel={`Ver espacios de ${location.name}`}
            >
              <Text style={styles.locationName} accessibilityRole="header">
                {location.name}
              </Text>
              <Text style={styles.locationAddress}>{location.address}</Text>
              {location.description ? (
                <Text style={styles.locationDescription}>{location.description}</Text>
              ) : null}
            </Pressable>
          ))
        )}

        {selectedLocation ? (
          <>
            <Text style={styles.sectionTitle}>ESPACIOS</Text>
            <View style={styles.selectedLocationCard}>
              <Text style={styles.locationName}>{selectedLocation.name}</Text>
              <Text style={styles.locationAddress}>{selectedLocation.address}</Text>
              {selectedLocation.description ? (
                <Text style={styles.locationDescription}>{selectedLocation.description}</Text>
              ) : null}
            </View>

            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              style={styles.chipsScroll}
              contentContainerStyle={styles.chipsContent}
            >
              {statusChips.map((chip) => (
                <Pressable
                  key={chip.label}
                  style={({ pressed }) => [
                    styles.chip,
                    statusFilter === chip.value && styles.chipActive,
                    pressed && styles.chipPressed,
                  ]}
                  onPress={() => setStatusFilter(chip.value)}
                  accessibilityRole="button"
                  accessibilityLabel={`Filtrar por estado: ${chip.label}`}
                  accessibilityState={{ selected: statusFilter === chip.value }}
                >
                  <Text style={styles.chipText}>{chip.label}</Text>
                </Pressable>
              ))}
            </ScrollView>

            {spaces.length === 0 ? (
              <View style={styles.emptyCard}>
                <Text style={styles.emptyTitle}>Sin espacios para mostrar</Text>
                <Text style={styles.emptyText}>
                  Este estacionamiento todavía no tiene espacios registrados.
                </Text>
              </View>
            ) : (
              spaces.map((space) => (
                <View key={space.id} style={styles.spaceCard}>
                  <View style={styles.spaceHeader}>
                    <Text style={styles.spaceCode} accessibilityRole="header">
                      {space.code}
                    </Text>
                    <Text style={[styles.statusBadge, styles[`statusBadge_${space.status}`]]}>
                      {SPACE_STATUS_LABELS[space.status]}
                    </Text>
                  </View>
                  {space.floor_label ? (
                    <Text style={styles.spaceMeta}>Nivel: {space.floor_label}</Text>
                  ) : null}
                  {space.description ? <Text style={styles.spaceMeta}>{space.description}</Text> : null}
                  {isStaff ? (
                    <View style={styles.statusActions}>
                      {SPACE_STATUS_VALUES.map((value) => (
                        <Pressable
                          key={value}
                          style={({ pressed }) => [
                            styles.statusAction,
                            savingSpaceId === space.id && styles.statusActionDisabled,
                            pressed && styles.statusActionPressed,
                          ]}
                          onPress={() => void handleSetSpaceStatus(space.id, value)}
                          disabled={savingSpaceId === space.id}
                          accessibilityRole="button"
                          accessibilityLabel={`Marcar espacio ${space.code} como ${SPACE_STATUS_LABELS[value]}`}
                          accessibilityState={{ disabled: savingSpaceId === space.id }}
                        >
                          <Text style={styles.statusActionText}>{SPACE_STATUS_LABELS[value]}</Text>
                        </Pressable>
                      ))}
                    </View>
                  ) : null}
                </View>
              ))
            )}
          </>
        ) : null}

        {isAdmin ? (
          <View style={styles.adminSection}>
            <Text style={styles.sectionTitle}>ADMINISTRACIÓN</Text>
            {spaceNotice ? <Text style={styles.gpsMessage}>{spaceNotice}</Text> : null}
            {!showCreateLocation ? (
              <Pressable
                style={({ pressed }) => [styles.adminButton, pressed && styles.adminButtonPressed]}
                onPress={() => setShowCreateLocation(true)}
                accessibilityRole="button"
                accessibilityLabel="Registrar nueva ubicación de estacionamiento"
              >
                <Text style={styles.adminButtonText}>Registrar ubicación</Text>
              </Pressable>
            ) : null}
            {!showCreateSpace ? (
              <Pressable
                style={({ pressed }) => [styles.adminButton, pressed && styles.adminButtonPressed]}
                onPress={() => {
                  resetSpaceDraft()
                  setShowCreateSpace(true)
                }}
                accessibilityRole="button"
                accessibilityLabel="Registrar nuevo espacio de estacionamiento"
              >
                <Text style={styles.adminButtonText}>Registrar espacio</Text>
              </Pressable>
            ) : null}

            {showCreateLocation ? (
              <View style={styles.formCard}>
                <Text style={styles.formTitle}>Nueva ubicación</Text>
                {locationFormError ? <ErrorMessage message={locationFormError} /> : null}
                <Text style={styles.label}>Nombre</Text>
                <TextInput
                  style={styles.input}
                  value={locationDraft.name}
                  onChangeText={(text) => setLocationDraft((draft) => ({ ...draft, name: text }))}
                  placeholder="Estacionamiento Central"
                  placeholderTextColor={colors.muted}
                  accessibilityLabel="Nombre de la ubicación"
                />
                <Text style={styles.label}>Dirección</Text>
                <TextInput
                  style={styles.input}
                  value={locationDraft.address}
                  onChangeText={(text) => setLocationDraft((draft) => ({ ...draft, address: text }))}
                  placeholder="Calle Ficticia 123"
                  placeholderTextColor={colors.muted}
                  accessibilityLabel="Dirección de la ubicación"
                />
                <Text style={styles.label}>Descripción</Text>
                <TextInput
                  style={[styles.input, styles.textArea]}
                  value={locationDraft.description}
                  onChangeText={(text) => setLocationDraft((draft) => ({ ...draft, description: text }))}
                  placeholder="Opcional"
                  placeholderTextColor={colors.muted}
                  multiline
                  accessibilityLabel="Descripción de la ubicación"
                />
                <Text style={styles.label}>Latitud</Text>
                <TextInput
                  style={styles.input}
                  value={locationDraft.latitude}
                  onChangeText={(text) => setLocationDraft((draft) => ({ ...draft, latitude: text }))}
                  keyboardType="numeric"
                  placeholder="Latitud (opcional)"
                  placeholderTextColor={colors.muted}
                  accessibilityLabel="Latitud de la ubicación"
                />
                <Text style={styles.label}>Longitud</Text>
                <TextInput
                  style={styles.input}
                  value={locationDraft.longitude}
                  onChangeText={(text) => setLocationDraft((draft) => ({ ...draft, longitude: text }))}
                  keyboardType="numeric"
                  placeholder="Longitud (opcional)"
                  placeholderTextColor={colors.muted}
                  accessibilityLabel="Longitud de la ubicación"
                />
                <Pressable
                  style={({ pressed }) => [
                    styles.gpsButton,
                    pressed && styles.adminButtonPressed,
                    locationGpsBusy && styles.buttonDisabled,
                  ]}
                  onPress={() => void handleFillCurrentLocation()}
                  disabled={locationGpsBusy}
                  accessibilityRole="button"
                  accessibilityState={{ disabled: locationGpsBusy, busy: locationGpsBusy }}
                >
                  <View style={styles.gpsButtonContent}>
                    {locationGpsBusy ? (
                      <ActivityIndicator size="small" color={colors.ink} />
                    ) : null}
                    <Text style={styles.adminButtonText}>
                      {locationGpsBusy ? 'Obteniendo ubicación…' : 'Obtener mi ubicación actual'}
                    </Text>
                  </View>
                </Pressable>
                {locationGpsMessage ? (
                  <Text style={styles.gpsMessage}>{locationGpsMessage}</Text>
                ) : null}
                <View style={styles.actionsRow}>
                  <Pressable
                    style={({ pressed }) => [styles.buttonSecondary, pressed && styles.buttonPressed]}
                    onPress={() => {
                      setShowCreateLocation(false)
                      resetLocationDraft()
                    }}
                    disabled={locationSaving}
                    accessibilityRole="button"
                  >
                    <Text style={styles.buttonSecondaryText}>Cancelar</Text>
                  </Pressable>
                  <Pressable
                    style={({ pressed }) => [
                      styles.buttonPrimary,
                      pressed && styles.buttonPressed,
                      locationSaving && styles.buttonDisabled,
                    ]}
                    onPress={() => void handleCreateLocation()}
                    disabled={locationSaving}
                    accessibilityRole="button"
                    accessibilityState={{ disabled: locationSaving, busy: locationSaving }}
                  >
                    {locationSaving ? (
                      <Text style={styles.buttonPrimaryText}>Guardando…</Text>
                    ) : (
                      <Text style={styles.buttonPrimaryText}>Guardar ubicación</Text>
                    )}
                  </Pressable>
                </View>
              </View>
            ) : null}

            {showCreateSpace ? (
              <View style={styles.formCard}>
                <Text style={styles.formTitle}>Nuevo espacio</Text>
                {spaceFormError ? <ErrorMessage message={spaceFormError} /> : null}
                <Text style={styles.label}>Ubicación</Text>
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  style={styles.chipsScroll}
                  contentContainerStyle={styles.chipsContent}
                >
                  {locations.map((location) => (
                    <Pressable
                      key={location.id}
                      style={({ pressed }) => [
                        styles.chip,
                        spaceDraft.location_id === location.id && styles.chipActive,
                        pressed && styles.chipPressed,
                      ]}
                      onPress={() => setSpaceDraft((draft) => ({ ...draft, location_id: location.id }))}
                      accessibilityRole="button"
                      accessibilityLabel={`Ubicación ${location.name}`}
                    >
                      <Text style={styles.chipText}>{location.name}</Text>
                    </Pressable>
                  ))}
                </ScrollView>
                <Text style={styles.label}>Código</Text>
                <TextInput
                  style={styles.input}
                  value={spaceDraft.code}
                  onChangeText={(text) => setSpaceDraft((draft) => ({ ...draft, code: text }))}
                  placeholder="A-12"
                  placeholderTextColor={colors.muted}
                  accessibilityLabel="Código del espacio"
                />
                <Text style={styles.label}>Nivel</Text>
                <TextInput
                  style={styles.input}
                  value={spaceDraft.floor_label}
                  onChangeText={(text) => setSpaceDraft((draft) => ({ ...draft, floor_label: text }))}
                  placeholder="Planta 1"
                  placeholderTextColor={colors.muted}
                  accessibilityLabel="Nivel del espacio"
                />
                <Text style={styles.label}>Descripción</Text>
                <TextInput
                  style={[styles.input, styles.textArea]}
                  value={spaceDraft.description}
                  onChangeText={(text) => setSpaceDraft((draft) => ({ ...draft, description: text }))}
                  placeholder="Opcional"
                  placeholderTextColor={colors.muted}
                  multiline
                  accessibilityLabel="Descripción del espacio"
                />
                <Text style={styles.label}>Estado inicial</Text>
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  style={styles.chipsScroll}
                  contentContainerStyle={styles.chipsContent}
                >
                  {SPACE_STATUS_VALUES.map((value) => (
                    <Pressable
                      key={value}
                      style={({ pressed }) => [
                        styles.chip,
                        spaceDraft.status === value && styles.chipActive,
                        pressed && styles.chipPressed,
                      ]}
                      onPress={() => setSpaceDraft((draft) => ({ ...draft, status: value }))}
                      accessibilityRole="button"
                      accessibilityLabel={`Estado inicial: ${SPACE_STATUS_LABELS[value]}`}
                      accessibilityState={{ selected: spaceDraft.status === value }}
                    >
                      <Text style={styles.chipText}>{SPACE_STATUS_LABELS[value]}</Text>
                    </Pressable>
                  ))}
                </ScrollView>
                <View style={styles.actionsRow}>
                  <Pressable
                    style={({ pressed }) => [styles.buttonSecondary, pressed && styles.buttonPressed]}
                    onPress={() => setShowCreateSpace(false)}
                    disabled={spaceSaving}
                    accessibilityRole="button"
                  >
                    <Text style={styles.buttonSecondaryText}>Cancelar</Text>
                  </Pressable>
                  <Pressable
                    style={({ pressed }) => [
                      styles.buttonPrimary,
                      pressed && styles.buttonPressed,
                      spaceSaving && styles.buttonDisabled,
                    ]}
                    onPress={() => void handleCreateSpace()}
                    disabled={spaceSaving}
                    accessibilityRole="button"
                    accessibilityState={{ disabled: spaceSaving, busy: spaceSaving }}
                  >
                    {spaceSaving ? (
                      <Text style={styles.buttonPrimaryText}>Guardando…</Text>
                    ) : (
                      <Text style={styles.buttonPrimaryText}>Guardar espacio</Text>
                    )}
                  </Pressable>
                </View>
              </View>
            ) : null}
          </View>
        ) : null}
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
  searchBox: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.md,
  },
  searchInput: {
    ...typography.body,
    color: colors.ink,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  locationCard: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.lineSoft,
    borderRadius: radius.md,
    padding: spacing.lg,
    gap: spacing.xs,
  },
  locationCardPressed: {
    opacity: 0.75,
  },
  selectedLocationCard: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.lineSoft,
    borderRadius: radius.md,
    padding: spacing.lg,
    gap: spacing.xs,
  },
  locationName: {
    ...typography.bodyStrong,
    color: colors.ink,
  },
  locationAddress: {
    ...typography.caption,
    color: colors.mutedOnCanvas,
  },
  locationDescription: {
    ...typography.caption,
    color: colors.muted,
    marginTop: spacing.xs,
  },
  chipsScroll: {
    marginVertical: spacing.xs,
  },
  chipsContent: {
    flexDirection: 'row',
    gap: spacing.sm,
    paddingBottom: spacing.xs,
  },
  chip: {
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.pill,
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.md,
    backgroundColor: colors.surface,
  },
  chipActive: {
    backgroundColor: colors.accent,
    borderColor: colors.accent,
  },
  chipPressed: {
    opacity: 0.75,
  },
  chipText: {
    ...typography.label,
    color: colors.ink,
  },
  spaceCard: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.lineSoft,
    borderRadius: radius.md,
    padding: spacing.lg,
    gap: spacing.xs,
  },
  spaceHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  spaceCode: {
    ...typography.bodyStrong,
    color: colors.ink,
  },
  statusBadge: {
    ...typography.label,
    borderRadius: radius.pill,
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.sm,
  },
  statusBadge_available: {
    backgroundColor: colors.accent,
  },
  statusBadge_occupied: {
    backgroundColor: colors.ink,
  },
  statusBadge_maintenance: {
    backgroundColor: colors.muted,
  },
  spaceMeta: {
    ...typography.caption,
    color: colors.mutedOnCanvas,
  },
  statusActions: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.xs,
  },
  statusAction: {
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.sm,
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.md,
  },
  statusActionDisabled: {
    opacity: 0.5,
  },
  statusActionPressed: {
    opacity: 0.75,
  },
  statusActionText: {
    ...typography.label,
    color: colors.ink,
  },
  emptyCard: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.lineSoft,
    borderRadius: radius.md,
    padding: spacing.lg,
    gap: spacing.xs,
  },
  emptyTitle: {
    ...typography.bodyStrong,
    color: colors.ink,
  },
  emptyText: {
    ...typography.caption,
    color: colors.mutedOnCanvas,
  },
  adminSection: {
    marginTop: spacing.xl,
    gap: spacing.sm,
  },
  adminButton: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.md,
    paddingVertical: spacing.md,
    alignItems: 'center',
  },
  adminButtonPressed: {
    opacity: 0.75,
  },
  adminButtonText: {
    ...typography.bodyStrong,
    color: colors.ink,
  },
  gpsButton: {
    marginTop: spacing.md,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.md,
    paddingVertical: spacing.md,
    alignItems: 'center',
  },
  gpsButtonContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  gpsMessage: {
    ...typography.caption,
    color: colors.mutedOnCanvas,
    marginTop: spacing.xs,
  },
  formCard: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.lineSoft,
    borderRadius: radius.md,
    padding: spacing.lg,
    gap: spacing.xs,
  },
  formTitle: {
    ...typography.title,
    color: colors.ink,
    marginBottom: spacing.sm,
  },
  label: {
    ...typography.label,
    color: colors.inkSoft,
    marginTop: spacing.xs,
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
  textArea: {
    minHeight: 70,
    textAlignVertical: 'top',
  },
  actionsRow: {
    flexDirection: 'row',
    gap: spacing.md,
    marginTop: spacing.md,
  },
  buttonPrimary: {
    flex: 1,
    minHeight: HIT_SLOP_MIN,
    borderRadius: radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.accent,
  },
  buttonSecondary: {
    flex: 1,
    minHeight: HIT_SLOP_MIN,
    borderRadius: radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
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
