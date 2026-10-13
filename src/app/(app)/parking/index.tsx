/**
 * Placeholder de estacionamientos (Persona 3).
 *
 * Persona 3 implementa aquí el listado y la administración de espacios
 * usando `parking-locations.service` y `parking-spaces.service`.
 * Esta versión NO hace consultas: sólo confirma que la ruta está protegida.
 */

import { PlaceholderScreen } from '@/components/common/PlaceholderScreen'

export default function ParkingScreen() {
  return (
    <PlaceholderScreen
      title="Estacionamientos"
      description="Aquí irá el listado de ubicaciones y espacios con su estado manual."
      owner="Persona 3"
    />
  )
}