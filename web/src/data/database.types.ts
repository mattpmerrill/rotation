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
      admin_actions: {
        Row: {
          action: string
          actor: string
          at: string
          id: number
          target: string
        }
        Insert: {
          action: string
          actor: string
          at?: string
          id?: never
          target: string
        }
        Update: {
          action?: string
          actor?: string
          at?: string
          id?: never
          target?: string
        }
        Relationships: []
      }
      btc_onchain: {
        Row: {
          date: string
          market_cap_usd: number | null
          mvrv: number | null
          realized_cap_usd: number | null
        }
        Insert: {
          date: string
          market_cap_usd?: number | null
          mvrv?: number | null
          realized_cap_usd?: number | null
        }
        Update: {
          date?: string
          market_cap_usd?: number | null
          mvrv?: number | null
          realized_cap_usd?: number | null
        }
        Relationships: []
      }
      challenges: {
        Row: {
          closed_on: string | null
          created_at: string
          id: number
          name: string
          opened_on: string
        }
        Insert: {
          closed_on?: string | null
          created_at?: string
          id?: never
          name: string
          opened_on?: string
        }
        Update: {
          closed_on?: string | null
          created_at?: string
          id?: never
          name?: string
          opened_on?: string
        }
        Relationships: []
      }
      coins: {
        Row: {
          categories: string[]
          id: string
          image_url: string | null
          is_excluded: boolean
          is_meme: boolean
          name: string
          symbol: string
          updated_at: string
        }
        Insert: {
          categories?: string[]
          id: string
          image_url?: string | null
          is_excluded?: boolean
          is_meme?: boolean
          name: string
          symbol: string
          updated_at?: string
        }
        Update: {
          categories?: string[]
          id?: string
          image_url?: string | null
          is_excluded?: boolean
          is_meme?: boolean
          name?: string
          symbol?: string
          updated_at?: string
        }
        Relationships: []
      }
      config_versions: {
        Row: {
          created_at: string
          hash: string
          rules: Json
          universe: Json
          version: number
        }
        Insert: {
          created_at?: string
          hash: string
          rules: Json
          universe: Json
          version: number
        }
        Update: {
          created_at?: string
          hash?: string
          rules?: Json
          universe?: Json
          version?: number
        }
        Relationships: []
      }
      daily_prices: {
        Row: {
          close: number
          coin_id: string
          date: string
          high: number | null
          low: number | null
          market_cap_usd: number | null
          open: number | null
          rank: number | null
          source: string
          volume_usd: number | null
        }
        Insert: {
          close: number
          coin_id: string
          date: string
          high?: number | null
          low?: number | null
          market_cap_usd?: number | null
          open?: number | null
          rank?: number | null
          source: string
          volume_usd?: number | null
        }
        Update: {
          close?: number
          coin_id?: string
          date?: string
          high?: number | null
          low?: number | null
          market_cap_usd?: number | null
          open?: number | null
          rank?: number | null
          source?: string
          volume_usd?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "daily_prices_coin_id_fkey"
            columns: ["coin_id"]
            isOneToOne: false
            referencedRelation: "coins"
            referencedColumns: ["id"]
          },
        ]
      }
      derivatives_daily: {
        Row: {
          coin_id: string
          date: string
          funding_8h: number | null
          oi_usd: number | null
          source: string
        }
        Insert: {
          coin_id: string
          date: string
          funding_8h?: number | null
          oi_usd?: number | null
          source: string
        }
        Update: {
          coin_id?: string
          date?: string
          funding_8h?: number | null
          oi_usd?: number | null
          source?: string
        }
        Relationships: [
          {
            foreignKeyName: "derivatives_daily_coin_id_fkey"
            columns: ["coin_id"]
            isOneToOne: false
            referencedRelation: "coins"
            referencedColumns: ["id"]
          },
        ]
      }
      entries: {
        Row: {
          basket: string[]
          btc_in: number
          challenge_id: number
          created_at: string
          id: number
          open_slots: number
          started_on: string
          user_id: string
        }
        Insert: {
          basket: string[]
          btc_in: number
          challenge_id: number
          created_at?: string
          id?: never
          open_slots?: number
          started_on: string
          user_id?: string
        }
        Update: {
          basket?: string[]
          btc_in?: number
          challenge_id?: number
          created_at?: string
          id?: never
          open_slots?: number
          started_on?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "entries_challenge_id_fkey"
            columns: ["challenge_id"]
            isOneToOne: false
            referencedRelation: "challenges"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "entries_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      entry_trades: {
        Row: {
          asset: string
          created_at: string
          entry_id: number
          fee_usd: number
          id: number
          kind: string
          note: string | null
          price_usd: number
          qty: number
          side: string
          traded_on: string
        }
        Insert: {
          asset: string
          created_at?: string
          entry_id: number
          fee_usd?: number
          id?: never
          kind: string
          note?: string | null
          price_usd: number
          qty: number
          side: string
          traded_on: string
        }
        Update: {
          asset?: string
          created_at?: string
          entry_id?: number
          fee_usd?: number
          id?: never
          kind?: string
          note?: string | null
          price_usd?: number
          qty?: number
          side?: string
          traded_on?: string
        }
        Relationships: [
          {
            foreignKeyName: "entry_trades_asset_fkey"
            columns: ["asset"]
            isOneToOne: false
            referencedRelation: "coins"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "entry_trades_entry_id_fkey"
            columns: ["entry_id"]
            isOneToOne: false
            referencedRelation: "entries"
            referencedColumns: ["id"]
          },
        ]
      }
      exchange_symbols: {
        Row: {
          coin_id: string
          exchange: string
          symbol: string
          valid_from: string
          valid_to: string | null
        }
        Insert: {
          coin_id: string
          exchange: string
          symbol: string
          valid_from: string
          valid_to?: string | null
        }
        Update: {
          coin_id?: string
          exchange?: string
          symbol?: string
          valid_from?: string
          valid_to?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "exchange_symbols_coin_id_fkey"
            columns: ["coin_id"]
            isOneToOne: false
            referencedRelation: "coins"
            referencedColumns: ["id"]
          },
        ]
      }
      market_state: {
        Row: {
          ath: number
          ath_date: string
          btc_price: number
          config_hash: string
          created_at: string
          day: string
          days_since_ath: number
          days_since_halving: number
          drawdown: number
          mvrv: number | null
          rebuy_window_open: boolean
        }
        Insert: {
          ath: number
          ath_date: string
          btc_price: number
          config_hash: string
          created_at?: string
          day: string
          days_since_ath: number
          days_since_halving: number
          drawdown: number
          mvrv?: number | null
          rebuy_window_open: boolean
        }
        Update: {
          ath?: number
          ath_date?: string
          btc_price?: number
          config_hash?: string
          created_at?: string
          day?: string
          days_since_ath?: number
          days_since_halving?: number
          drawdown?: number
          mvrv?: number | null
          rebuy_window_open?: boolean
        }
        Relationships: []
      }
      notifications: {
        Row: {
          key: string
          sent_at: string
        }
        Insert: {
          key: string
          sent_at?: string
        }
        Update: {
          key?: string
          sent_at?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          created_at: string
          display_name: string | null
          id: string
          is_admin: boolean
          is_member: boolean
        }
        Insert: {
          created_at?: string
          display_name?: string | null
          id: string
          is_admin?: boolean
          is_member?: boolean
        }
        Update: {
          created_at?: string
          display_name?: string | null
          id?: string
          is_admin?: boolean
          is_member?: boolean
        }
        Relationships: []
      }
    }
    Views: {
      entry_balances: {
        Row: {
          asset: string | null
          entry_id: number | null
          qty: number | null
        }
        Relationships: []
      }
    }
    Functions: {
      admin_list_people: {
        Args: never
        Returns: {
          created_at: string
          display_name: string
          email: string
          id: string
          is_admin: boolean
          is_member: boolean
          provider: string
        }[]
      }
      admin_record_help_link: { Args: { p_target: string }; Returns: undefined }
      admin_reject_signup: { Args: { p_user_id: string }; Returns: undefined }
      admin_set_member: {
        Args: { p_is_member: boolean; p_user_id: string }
        Returns: undefined
      }
      delete_entry: { Args: { p_entry_id: number }; Returns: undefined }
      edit_entry: {
        Args: {
          p_basket: string[]
          p_btc_in: number
          p_entry_id: number
          p_slots: number
          p_started_on: string
          p_trades: Json
        }
        Returns: undefined
      }
      fill_slot: {
        Args: {
          p_coin: string
          p_entry_id: number
          p_traded_on: string
          p_trades: Json
        }
        Returns: undefined
      }
      is_admin: { Args: never; Returns: boolean }
      is_member: { Args: never; Returns: boolean }
      price_series: {
        Args: { p_coins: string[]; p_from: string }
        Returns: {
          closes: number[]
          coin_id: string
          dates: string[]
        }[]
      }
      start_entry: {
        Args: {
          p_basket: string[]
          p_btc_in: number
          p_slots: number
          p_started_on: string
          p_trades: Json
        }
        Returns: number
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
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
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
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
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
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

