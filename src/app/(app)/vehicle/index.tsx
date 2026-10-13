/**
 * Placeholder de GPS / vehículo (Persona 4).
 *
 * Persona 4 implementa aquí el permiso de ubicación, el guardado de
 * coordenadas y la pantalla para encontrar el auto, usando
 * `parking-sessions.service`. Esta versión NO pide permisos de ubicación.
 */

import { PlaceholderScreen } from '@/components/common/PlaceholderScreen'

export default function VehicleScreen() {
  return (
    <PlaceholderScreen
      title="Mi vehículo"
      description="Aquí se guardará por GPS dónde dejaste tu vehículo y cómo encontrarlo."
      owner="Persona 4"
    />
  )
}