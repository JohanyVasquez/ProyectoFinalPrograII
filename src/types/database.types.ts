/**
 * Tipos de la base de datos Supabase de ParkEasy.
 *
 * REFLECTE EXACTAMENTE `supabase/migrations/001_initial_schema.sql`.
 * Si cambias una tabla, regenera este archivo (ver docs/DATABASE.md):
 *
 *   npx supabase gen types typescript \
 *     --project-id <TU_PROJECT_REF> \
 *     --schema public \
 *     > src/types/database.types.ts
 *
 * Hasta que exista credenciales de un proyecto real, este archivo está
 * escrito a mano y es la referencia para los servicios.
 */

/** Marca una columna que acepta `DEFAULT` en la base de datos. */
export type Generated<T> = T

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

/** `public.app_role` — OJO: en el SQL el enum se llama `app_role`, no `user_role`. */
export type UserRole = 'user' | 'operator' | 'admin'
/** `public.space_status` */
export type SpaceStatus = 'available' | 'occupied' | 'maintenance'
/** `public.parking_session_status` — OJO: no se llama `session_status`. */
export type SessionStatus = 'active' | 'completed'
/** `public.reminder_status` */
export type ReminderStatus = 'pending' | 'cancelled' | 'sent'

type Tables = {
  profiles: {
    Row: {
      id: string
      full_name: string
      phone: string | null
      avatar_url: string | null
      created_at: Generated<string>
      updated_at: Generated<string>
    }
    Insert: {
      /** Lo fija el trigger `private.create_user_profile`; no lo envíes. */
      id: string
      /** `default ''` en SQL, CHECK `char_length <= 120`. */
      full_name: string
      /** CHECK `char_length <= 25`. */
      phone?: string | null
      avatar_url?: string | null
      created_at?: Generated<string>
      updated_at?: Generated<string>
    }
    Update: {
      /** RLS + trigger impiden cambiar `id`. */
      id?: never
      full_name?: string
      phone?: string | null
      avatar_url?: string | null
      created_at?: never
      updated_at?: never
    }
    Relationships: [
      {
        foreignKeyName: 'profiles_id_fkey'
        columns: ['id']
        isOneToOne: true
        referencedRelation: 'users'
        referencedColumns: ['id']
      },
    ]
  }

  user_roles: {
    Row: {
      user_id: string
      /** Enum de Postgres: `public.app_role`. */
      role: Generated<UserRole>
      assigned_at: Generated<string>
    }
    Insert: {
      user_id: string
      role?: Generated<UserRole>
      assigned_at?: Generated<string>
    }
    Update: {
      /**
       * Sólo un DBA vía SQL Editor puede promover a admin/operator.
       * El cliente no tiene política de escritura: esto no funciona desde la app.
       */
      role?: never
      assigned_at?: never
    }
    Relationships: [
      {
        foreignKeyName: 'user_roles_user_id_fkey'
        columns: ['user_id']
        isOneToOne: true
        referencedRelation: 'users'
        referencedColumns: ['id']
      },
    ]
  }

  parking_locations: {
    Row: {
      id: Generated<string>
      name: string
      address: string
      description: string | null
      latitude: number | null
      longitude: number | null
      is_active: Generated<boolean>
      created_by: string | null
      created_at: Generated<string>
      updated_at: Generated<string>
    }
    Insert: {
      id?: Generated<string>
      /** CHECK `char_length(btrim(name)) between 1 and 120`. */
      name: string
      /** `default ''` en SQL: no tiene CHECK de longitud. */
      address: string
      description?: string | null
      latitude?: number | null
      longitude?: number | null
      is_active?: Generated<boolean>
      /**
       * RLS `locations_insert_admin` exige `created_by = auth.uid()`:
       * mandar otro id da 42501.
       */
      created_by?: string | null
      created_at?: Generated<string>
      updated_at?: Generated<string>
    }
    Update: {
      id?: never
      name?: string
      address?: string
      description?: string | null
      latitude?: number | null
      longitude?: number | null
      is_active?: boolean
      created_by?: never
      created_at?: never
      updated_at?: never
    }
    Relationships: [
      {
        foreignKeyName: 'parking_locations_created_by_fkey'
        columns: ['created_by']
        isOneToOne: false
        referencedRelation: 'users'
        referencedColumns: ['id']
      },
    ]
  }

  parking_spaces: {
    Row: {
      id: Generated<string>
      location_id: string
      code: string
      floor_label: string | null
      description: string | null
      status: Generated<SpaceStatus>
      is_active: Generated<boolean>
      status_updated_at: Generated<string>
      status_updated_by: string | null
      created_at: Generated<string>
      updated_at: Generated<string>
    }
    Insert: {
      id?: Generated<string>
      location_id: string
      /** CHECK `char_length(btrim(code)) between 1 and 30`. */
      code: string
      floor_label?: string | null
      description?: string | null
      status?: Generated<SpaceStatus>
      is_active?: Generated<boolean>
      /**
       * Los rellena el trigger `private.guard_space_update`.
       * Además, en UPDATE el trigger RESTAURA los valores antiguos si
       * `status` no cambió: no se puede reescribir la auditoría.
       */
      status_updated_at?: never
      status_updated_by?: never
      created_at?: Generated<string>
      updated_at?: Generated<string>
    }
    Update: {
      id?: never
      location_id?: string
      code?: string
      floor_label?: string | null
      description?: string | null
      /** Sólo `operator`/`admin`; el resto de columnas, sólo `admin`. */
      status?: SpaceStatus
      is_active?: boolean
      status_updated_at?: never
      status_updated_by?: never
      created_at?: never
      updated_at?: never
    }
    Relationships: [
      {
        foreignKeyName: 'parking_spaces_location_id_fkey'
        columns: ['location_id']
        isOneToOne: false
        referencedRelation: 'parking_locations'
        referencedColumns: ['id']
      },
      {
        foreignKeyName: 'parking_spaces_status_updated_by_fkey'
        columns: ['status_updated_by']
        isOneToOne: false
        referencedRelation: 'users'
        referencedColumns: ['id']
      },
    ]
  }

  parking_sessions: {
    Row: {
      id: Generated<string>
      user_id: string
      location_id: string | null
      space_id: string | null
      latitude: number
      longitude: number
      accuracy_m: number | null
      note: string | null
      status: Generated<SessionStatus>
      parked_at: Generated<string>
      ended_at: string | null
      created_at: Generated<string>
      updated_at: Generated<string>
    }
    Insert: {
      id?: Generated<string>
      /**
       * `default auth.uid()` en SQL, y RLS exige `user_id = auth.uid()`.
       * El trigger `private.guard_session_owner` impide después cambiarlo.
       */
      user_id: string
      location_id?: string | null
      /**
       * FK compuesta `(space_id, location_id)` →
       * `parking_spaces(id, location_id)` con `on delete no action`.
       * Si usas `space_id`, `location_id` es obligatorio y debe coincidir.
       */
      space_id?: string | null
      latitude: number
      longitude: number
      accuracy_m?: number | null
      /** CHECK `char_length <= 1000`. */
      note?: string | null
      status?: Generated<SessionStatus>
      parked_at?: Generated<string>
      /** Déjalo en null al crear: el CHECK exige ended_at = null si status='active'. */
      ended_at?: never
      created_at?: Generated<string>
      updated_at?: Generated<string>
    }
    Update: {
      id?: never
      /** El trigger `private.guard_session_owner` rechaza cambiarlo. */
      user_id?: never
      location_id?: string | null
      space_id?: string | null
      latitude?: number
      longitude?: number
      accuracy_m?: number | null
      note?: string | null
      status?: SessionStatus
      parked_at?: string
      ended_at?: string | null
      created_at?: never
      updated_at?: never
    }
    Relationships: [
      {
        foreignKeyName: 'parking_sessions_location_id_fkey'
        columns: ['location_id']
        isOneToOne: false
        referencedRelation: 'parking_locations'
        referencedColumns: ['id']
      },
      {
        foreignKeyName: 'parking_sessions_session_space_fkey'
        columns: ['space_id', 'location_id']
        isOneToOne: false
        referencedRelation: 'parking_spaces'
        referencedColumns: ['id', 'location_id']
      },
      {
        foreignKeyName: 'parking_sessions_user_id_fkey'
        columns: ['user_id']
        isOneToOne: false
        referencedRelation: 'users'
        referencedColumns: ['id']
      },
    ]
  }

  parking_reminders: {
    Row: {
      id: Generated<string>
      user_id: string
      session_id: string
      title: string
      message: string | null
      remind_at: string
      status: Generated<ReminderStatus>
      created_at: Generated<string>
      updated_at: Generated<string>
    }
    Insert: {
      id?: Generated<string>
      /**
       * `default auth.uid()` en SQL. El trigger
       * `private.validate_reminder_owner` exige que `session_id` sea una
       * sesión del mismo `user_id`.
       */
      user_id: string
      session_id: string
      /** CHECK `char_length(btrim(title)) between 1 and 120`. */
      title: string
      message?: string | null
      remind_at: string
      status?: Generated<ReminderStatus>
      created_at?: Generated<string>
      updated_at?: Generated<string>
    }
    Update: {
      id?: never
      user_id?: never
      session_id?: string
      title?: string
      message?: string | null
      remind_at?: string
      /** Marcar 'sent' en la BD NO envía ninguna notificación. */
      status?: ReminderStatus
      created_at?: never
      updated_at?: never
    }
    Relationships: [
      {
        foreignKeyName: 'parking_reminders_session_id_fkey'
        columns: ['session_id']
        isOneToOne: false
        referencedRelation: 'parking_sessions'
        referencedColumns: ['id']
      },
      {
        foreignKeyName: 'parking_reminders_user_id_fkey'
        columns: ['user_id']
        isOneToOne: false
        referencedRelation: 'users'
        referencedColumns: ['id']
      },
    ]
  }
}

export type Database = {
  public: {
    Tables: Tables
    Views: { [_ in never]: never }
    Functions: {
      /**
       * `private.is_admin()` / `private.is_staff()` existen en la base de datos
       * pero viven en el schema `private`, que NO está expuesto en la API.
       * Intentar llamarlas por RPC falla: es intencionado.
       */
      [_ in never]: never
    }
    Enums: {
      app_role: UserRole
      space_status: SpaceStatus
      parking_session_status: SessionStatus
      reminder_status: ReminderStatus
    }
    CompositeTypes: { [_ in never]: never }
  }
}

/** Alias de una tabla concreta: `ProfileRow`, `ParkingSpaceRow`, ... */
export type TableRow<T extends keyof Tables> = Tables[T]['Row']
export type TableInsert<T extends keyof Tables> = Tables[T]['Insert']
export type TableUpdate<T extends keyof Tables> = Tables[T]['Update']

/** Unión de las claves reales de `public`. Evita inventar nombres de tabla. */
export type TableName = keyof Tables

/** `'profiles' | 'user_roles' | ...` — útil para helpers genéricos. */
export const TABLE_NAMES = [
  'profiles',
  'user_roles',
  'parking_locations',
  'parking_spaces',
  'parking_sessions',
  'parking_reminders',
] as const satisfies readonly TableName[]