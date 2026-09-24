// Dihasilkan oleh `pnpm --filter @tetra/db types`. Jangan edit manual.
export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  public: {
    Tables: {
      analytics_events: {
        Row: {
          created_at: string
          event_id: string
          id: number
          meta: Json | null
          organization_id: string
          session_id: string | null
          type: string
        }
        Insert: {
          created_at?: string
          event_id: string
          id?: never
          meta?: Json | null
          organization_id: string
          session_id?: string | null
          type: string
        }
        Update: {
          created_at?: string
          event_id?: string
          id?: never
          meta?: Json | null
          organization_id?: string
          session_id?: string | null
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "analytics_events_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "analytics_events_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      assets: {
        Row: {
          bytes: number | null
          created_at: string
          height: number | null
          id: string
          idx: number
          kind: string
          organization_id: string
          r2_key: string
          session_id: string
          width: number | null
        }
        Insert: {
          bytes?: number | null
          created_at?: string
          height?: number | null
          id?: string
          idx?: number
          kind: string
          organization_id: string
          r2_key: string
          session_id: string
          width?: number | null
        }
        Update: {
          bytes?: number | null
          created_at?: string
          height?: number | null
          id?: string
          idx?: number
          kind?: string
          organization_id?: string
          r2_key?: string
          session_id?: string
          width?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "assets_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assets_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_logs: {
        Row: {
          action: string
          actor_user_id: string | null
          created_at: string
          id: number
          meta: Json | null
          organization_id: string
          target: string
        }
        Insert: {
          action: string
          actor_user_id?: string | null
          created_at?: string
          id?: never
          meta?: Json | null
          organization_id: string
          target: string
        }
        Update: {
          action?: string
          actor_user_id?: string | null
          created_at?: string
          id?: never
          meta?: Json | null
          organization_id?: string
          target?: string
        }
        Relationships: [
          {
            foreignKeyName: "audit_logs_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      devices: {
        Row: {
          app_version: string | null
          created_at: string
          id: string
          last_seen_at: string | null
          name: string
          organization_id: string
          pairing_code: string | null
          pairing_expires_at: string | null
          revoked_at: string | null
          screen_height: number | null
          screen_width: number | null
          short_code: string
          status: NonNullable<Json>
          token_hash: string | null
        }
        Insert: {
          app_version?: string | null
          created_at?: string
          id?: string
          last_seen_at?: string | null
          name: string
          organization_id: string
          pairing_code?: string | null
          pairing_expires_at?: string | null
          revoked_at?: string | null
          screen_height?: number | null
          screen_width?: number | null
          short_code: string
          status?: NonNullable<Json>
          token_hash?: string | null
        }
        Update: {
          app_version?: string | null
          created_at?: string
          id?: string
          last_seen_at?: string | null
          name?: string
          organization_id?: string
          pairing_code?: string | null
          pairing_expires_at?: string | null
          revoked_at?: string | null
          screen_height?: number | null
          screen_width?: number | null
          short_code?: string
          status?: NonNullable<Json>
          token_hash?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "devices_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      event_devices: {
        Row: {
          device_id: string
          event_id: string
          organization_id: string
        }
        Insert: {
          device_id: string
          event_id: string
          organization_id: string
        }
        Update: {
          device_id?: string
          event_id?: string
          organization_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "event_devices_device_id_fkey"
            columns: ["device_id"]
            isOneToOne: false
            referencedRelation: "devices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_devices_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_devices_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      event_layouts: {
        Row: {
          event_id: string
          extra_print_price_idr: number | null
          id: string
          layout_version_id: string
          organization_id: string
          price_idr: number | null
          sort: number
        }
        Insert: {
          event_id: string
          extra_print_price_idr?: number | null
          id?: string
          layout_version_id: string
          organization_id: string
          price_idr?: number | null
          sort?: number
        }
        Update: {
          event_id?: string
          extra_print_price_idr?: number | null
          id?: string
          layout_version_id?: string
          organization_id?: string
          price_idr?: number | null
          sort?: number
        }
        Relationships: [
          {
            foreignKeyName: "event_layouts_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_layouts_layout_version_id_fkey"
            columns: ["layout_version_id"]
            isOneToOne: false
            referencedRelation: "layout_versions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_layouts_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      events: {
        Row: {
          branding: NonNullable<Json>
          bundle_version: number
          client_expires_at: string | null
          client_token: string | null
          created_at: string
          created_by: string | null
          event_date: string
          guest_expires_at: string | null
          id: string
          lead_capture: NonNullable<Json>
          live_token: string | null
          location: string | null
          mode: string
          name: string
          organization_id: string
          orientation: string
          public_gallery: boolean
          purge_at: string | null
          purged_at: string | null
          settings: NonNullable<Json>
          status: string
          updated_at: string
        }
        Insert: {
          branding?: NonNullable<Json>
          bundle_version?: number
          client_expires_at?: string | null
          client_token?: string | null
          created_at?: string
          created_by?: string | null
          event_date: string
          guest_expires_at?: string | null
          id?: string
          lead_capture?: NonNullable<Json>
          live_token?: string | null
          location?: string | null
          mode: string
          name: string
          organization_id: string
          orientation?: string
          public_gallery?: boolean
          purge_at?: string | null
          purged_at?: string | null
          settings?: NonNullable<Json>
          status?: string
          updated_at?: string
        }
        Update: {
          branding?: NonNullable<Json>
          bundle_version?: number
          client_expires_at?: string | null
          client_token?: string | null
          created_at?: string
          created_by?: string | null
          event_date?: string
          guest_expires_at?: string | null
          id?: string
          lead_capture?: NonNullable<Json>
          live_token?: string | null
          location?: string | null
          mode?: string
          name?: string
          organization_id?: string
          orientation?: string
          public_gallery?: boolean
          purge_at?: string | null
          purged_at?: string | null
          settings?: NonNullable<Json>
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "events_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      favorites: {
        Row: {
          asset_id: string
          created_at: string
          event_id: string
          organization_id: string
        }
        Insert: {
          asset_id: string
          created_at?: string
          event_id: string
          organization_id: string
        }
        Update: {
          asset_id?: string
          created_at?: string
          event_id?: string
          organization_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "favorites_asset_id_fkey"
            columns: ["asset_id"]
            isOneToOne: false
            referencedRelation: "assets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "favorites_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "favorites_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      layout_versions: {
        Row: {
          created_at: string
          id: string
          layout_id: string
          organization_id: string
          preview_key: string | null
          spec: NonNullable<Json>
          version: number
        }
        Insert: {
          created_at?: string
          id?: string
          layout_id: string
          organization_id: string
          preview_key?: string | null
          spec: NonNullable<Json>
          version: number
        }
        Update: {
          created_at?: string
          id?: string
          layout_id?: string
          organization_id?: string
          preview_key?: string | null
          spec?: NonNullable<Json>
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "layout_versions_layout_id_fkey"
            columns: ["layout_id"]
            isOneToOne: false
            referencedRelation: "layouts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "layout_versions_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      layouts: {
        Row: {
          archived_at: string | null
          created_at: string
          id: string
          name: string
          organization_id: string
          paper: string
        }
        Insert: {
          archived_at?: string | null
          created_at?: string
          id?: string
          name: string
          organization_id: string
          paper: string
        }
        Update: {
          archived_at?: string | null
          created_at?: string
          id?: string
          name?: string
          organization_id?: string
          paper?: string
        }
        Relationships: [
          {
            foreignKeyName: "layouts_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      leads: {
        Row: {
          consent_at: string
          consent_version: string
          created_at: string
          data: NonNullable<Json>
          event_id: string
          id: string
          organization_id: string
          session_id: string | null
        }
        Insert: {
          consent_at: string
          consent_version: string
          created_at?: string
          data: NonNullable<Json>
          event_id: string
          id?: string
          organization_id: string
          session_id?: string | null
        }
        Update: {
          consent_at?: string
          consent_version?: string
          created_at?: string
          data?: NonNullable<Json>
          event_id?: string
          id?: string
          organization_id?: string
          session_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "leads_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leads_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leads_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      members: {
        Row: {
          active: boolean
          created_at: string
          crew_pin_hash: string | null
          id: string
          organization_id: string
          role: string
          user_id: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          crew_pin_hash?: string | null
          id?: string
          organization_id: string
          role: string
          user_id: string
        }
        Update: {
          active?: boolean
          created_at?: string
          crew_pin_hash?: string | null
          id?: string
          organization_id?: string
          role?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "members_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      organizations: {
        Row: {
          created_at: string
          id: string
          name: string
          slug: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          slug: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          slug?: string
        }
        Relationships: []
      }
      payments: {
        Row: {
          amount_idr: number
          created_at: string
          device_id: string
          event_id: string
          event_layout_id: string
          expires_at: string
          id: string
          organization_id: string
          paid_at: string | null
          prints: number
          provider: string
          provider_ref: string | null
          qr_string: string | null
          raw: Json | null
          status: string
        }
        Insert: {
          amount_idr: number
          created_at?: string
          device_id: string
          event_id: string
          event_layout_id: string
          expires_at: string
          id?: string
          organization_id: string
          paid_at?: string | null
          prints: number
          provider?: string
          provider_ref?: string | null
          qr_string?: string | null
          raw?: Json | null
          status: string
        }
        Update: {
          amount_idr?: number
          created_at?: string
          device_id?: string
          event_id?: string
          event_layout_id?: string
          expires_at?: string
          id?: string
          organization_id?: string
          paid_at?: string | null
          prints?: number
          provider?: string
          provider_ref?: string | null
          qr_string?: string | null
          raw?: Json | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "payments_device_id_fkey"
            columns: ["device_id"]
            isOneToOne: false
            referencedRelation: "devices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_event_layout_id_fkey"
            columns: ["event_layout_id"]
            isOneToOne: false
            referencedRelation: "event_layouts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      rate_limits: {
        Row: {
          hits: number
          key: string
          window_start: string
        }
        Insert: {
          hits: number
          key: string
          window_start: string
        }
        Update: {
          hits?: number
          key?: string
          window_start?: string
        }
        Relationships: []
      }
      sessions: {
        Row: {
          completed_at: string | null
          created_at: string
          deleted_at: string | null
          device_id: string
          event_id: string
          hidden_at: string | null
          id: string
          layout_version_id: string | null
          organization_id: string
          payment_id: string | null
          photo_count: number
          print_count: number
          retake_count: number
          started_at: string
          upload_status: string
        }
        Insert: {
          completed_at?: string | null
          created_at?: string
          deleted_at?: string | null
          device_id: string
          event_id: string
          hidden_at?: string | null
          id: string
          layout_version_id?: string | null
          organization_id: string
          payment_id?: string | null
          photo_count?: number
          print_count?: number
          retake_count?: number
          started_at: string
          upload_status?: string
        }
        Update: {
          completed_at?: string | null
          created_at?: string
          deleted_at?: string | null
          device_id?: string
          event_id?: string
          hidden_at?: string | null
          id?: string
          layout_version_id?: string | null
          organization_id?: string
          payment_id?: string | null
          photo_count?: number
          print_count?: number
          retake_count?: number
          started_at?: string
          upload_status?: string
        }
        Relationships: [
          {
            foreignKeyName: "sessions_device_id_fkey"
            columns: ["device_id"]
            isOneToOne: false
            referencedRelation: "devices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sessions_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sessions_layout_version_id_fkey"
            columns: ["layout_version_id"]
            isOneToOne: false
            referencedRelation: "layout_versions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sessions_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sessions_payment_id_fkey"
            columns: ["payment_id"]
            isOneToOne: false
            referencedRelation: "payments"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      is_member: { Args: { org: string; roles?: string[] }; Returns: boolean }
      rate_hit: {
        Args: { k: string; max_hits: number; window_s: number }
        Returns: boolean
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const
