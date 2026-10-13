/**
 * Instancia ÚNICA (singleton) del cliente de Supabase.
 *
 * Cualquier módulo que necesite la BD importa `supabase` desde aquí.
 * Crear un segundo cliente duplica el estado de sesión y produce
 * "sesiones fantasma" y warnings de storage-key compartida.
 *
 * Detalles que parecen opcionales pero NO lo son:
 * - `react-native-url-polyfill/auto` es obligatorio: Supabase usa `URL`,
 *   que Hermes no trae de forma nativa.
 * - `storage: AsyncStorage` es obligatorio: sin esto, `persistSession`
 *   no puede funcionar en nativo y la sesión se pierde al reiniciar.
 * - `detectSessionInUrl: false` porque en móvil no hay fragmento de URL
 *   con el token que procesar.
 */

import 'react-native-url-polyfill/auto'

import AsyncStorage from '@react-native-async-storage/async-storage'
import { AppState } from 'react-native'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'

import { AppError, logTechnical, missingEnvMessage } from '@/lib/errors'
import type { Database } from '@/types/database.types'

/**
 * Las variables `EXPO_PUBLIC_*` se incrustan en el bundle: NO son secretas.
 * La protección de los datos la da RLS, no el secreto.
 *
 * Si tu proyecto usa la clave `anon` legada, renombra la variable en el
 * Dashboard y en `.env`; no se admiten los dos nombres a la vez.
 */
const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL
const supabasePublishableKey = process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY

/**
 * Error de configuración, o `null` si todo está bien. Se evalúa en el arranque
 * para que `AuthProvider` pueda mostrar un mensaje legible en vez de dejar
 * que reviente el módulo al importar.
 */
export const configError: AppError | null =
  supabaseUrl && supabasePublishableKey
    ? null
    : missingEnvMessage(
        [
          ...(supabaseUrl ? [] : ['EXPO_PUBLIC_SUPABASE_URL']),
          ...(supabasePublishableKey ? [] : ['EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY']),
        ],
      )

if (configError) {
  logTechnical('supabase/config', configError)
}

/**
 * `null` cuando falta configuración. Los servicios comprueban
 * `assertSupabaseConfigured()` antes de tocar la BD, de modo que el
 * error que ve el usuario sea el mensaje de arriba y no un
 * "Cannot read property 'from' of null".
 */
export const supabase: SupabaseClient<Database> | null =
  configError === null
    ? createClient<Database>(supabaseUrl, supabasePublishableKey, {
        auth: {
          storage: AsyncStorage,
          autoRefreshToken: true,
          persistSession: true,
          detectSessionInUrl: false,
        },
      })
    : null

/** Lanza el error de configuración si falta algo. Usar en servicios. */
export function assertSupabaseConfigured(): SupabaseClient<Database> {
  if (!supabase) {
    throw configError ?? new AppError('Supabase no está configurado correctamente.')
  }
  return supabase
}

// ---------------------------------------------------------------------------
// Renovación del token al volver a primer plano
// ---------------------------------------------------------------------------
// El SDK refresca solo cada ~1 min, pero cuando la app estuvo en background
// el refresh puede no ejecutarse. Se llama `getClaims()` al volver al frente
// para forzar la validación del JWT local.
//
// El listener se registra UNA vez a nivel de módulo (fuera de cualquier
// componente): si se creara dentro de un useEffect sin limpiar, cada render
// añadiría otro listener.

if (supabase && typeof AppState.addEventListener === 'function') {
  AppState.addEventListener('change', (nextState) => {
    if (nextState === 'active') {
      supabase.auth.getClaims().catch((error: unknown) => {
        logTechnical('supabase/appstate', error)
      })
    }
  })
}

/** Cierra el cliente. Sólo para tests; en la app vive toda la sesión. */
export async function disposeSupabase(): Promise<void> {
  await supabase?.removeAllChannels()
}