export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      addon_library: {
        Row: {
          created_at: string | null
          display_order: number
          id: string
          image_url: string | null
          is_active: boolean
          name: string
          price: number
          source_menu_item_id: string | null
          tenant_id: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          display_order?: number
          id?: string
          image_url?: string | null
          is_active?: boolean
          name: string
          price?: number
          source_menu_item_id?: string | null
          tenant_id: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          display_order?: number
          id?: string
          image_url?: string | null
          is_active?: boolean
          name?: string
          price?: number
          source_menu_item_id?: string | null
          tenant_id?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "addon_library_source_menu_item_id_fkey"
            columns: ["source_menu_item_id"]
            isOneToOne: false
            referencedRelation: "menu_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "addon_library_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      analytics_events: {
        Row: {
          created_at: string
          id: string
          metadata: Json
          session_id: string | null
          tenant_id: string
          type: string
        }
        Insert: {
          created_at?: string
          id?: string
          metadata?: Json
          session_id?: string | null
          tenant_id: string
          type: string
        }
        Update: {
          created_at?: string
          id?: string
          metadata?: Json
          session_id?: string | null
          tenant_id?: string
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "analytics_events_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      app_signup_requests: {
        Row: {
          business_name: string
          business_type: string | null
          contact_name: string
          created_at: string
          email: string
          id: string
          message: string | null
          phone: string | null
          source: string
          status: string
        }
        Insert: {
          business_name: string
          business_type?: string | null
          contact_name: string
          created_at?: string
          email: string
          id?: string
          message?: string | null
          phone?: string | null
          source?: string
          status?: string
        }
        Update: {
          business_name?: string
          business_type?: string | null
          contact_name?: string
          created_at?: string
          email?: string
          id?: string
          message?: string | null
          phone?: string | null
          source?: string
          status?: string
        }
        Relationships: []
      }
      app_users: {
        Row: {
          created_at: string
          display_name: string | null
          email: string | null
          is_owner: boolean
          outlet_id: string | null
          permissions: string[] | null
          role: string
          tenant_id: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          display_name?: string | null
          email?: string | null
          is_owner?: boolean
          outlet_id?: string | null
          permissions?: string[] | null
          role: string
          tenant_id?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          display_name?: string | null
          email?: string | null
          is_owner?: boolean
          outlet_id?: string | null
          permissions?: string[] | null
          role?: string
          tenant_id?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "app_users_outlet_id_fkey"
            columns: ["outlet_id"]
            isOneToOne: false
            referencedRelation: "outlets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "app_users_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      bundle_slot_price_overrides: {
        Row: {
          created_at: string
          id: string
          menu_item_id: string
          price_override: number
          slot_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          menu_item_id: string
          price_override: number
          slot_id: string
        }
        Update: {
          created_at?: string
          id?: string
          menu_item_id?: string
          price_override?: number
          slot_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "bundle_slot_price_overrides_menu_item_id_fkey"
            columns: ["menu_item_id"]
            isOneToOne: false
            referencedRelation: "menu_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bundle_slot_price_overrides_slot_id_fkey"
            columns: ["slot_id"]
            isOneToOne: false
            referencedRelation: "bundle_slots"
            referencedColumns: ["id"]
          },
        ]
      }
      bundle_slots: {
        Row: {
          bundle_id: string
          category_id: string
          created_at: string
          id: string
          included_item_ids: string[] | null
          name: string
          pick_count: number
          sort_order: number
        }
        Insert: {
          bundle_id: string
          category_id: string
          created_at?: string
          id?: string
          included_item_ids?: string[] | null
          name: string
          pick_count?: number
          sort_order?: number
        }
        Update: {
          bundle_id?: string
          category_id?: string
          created_at?: string
          id?: string
          included_item_ids?: string[] | null
          name?: string
          pick_count?: number
          sort_order?: number
        }
        Relationships: [
          {
            foreignKeyName: "bundle_slots_bundle_id_fkey"
            columns: ["bundle_id"]
            isOneToOne: false
            referencedRelation: "bundles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bundle_slots_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
        ]
      }
      bundles: {
        Row: {
          created_at: string | null
          description: string | null
          discount_percent: number | null
          display_order: number | null
          fixed_price: number | null
          id: string
          image_url: string | null
          is_active: boolean | null
          name: string
          pricing_type: string
          show_as_upsell: boolean | null
          show_on_menu: boolean | null
          tenant_id: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          description?: string | null
          discount_percent?: number | null
          display_order?: number | null
          fixed_price?: number | null
          id?: string
          image_url?: string | null
          is_active?: boolean | null
          name: string
          pricing_type?: string
          show_as_upsell?: boolean | null
          show_on_menu?: boolean | null
          tenant_id: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          description?: string | null
          discount_percent?: number | null
          display_order?: number | null
          fixed_price?: number | null
          id?: string
          image_url?: string | null
          is_active?: boolean | null
          name?: string
          pricing_type?: string
          show_as_upsell?: boolean | null
          show_on_menu?: boolean | null
          tenant_id?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "bundles_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      categories: {
        Row: {
          created_at: string
          default_addons: Json | null
          description: string | null
          display_layout: string | null
          icon: string | null
          icon_color: string | null
          id: string
          is_active: boolean
          name: string
          order: number
          tenant_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          default_addons?: Json | null
          description?: string | null
          display_layout?: string | null
          icon?: string | null
          icon_color?: string | null
          id?: string
          is_active?: boolean
          name: string
          order?: number
          tenant_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          default_addons?: Json | null
          description?: string | null
          display_layout?: string | null
          icon?: string | null
          icon_color?: string | null
          id?: string
          is_active?: boolean
          name?: string
          order?: number
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "categories_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      checkout_leads: {
        Row: {
          amount: number
          business_name: string
          created_at: string
          email: string
          id: string
          name: string
          notes: string | null
          payment_proof_uploaded_at: string | null
          payment_proof_url: string | null
          payment_term: string | null
          phone: string
          reference_number: string
          selected_payment_method_id: string | null
          status: string
          updated_at: string
        }
        Insert: {
          amount?: number
          business_name: string
          created_at?: string
          email: string
          id?: string
          name: string
          notes?: string | null
          payment_proof_uploaded_at?: string | null
          payment_proof_url?: string | null
          payment_term?: string | null
          phone: string
          reference_number: string
          selected_payment_method_id?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          amount?: number
          business_name?: string
          created_at?: string
          email?: string
          id?: string
          name?: string
          notes?: string | null
          payment_proof_uploaded_at?: string | null
          payment_proof_url?: string | null
          payment_term?: string | null
          phone?: string
          reference_number?: string
          selected_payment_method_id?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "checkout_leads_selected_payment_method_id_fkey"
            columns: ["selected_payment_method_id"]
            isOneToOne: false
            referencedRelation: "platform_payment_methods"
            referencedColumns: ["id"]
          },
        ]
      }
      complementary_pairs: {
        Row: {
          created_at: string | null
          display_order: number | null
          id: string
          is_active: boolean | null
          source_category_id: string | null
          source_item_id: string | null
          source_type: string
          target_item_id: string
          tenant_id: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          display_order?: number | null
          id?: string
          is_active?: boolean | null
          source_category_id?: string | null
          source_item_id?: string | null
          source_type: string
          target_item_id: string
          tenant_id: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          display_order?: number | null
          id?: string
          is_active?: boolean | null
          source_category_id?: string | null
          source_item_id?: string | null
          source_type?: string
          target_item_id?: string
          tenant_id?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "complementary_pairs_source_category_id_fkey"
            columns: ["source_category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "complementary_pairs_source_item_id_fkey"
            columns: ["source_item_id"]
            isOneToOne: false
            referencedRelation: "menu_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "complementary_pairs_target_item_id_fkey"
            columns: ["target_item_id"]
            isOneToOne: false
            referencedRelation: "menu_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "complementary_pairs_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      customer_external_orders: {
        Row: {
          backend: string
          channel: string | null
          created_at: string
          customer_id: string
          external_order_id: string
          id: string
          items: Json
          ordered_at: string
          sms_consent: boolean
          tenant_id: string
          total: number
          updated_at: string
        }
        Insert: {
          backend: string
          channel?: string | null
          created_at?: string
          customer_id: string
          external_order_id: string
          id?: string
          items?: Json
          ordered_at: string
          sms_consent?: boolean
          tenant_id: string
          total?: number
          updated_at?: string
        }
        Update: {
          backend?: string
          channel?: string | null
          created_at?: string
          customer_id?: string
          external_order_id?: string
          id?: string
          items?: Json
          ordered_at?: string
          sms_consent?: boolean
          tenant_id?: string
          total?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "customer_external_orders_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_external_orders_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      customer_form_fields: {
        Row: {
          created_at: string
          field_label: string
          field_name: string
          field_type: string
          id: string
          is_required: boolean
          options: Json | null
          order_index: number
          order_type_id: string
          placeholder: string | null
          tenant_id: string
          updated_at: string
          validation_rules: Json | null
        }
        Insert: {
          created_at?: string
          field_label: string
          field_name: string
          field_type: string
          id?: string
          is_required?: boolean
          options?: Json | null
          order_index?: number
          order_type_id: string
          placeholder?: string | null
          tenant_id: string
          updated_at?: string
          validation_rules?: Json | null
        }
        Update: {
          created_at?: string
          field_label?: string
          field_name?: string
          field_type?: string
          id?: string
          is_required?: boolean
          options?: Json | null
          order_index?: number
          order_type_id?: string
          placeholder?: string | null
          tenant_id?: string
          updated_at?: string
          validation_rules?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "customer_form_fields_order_type_id_fkey"
            columns: ["order_type_id"]
            isOneToOne: false
            referencedRelation: "order_types"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_form_fields_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      customers: {
        Row: {
          average_order_value: number | null
          channels_used: string[]
          created_at: string
          email: string | null
          first_order_at: string | null
          id: string
          last_order_at: string | null
          name: string | null
          order_count: number
          phone_e164: string | null
          sms_consent: boolean
          sms_consent_at: string | null
          sms_opt_out: boolean
          sms_opt_out_at: string | null
          tenant_id: string
          top_items: Json
          total_spent: number
          updated_at: string
        }
        Insert: {
          average_order_value?: number | null
          channels_used?: string[]
          created_at?: string
          email?: string | null
          first_order_at?: string | null
          id?: string
          last_order_at?: string | null
          name?: string | null
          order_count?: number
          phone_e164?: string | null
          sms_consent?: boolean
          sms_consent_at?: string | null
          sms_opt_out?: boolean
          sms_opt_out_at?: string | null
          tenant_id: string
          top_items?: Json
          total_spent?: number
          updated_at?: string
        }
        Update: {
          average_order_value?: number | null
          channels_used?: string[]
          created_at?: string
          email?: string | null
          first_order_at?: string | null
          id?: string
          last_order_at?: string | null
          name?: string | null
          order_count?: number
          phone_e164?: string | null
          sms_consent?: boolean
          sms_consent_at?: string | null
          sms_opt_out?: boolean
          sms_opt_out_at?: string | null
          tenant_id?: string
          top_items?: Json
          total_spent?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "customers_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      daily_stats: {
        Row: {
          avg_order_value: number
          created_at: string
          date: string
          id: string
          tenant_id: string
          top_items: Json
          total_orders: number
          total_revenue: number
          updated_at: string
          upsell_conversion_rate: number | null
        }
        Insert: {
          avg_order_value?: number
          created_at?: string
          date: string
          id?: string
          tenant_id: string
          top_items?: Json
          total_orders?: number
          total_revenue?: number
          updated_at?: string
          upsell_conversion_rate?: number | null
        }
        Update: {
          avg_order_value?: number
          created_at?: string
          date?: string
          id?: string
          tenant_id?: string
          top_items?: Json
          total_orders?: number
          total_revenue?: number
          updated_at?: string
          upsell_conversion_rate?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "daily_stats_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      facebook_pages: {
        Row: {
          created_at: string
          id: string
          is_active: boolean
          page_access_token: string
          page_id: string
          page_name: string
          tenant_id: string
          updated_at: string
          user_access_token: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean
          page_access_token: string
          page_id: string
          page_name: string
          tenant_id: string
          updated_at?: string
          user_access_token?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean
          page_access_token?: string
          page_id?: string
          page_name?: string
          tenant_id?: string
          updated_at?: string
          user_access_token?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "facebook_pages_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      inventory_counts: {
        Row: {
          business_day: string
          closed_at: string | null
          closed_by: string | null
          created_at: string
          expected_item_count: number
          id: string
          note: string | null
          outlet_id: string | null
          started_at: string
          started_by: string | null
          status: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          business_day: string
          closed_at?: string | null
          closed_by?: string | null
          created_at?: string
          expected_item_count?: number
          id?: string
          note?: string | null
          outlet_id?: string | null
          started_at?: string
          started_by?: string | null
          status?: string
          tenant_id: string
          updated_at?: string
        }
        Update: {
          business_day?: string
          closed_at?: string | null
          closed_by?: string | null
          created_at?: string
          expected_item_count?: number
          id?: string
          note?: string | null
          outlet_id?: string | null
          started_at?: string
          started_by?: string | null
          status?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "inventory_counts_outlet_id_fkey"
            columns: ["outlet_id"]
            isOneToOne: false
            referencedRelation: "outlets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_counts_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      inventory_items: {
        Row: {
          category: string | null
          created_at: string | null
          current_qty: number
          id: string
          image_url: string | null
          is_active: boolean
          is_prep: boolean
          name: string
          reorder_level: number
          sku: string | null
          stock_unit_id: string
          tenant_id: string
          unit_cost: number
          updated_at: string | null
        }
        Insert: {
          category?: string | null
          created_at?: string | null
          current_qty?: number
          id?: string
          image_url?: string | null
          is_active?: boolean
          is_prep?: boolean
          name: string
          reorder_level?: number
          sku?: string | null
          stock_unit_id: string
          tenant_id: string
          unit_cost?: number
          updated_at?: string | null
        }
        Update: {
          category?: string | null
          created_at?: string | null
          current_qty?: number
          id?: string
          image_url?: string | null
          is_active?: boolean
          is_prep?: boolean
          name?: string
          reorder_level?: number
          sku?: string | null
          stock_unit_id?: string
          tenant_id?: string
          unit_cost?: number
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "inventory_items_stock_unit_id_fkey"
            columns: ["stock_unit_id"]
            isOneToOne: false
            referencedRelation: "inventory_units"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_items_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      inventory_stock: {
        Row: {
          created_at: string | null
          current_qty: number
          id: string
          inventory_item_id: string
          outlet_id: string | null
          reorder_level: number
          tenant_id: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          current_qty?: number
          id?: string
          inventory_item_id: string
          outlet_id?: string | null
          reorder_level?: number
          tenant_id: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          current_qty?: number
          id?: string
          inventory_item_id?: string
          outlet_id?: string | null
          reorder_level?: number
          tenant_id?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "inventory_stock_inventory_item_id_fkey"
            columns: ["inventory_item_id"]
            isOneToOne: false
            referencedRelation: "inventory_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_stock_outlet_id_fkey"
            columns: ["outlet_id"]
            isOneToOne: false
            referencedRelation: "outlets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_stock_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      inventory_units: {
        Row: {
          abbreviation: string
          created_at: string | null
          dimension: string
          id: string
          is_active: boolean
          is_base: boolean
          name: string
          tenant_id: string
          to_base_factor: number
          updated_at: string | null
        }
        Insert: {
          abbreviation: string
          created_at?: string | null
          dimension: string
          id?: string
          is_active?: boolean
          is_base?: boolean
          name: string
          tenant_id: string
          to_base_factor?: number
          updated_at?: string | null
        }
        Update: {
          abbreviation?: string
          created_at?: string | null
          dimension?: string
          id?: string
          is_active?: boolean
          is_base?: boolean
          name?: string
          tenant_id?: string
          to_base_factor?: number
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "inventory_units_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      lead_notes: {
        Row: {
          created_at: string | null
          created_by: string | null
          id: string
          lead_id: string
          note: string
        }
        Insert: {
          created_at?: string | null
          created_by?: string | null
          id?: string
          lead_id: string
          note: string
        }
        Update: {
          created_at?: string | null
          created_by?: string | null
          id?: string
          lead_id?: string
          note?: string
        }
        Relationships: [
          {
            foreignKeyName: "lead_notes_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
        ]
      }
      lead_status_history: {
        Row: {
          changed_by: string | null
          created_at: string | null
          id: string
          lead_id: string
          new_status: string
          note: string | null
          old_status: string | null
        }
        Insert: {
          changed_by?: string | null
          created_at?: string | null
          id?: string
          lead_id: string
          new_status: string
          note?: string | null
          old_status?: string | null
        }
        Update: {
          changed_by?: string | null
          created_at?: string | null
          id?: string
          lead_id?: string
          new_status?: string
          note?: string | null
          old_status?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "lead_status_history_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
        ]
      }
      leads: {
        Row: {
          booking_date: string
          booking_time: string
          converted_tenant_id: string | null
          created_at: string | null
          email: string
          id: string
          name: string
          phone: string
          source: string | null
          status: string
          updated_at: string | null
        }
        Insert: {
          booking_date: string
          booking_time: string
          converted_tenant_id?: string | null
          created_at?: string | null
          email: string
          id?: string
          name: string
          phone: string
          source?: string | null
          status?: string
          updated_at?: string | null
        }
        Update: {
          booking_date?: string
          booking_time?: string
          converted_tenant_id?: string | null
          created_at?: string | null
          email?: string
          id?: string
          name?: string
          phone?: string
          source?: string | null
          status?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "leads_converted_tenant_id_fkey"
            columns: ["converted_tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      mcp_api_keys: {
        Row: {
          created_at: string | null
          created_by: string | null
          id: string
          key_hash: string
          key_prefix: string
          label: string
          last_used_at: string | null
          revoked_at: string | null
          scopes: string[]
        }
        Insert: {
          created_at?: string | null
          created_by?: string | null
          id?: string
          key_hash: string
          key_prefix: string
          label: string
          last_used_at?: string | null
          revoked_at?: string | null
          scopes?: string[]
        }
        Update: {
          created_at?: string | null
          created_by?: string | null
          id?: string
          key_hash?: string
          key_prefix?: string
          label?: string
          last_used_at?: string | null
          revoked_at?: string | null
          scopes?: string[]
        }
        Relationships: []
      }
      mcp_oauth_clients: {
        Row: {
          client_id: string
          client_name: string
          created_at: string | null
          redirect_uris: string[]
        }
        Insert: {
          client_id: string
          client_name: string
          created_at?: string | null
          redirect_uris: string[]
        }
        Update: {
          client_id?: string
          client_name?: string
          created_at?: string | null
          redirect_uris?: string[]
        }
        Relationships: []
      }
      mcp_oauth_codes: {
        Row: {
          client_id: string
          code_challenge: string
          code_challenge_method: string
          code_hash: string
          consumed_at: string | null
          created_at: string | null
          created_by: string | null
          expires_at: string
          id: string
          redirect_uri: string
          scope: string
        }
        Insert: {
          client_id: string
          code_challenge: string
          code_challenge_method?: string
          code_hash: string
          consumed_at?: string | null
          created_at?: string | null
          created_by?: string | null
          expires_at: string
          id?: string
          redirect_uri: string
          scope?: string
        }
        Update: {
          client_id?: string
          code_challenge?: string
          code_challenge_method?: string
          code_hash?: string
          consumed_at?: string | null
          created_at?: string | null
          created_by?: string | null
          expires_at?: string
          id?: string
          redirect_uri?: string
          scope?: string
        }
        Relationships: []
      }
      mcp_oauth_tokens: {
        Row: {
          client_id: string
          created_at: string | null
          expires_at: string
          id: string
          revoked_at: string | null
          scope: string
          subject: string | null
          token_hash: string
        }
        Insert: {
          client_id: string
          created_at?: string | null
          expires_at: string
          id?: string
          revoked_at?: string | null
          scope?: string
          subject?: string | null
          token_hash: string
        }
        Update: {
          client_id?: string
          created_at?: string | null
          expires_at?: string
          id?: string
          revoked_at?: string | null
          scope?: string
          subject?: string | null
          token_hash?: string
        }
        Relationships: []
      }
      menu_item_tags: {
        Row: {
          menu_item_id: string
          tag_definition_id: string
          tenant_id: string
        }
        Insert: {
          menu_item_id: string
          tag_definition_id: string
          tenant_id: string
        }
        Update: {
          menu_item_id?: string
          tag_definition_id?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "menu_item_tags_menu_item_id_fkey"
            columns: ["menu_item_id"]
            isOneToOne: false
            referencedRelation: "menu_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "menu_item_tags_tag_definition_id_fkey"
            columns: ["tag_definition_id"]
            isOneToOne: false
            referencedRelation: "tag_definitions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "menu_item_tags_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      menu_items: {
        Row: {
          addons: Json
          auto_disabled_at: string | null
          badge_text: string | null
          bcg_classification: string | null
          boost_priority: number | null
          category_id: string | null
          created_at: string
          description: string
          discounted_price: number | null
          id: string
          image_url: string
          is_available: boolean
          is_featured: boolean
          modifier_groups: Json
          name: string
          order: number
          price: number
          show_in_checkout_upsell: boolean
          tenant_id: string
          updated_at: string
          variation_types: Json
          variations: Json
        }
        Insert: {
          addons?: Json
          auto_disabled_at?: string | null
          badge_text?: string | null
          bcg_classification?: string | null
          boost_priority?: number | null
          category_id?: string | null
          created_at?: string
          description: string
          discounted_price?: number | null
          id?: string
          image_url: string
          is_available?: boolean
          is_featured?: boolean
          modifier_groups?: Json
          name: string
          order?: number
          price: number
          show_in_checkout_upsell?: boolean
          tenant_id: string
          updated_at?: string
          variation_types?: Json
          variations?: Json
        }
        Update: {
          addons?: Json
          auto_disabled_at?: string | null
          badge_text?: string | null
          bcg_classification?: string | null
          boost_priority?: number | null
          category_id?: string | null
          created_at?: string
          description?: string
          discounted_price?: number | null
          id?: string
          image_url?: string
          is_available?: boolean
          is_featured?: boolean
          modifier_groups?: Json
          name?: string
          order?: number
          price?: number
          show_in_checkout_upsell?: boolean
          tenant_id?: string
          updated_at?: string
          variation_types?: Json
          variations?: Json
        }
        Relationships: [
          {
            foreignKeyName: "menu_items_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "menu_items_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      messenger_sessions: {
        Row: {
          cart_data: Json | null
          checkout_state: Json | null
          created_at: string
          id: string
          psid: string
          state: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          cart_data?: Json | null
          checkout_state?: Json | null
          created_at?: string
          id?: string
          psid: string
          state?: string
          tenant_id: string
          updated_at?: string
        }
        Update: {
          cart_data?: Json | null
          checkout_state?: Json | null
          created_at?: string
          id?: string
          psid?: string
          state?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "messenger_sessions_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      modifier_group_library: {
        Row: {
          created_at: string | null
          display_order: number
          id: string
          is_active: boolean
          max_select: number | null
          min_select: number
          name: string
          options: Json
          source_menu_item_id: string | null
          tenant_id: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          display_order?: number
          id?: string
          is_active?: boolean
          max_select?: number | null
          min_select?: number
          name: string
          options?: Json
          source_menu_item_id?: string | null
          tenant_id: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          display_order?: number
          id?: string
          is_active?: boolean
          max_select?: number | null
          min_select?: number
          name?: string
          options?: Json
          source_menu_item_id?: string | null
          tenant_id?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "modifier_group_library_source_menu_item_id_fkey"
            columns: ["source_menu_item_id"]
            isOneToOne: false
            referencedRelation: "menu_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "modifier_group_library_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      order_items: {
        Row: {
          addons: string[]
          bundle_id: string | null
          bundle_name: string | null
          discount_amount: number
          id: string
          is_bundle_item: boolean
          is_upsell_item: boolean
          menu_item_id: string | null
          menu_item_name: string
          order_id: string
          price: number
          quantity: number
          slot_name: string | null
          special_instructions: string | null
          subtotal: number
          variation: string | null
          variation_selections: Json | null
        }
        Insert: {
          addons?: string[]
          bundle_id?: string | null
          bundle_name?: string | null
          discount_amount?: number
          id?: string
          is_bundle_item?: boolean
          is_upsell_item?: boolean
          menu_item_id?: string | null
          menu_item_name: string
          order_id: string
          price: number
          quantity?: number
          slot_name?: string | null
          special_instructions?: string | null
          subtotal: number
          variation?: string | null
          variation_selections?: Json | null
        }
        Update: {
          addons?: string[]
          bundle_id?: string | null
          bundle_name?: string | null
          discount_amount?: number
          id?: string
          is_bundle_item?: boolean
          is_upsell_item?: boolean
          menu_item_id?: string | null
          menu_item_name?: string
          order_id?: string
          price?: number
          quantity?: number
          slot_name?: string | null
          special_instructions?: string | null
          subtotal?: number
          variation?: string | null
          variation_selections?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "order_items_menu_item_id_fkey"
            columns: ["menu_item_id"]
            isOneToOne: false
            referencedRelation: "menu_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_items_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      order_payments: {
        Row: {
          amount: number
          created_at: string
          id: string
          kind: string
          note: string | null
          order_id: string
          outlet_id: string | null
          payment_method_id: string | null
          payment_method_name: string | null
          proof_public_id: string | null
          proof_url: string | null
          recorded_by: string | null
          reference: string | null
          tenant_id: string
        }
        Insert: {
          amount: number
          created_at?: string
          id?: string
          kind: string
          note?: string | null
          order_id: string
          outlet_id?: string | null
          payment_method_id?: string | null
          payment_method_name?: string | null
          proof_public_id?: string | null
          proof_url?: string | null
          recorded_by?: string | null
          reference?: string | null
          tenant_id: string
        }
        Update: {
          amount?: number
          created_at?: string
          id?: string
          kind?: string
          note?: string | null
          order_id?: string
          outlet_id?: string | null
          payment_method_id?: string | null
          payment_method_name?: string | null
          proof_public_id?: string | null
          proof_url?: string | null
          recorded_by?: string | null
          reference?: string | null
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "order_payments_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_payments_outlet_id_fkey"
            columns: ["outlet_id"]
            isOneToOne: false
            referencedRelation: "outlets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_payments_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      order_revisions: {
        Row: {
          created_at: string
          id: string
          items_after: Json
          items_before: Json
          order_id: string
          outlet_id: string | null
          reason: string | null
          revised_by: string | null
          revision_number: number
          tenant_id: string
          total_after: number
          total_before: number
        }
        Insert: {
          created_at?: string
          id?: string
          items_after: Json
          items_before: Json
          order_id: string
          outlet_id?: string | null
          reason?: string | null
          revised_by?: string | null
          revision_number: number
          tenant_id: string
          total_after: number
          total_before: number
        }
        Update: {
          created_at?: string
          id?: string
          items_after?: Json
          items_before?: Json
          order_id?: string
          outlet_id?: string | null
          reason?: string | null
          revised_by?: string | null
          revision_number?: number
          tenant_id?: string
          total_after?: number
          total_before?: number
        }
        Relationships: [
          {
            foreignKeyName: "order_revisions_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_revisions_outlet_id_fkey"
            columns: ["outlet_id"]
            isOneToOne: false
            referencedRelation: "outlets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_revisions_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      order_stock_applications: {
        Row: {
          created_at: string
          id: string
          order_id: string
          reason: string
          revision: number
          tenant_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          order_id: string
          reason: string
          revision?: number
          tenant_id: string
        }
        Update: {
          created_at?: string
          id?: string
          order_id?: string
          reason?: string
          revision?: number
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "order_stock_applications_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      order_types: {
        Row: {
          advance_order_allow_asap: boolean
          advance_order_enabled: boolean
          advance_order_lead_time_minutes: number
          advance_order_max_days_ahead: number
          advance_order_slot_interval_minutes: number
          created_at: string
          description: string | null
          id: string
          is_enabled: boolean
          messenger_enabled: boolean
          name: string
          note: string | null
          order_index: number
          service_charge_enabled: boolean
          service_charge_type: string | null
          service_charge_value: number | null
          tenant_id: string
          type: string
          updated_at: string
        }
        Insert: {
          advance_order_allow_asap?: boolean
          advance_order_enabled?: boolean
          advance_order_lead_time_minutes?: number
          advance_order_max_days_ahead?: number
          advance_order_slot_interval_minutes?: number
          created_at?: string
          description?: string | null
          id?: string
          is_enabled?: boolean
          messenger_enabled?: boolean
          name: string
          note?: string | null
          order_index?: number
          service_charge_enabled?: boolean
          service_charge_type?: string | null
          service_charge_value?: number | null
          tenant_id: string
          type: string
          updated_at?: string
        }
        Update: {
          advance_order_allow_asap?: boolean
          advance_order_enabled?: boolean
          advance_order_lead_time_minutes?: number
          advance_order_max_days_ahead?: number
          advance_order_slot_interval_minutes?: number
          created_at?: string
          description?: string | null
          id?: string
          is_enabled?: boolean
          messenger_enabled?: boolean
          name?: string
          note?: string | null
          order_index?: number
          service_charge_enabled?: boolean
          service_charge_type?: string | null
          service_charge_value?: number | null
          tenant_id?: string
          type?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "order_types_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      orders: {
        Row: {
          amount_paid: number
          client_order_id: string | null
          created_at: string
          customer_contact: string | null
          customer_data: Json | null
          customer_id: string | null
          customer_name: string | null
          delivery_fee: number | null
          discount_data: Json | null
          discount_total: number
          edited_at: string | null
          edited_by: string | null
          has_bundle_items: boolean
          has_upsell_items: boolean
          id: string
          item_count: number | null
          lalamove_driver_id: string | null
          lalamove_driver_name: string | null
          lalamove_driver_phone: string | null
          lalamove_order_id: string | null
          lalamove_quotation_id: string | null
          lalamove_status: string | null
          lalamove_tracking_url: string | null
          order_token_expires_at: string | null
          order_token_hash: string | null
          order_type: string | null
          order_type_id: string | null
          outlet_id: string | null
          payment_method_details: string | null
          payment_method_id: string | null
          payment_method_name: string | null
          payment_method_qr_code_url: string | null
          payment_proof_public_id: string | null
          payment_proof_reference: string | null
          payment_proof_uploaded_at: string | null
          payment_proof_url: string | null
          payment_status: string | null
          revision_number: number
          scheduled_for: string | null
          service_charge_amount: number | null
          source: string
          status: string
          tenant_id: string
          total: number
          updated_at: string
        }
        Insert: {
          amount_paid?: number
          client_order_id?: string | null
          created_at?: string
          customer_contact?: string | null
          customer_data?: Json | null
          customer_id?: string | null
          customer_name?: string | null
          delivery_fee?: number | null
          discount_data?: Json | null
          discount_total?: number
          edited_at?: string | null
          edited_by?: string | null
          has_bundle_items?: boolean
          has_upsell_items?: boolean
          id?: string
          item_count?: number | null
          lalamove_driver_id?: string | null
          lalamove_driver_name?: string | null
          lalamove_driver_phone?: string | null
          lalamove_order_id?: string | null
          lalamove_quotation_id?: string | null
          lalamove_status?: string | null
          lalamove_tracking_url?: string | null
          order_token_expires_at?: string | null
          order_token_hash?: string | null
          order_type?: string | null
          order_type_id?: string | null
          outlet_id?: string | null
          payment_method_details?: string | null
          payment_method_id?: string | null
          payment_method_name?: string | null
          payment_method_qr_code_url?: string | null
          payment_proof_public_id?: string | null
          payment_proof_reference?: string | null
          payment_proof_uploaded_at?: string | null
          payment_proof_url?: string | null
          payment_status?: string | null
          revision_number?: number
          scheduled_for?: string | null
          service_charge_amount?: number | null
          source?: string
          status?: string
          tenant_id: string
          total: number
          updated_at?: string
        }
        Update: {
          amount_paid?: number
          client_order_id?: string | null
          created_at?: string
          customer_contact?: string | null
          customer_data?: Json | null
          customer_id?: string | null
          customer_name?: string | null
          delivery_fee?: number | null
          discount_data?: Json | null
          discount_total?: number
          edited_at?: string | null
          edited_by?: string | null
          has_bundle_items?: boolean
          has_upsell_items?: boolean
          id?: string
          item_count?: number | null
          lalamove_driver_id?: string | null
          lalamove_driver_name?: string | null
          lalamove_driver_phone?: string | null
          lalamove_order_id?: string | null
          lalamove_quotation_id?: string | null
          lalamove_status?: string | null
          lalamove_tracking_url?: string | null
          order_token_expires_at?: string | null
          order_token_hash?: string | null
          order_type?: string | null
          order_type_id?: string | null
          outlet_id?: string | null
          payment_method_details?: string | null
          payment_method_id?: string | null
          payment_method_name?: string | null
          payment_method_qr_code_url?: string | null
          payment_proof_public_id?: string | null
          payment_proof_reference?: string | null
          payment_proof_uploaded_at?: string | null
          payment_proof_url?: string | null
          payment_status?: string | null
          revision_number?: number
          scheduled_for?: string | null
          service_charge_amount?: number | null
          source?: string
          status?: string
          tenant_id?: string
          total?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "orders_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_order_type_id_fkey"
            columns: ["order_type_id"]
            isOneToOne: false
            referencedRelation: "order_types"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_outlet_id_fkey"
            columns: ["outlet_id"]
            isOneToOne: false
            referencedRelation: "outlets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_payment_method_id_fkey"
            columns: ["payment_method_id"]
            isOneToOne: false
            referencedRelation: "payment_methods"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      outlet_menu_items: {
        Row: {
          created_at: string
          discount_cleared: boolean
          discounted_price: number | null
          id: string
          is_available: boolean
          is_listed: boolean
          menu_item_id: string
          outlet_id: string
          price: number | null
          tenant_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          discount_cleared?: boolean
          discounted_price?: number | null
          id?: string
          is_available?: boolean
          is_listed?: boolean
          menu_item_id: string
          outlet_id: string
          price?: number | null
          tenant_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          discount_cleared?: boolean
          discounted_price?: number | null
          id?: string
          is_available?: boolean
          is_listed?: boolean
          menu_item_id?: string
          outlet_id?: string
          price?: number | null
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "outlet_menu_items_menu_item_id_fkey"
            columns: ["menu_item_id"]
            isOneToOne: false
            referencedRelation: "menu_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "outlet_menu_items_outlet_id_fkey"
            columns: ["outlet_id"]
            isOneToOne: false
            referencedRelation: "outlets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "outlet_menu_items_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      outlets: {
        Row: {
          address: string | null
          created_at: string
          delivery_radius_km: number | null
          id: string
          image_url: string | null
          is_active: boolean
          latitude: number | null
          longitude: number | null
          name: string
          operating_hours: Json | null
          phone: string | null
          slug: string
          sort_order: number
          supports_delivery: boolean
          supports_dine_in: boolean
          supports_pickup: boolean
          tenant_id: string
          timezone: string | null
          updated_at: string
        }
        Insert: {
          address?: string | null
          created_at?: string
          delivery_radius_km?: number | null
          id?: string
          image_url?: string | null
          is_active?: boolean
          latitude?: number | null
          longitude?: number | null
          name: string
          operating_hours?: Json | null
          phone?: string | null
          slug: string
          sort_order?: number
          supports_delivery?: boolean
          supports_dine_in?: boolean
          supports_pickup?: boolean
          tenant_id: string
          timezone?: string | null
          updated_at?: string
        }
        Update: {
          address?: string | null
          created_at?: string
          delivery_radius_km?: number | null
          id?: string
          image_url?: string | null
          is_active?: boolean
          latitude?: number | null
          longitude?: number | null
          name?: string
          operating_hours?: Json | null
          phone?: string | null
          slug?: string
          sort_order?: number
          supports_delivery?: boolean
          supports_dine_in?: boolean
          supports_pickup?: boolean
          tenant_id?: string
          timezone?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "outlets_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      pairing_rule_target_items: {
        Row: {
          display_order: number
          menu_item_id: string
          target_id: string
        }
        Insert: {
          display_order?: number
          menu_item_id: string
          target_id: string
        }
        Update: {
          display_order?: number
          menu_item_id?: string
          target_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "pairing_rule_target_items_menu_item_id_fkey"
            columns: ["menu_item_id"]
            isOneToOne: false
            referencedRelation: "menu_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pairing_rule_target_items_target_id_fkey"
            columns: ["target_id"]
            isOneToOne: false
            referencedRelation: "pairing_rule_targets"
            referencedColumns: ["id"]
          },
        ]
      }
      pairing_rule_targets: {
        Row: {
          display_order: number
          id: string
          rule_id: string
          selection_mode: string
          target_category_id: string | null
          target_tag_id: string | null
          target_type: string
        }
        Insert: {
          display_order?: number
          id?: string
          rule_id: string
          selection_mode?: string
          target_category_id?: string | null
          target_tag_id?: string | null
          target_type: string
        }
        Update: {
          display_order?: number
          id?: string
          rule_id?: string
          selection_mode?: string
          target_category_id?: string | null
          target_tag_id?: string | null
          target_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "pairing_rule_targets_rule_id_fkey"
            columns: ["rule_id"]
            isOneToOne: false
            referencedRelation: "pairing_rules"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pairing_rule_targets_target_category_id_fkey"
            columns: ["target_category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pairing_rule_targets_target_tag_id_fkey"
            columns: ["target_tag_id"]
            isOneToOne: false
            referencedRelation: "tag_definitions"
            referencedColumns: ["id"]
          },
        ]
      }
      pairing_rules: {
        Row: {
          created_at: string
          id: string
          is_active: boolean
          max_suggestions: number
          name: string
          source_category_id: string | null
          source_tag_id: string | null
          source_type: string
          tenant_id: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean
          max_suggestions?: number
          name: string
          source_category_id?: string | null
          source_tag_id?: string | null
          source_type: string
          tenant_id?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean
          max_suggestions?: number
          name?: string
          source_category_id?: string | null
          source_tag_id?: string | null
          source_type?: string
          tenant_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "pairing_rules_source_category_id_fkey"
            columns: ["source_category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pairing_rules_source_tag_id_fkey"
            columns: ["source_tag_id"]
            isOneToOne: false
            referencedRelation: "tag_definitions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pairing_rules_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      payment_method_order_types: {
        Row: {
          created_at: string
          id: string
          order_type_id: string
          payment_method_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          order_type_id: string
          payment_method_id: string
        }
        Update: {
          created_at?: string
          id?: string
          order_type_id?: string
          payment_method_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "payment_method_order_types_order_type_id_fkey"
            columns: ["order_type_id"]
            isOneToOne: false
            referencedRelation: "order_types"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_method_order_types_payment_method_id_fkey"
            columns: ["payment_method_id"]
            isOneToOne: false
            referencedRelation: "payment_methods"
            referencedColumns: ["id"]
          },
        ]
      }
      payment_methods: {
        Row: {
          created_at: string
          details: string | null
          id: string
          is_active: boolean
          name: string
          order_index: number
          qr_code_url: string | null
          require_payment_proof: boolean
          tenant_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          details?: string | null
          id?: string
          is_active?: boolean
          name: string
          order_index?: number
          qr_code_url?: string | null
          require_payment_proof?: boolean
          tenant_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          details?: string | null
          id?: string
          is_active?: boolean
          name?: string
          order_index?: number
          qr_code_url?: string | null
          require_payment_proof?: boolean
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "payment_methods_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      platform_payment_methods: {
        Row: {
          created_at: string
          details: string | null
          id: string
          is_active: boolean
          name: string
          order_index: number
          qr_code_url: string | null
          type: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          details?: string | null
          id?: string
          is_active?: boolean
          name: string
          order_index?: number
          qr_code_url?: string | null
          type: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          details?: string | null
          id?: string
          is_active?: boolean
          name?: string
          order_index?: number
          qr_code_url?: string | null
          type?: string
          updated_at?: string
        }
        Relationships: []
      }
      product_analytics: {
        Row: {
          avg_daily_units: number
          bcg_classification: string
          computed_at: string
          id: string
          last_order_date: string | null
          margin_percent: number | null
          menu_item_id: string
          menu_item_name: string | null
          pairing_item_id: string | null
          pairing_reason: string | null
          pairing_recommendation: string | null
          period: string
          recommendation: string | null
          revenue_trend: string
          tenant_id: string
          total_cost: number
          total_profit: number
          total_revenue: number
          total_units_sold: number
        }
        Insert: {
          avg_daily_units?: number
          bcg_classification?: string
          computed_at?: string
          id?: string
          last_order_date?: string | null
          margin_percent?: number | null
          menu_item_id: string
          menu_item_name?: string | null
          pairing_item_id?: string | null
          pairing_reason?: string | null
          pairing_recommendation?: string | null
          period: string
          recommendation?: string | null
          revenue_trend?: string
          tenant_id: string
          total_cost?: number
          total_profit?: number
          total_revenue?: number
          total_units_sold?: number
        }
        Update: {
          avg_daily_units?: number
          bcg_classification?: string
          computed_at?: string
          id?: string
          last_order_date?: string | null
          margin_percent?: number | null
          menu_item_id?: string
          menu_item_name?: string | null
          pairing_item_id?: string | null
          pairing_reason?: string | null
          pairing_recommendation?: string | null
          period?: string
          recommendation?: string | null
          revenue_trend?: string
          tenant_id?: string
          total_cost?: number
          total_profit?: number
          total_revenue?: number
          total_units_sold?: number
        }
        Relationships: [
          {
            foreignKeyName: "product_analytics_menu_item_id_fkey"
            columns: ["menu_item_id"]
            isOneToOne: false
            referencedRelation: "menu_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_analytics_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      product_costs: {
        Row: {
          cost_notes: string | null
          cost_price: number
          created_at: string
          id: string
          menu_item_id: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          cost_notes?: string | null
          cost_price?: number
          created_at?: string
          id?: string
          menu_item_id: string
          tenant_id: string
          updated_at?: string
        }
        Update: {
          cost_notes?: string | null
          cost_price?: number
          created_at?: string
          id?: string
          menu_item_id?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "product_costs_menu_item_id_fkey"
            columns: ["menu_item_id"]
            isOneToOne: false
            referencedRelation: "menu_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_costs_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      product_detail_settings: {
        Row: {
          add_to_cart_button_background: string | null
          add_to_cart_button_label: string | null
          add_to_cart_button_shadow_color: string | null
          add_to_cart_button_text_color: string | null
          addon_background_color: string | null
          addon_border_color: string | null
          addon_optional_text: string | null
          addon_price_color: string | null
          addon_price_free_text: string | null
          addon_section_title_color: string | null
          addon_section_title_font_size: string | null
          addon_selected_background_color: string | null
          addon_selected_border_color: string | null
          addon_selected_check_color: string | null
          addon_selected_text_color: string | null
          addon_text_color: string | null
          animation_speed: string | null
          breadcrumb_active_color: string | null
          breadcrumb_color: string | null
          button_border_radius: string | null
          buy_now_button_background: string | null
          buy_now_button_border_color: string | null
          buy_now_button_label: string | null
          buy_now_button_text_color: string | null
          card_border_radius: string | null
          checkout_modal_background_color: string | null
          checkout_modal_border_color: string | null
          checkout_modal_button_color: string | null
          checkout_modal_button_text_color: string | null
          checkout_modal_description_color: string | null
          checkout_modal_price_color: string | null
          checkout_modal_title_color: string | null
          created_at: string | null
          description_color: string | null
          description_font_size: string | null
          dietary_tag_background_color: string | null
          dietary_tag_border_color: string | null
          dietary_tag_text_color: string | null
          enable_animations: boolean | null
          font_family_body: string | null
          font_family_heading: string | null
          footer_background_color: string | null
          footer_border_color: string | null
          footer_empty_summary_text: string | null
          footer_shadow_color: string | null
          header_background_color: string | null
          header_button_background_color: string | null
          header_button_icon_color: string | null
          id: string
          image_background_color: string | null
          image_placeholder_color: string | null
          mobile_overrides: Json
          modal_background_color: string | null
          modal_close_button_background: string | null
          modal_close_button_color: string | null
          original_price_color: string | null
          page_background_color: string | null
          page_background_gradient: string | null
          popup_modal_background_color: string | null
          popup_modal_border_color: string | null
          popup_modal_button_color: string | null
          popup_modal_button_text_color: string | null
          popup_modal_description_color: string | null
          popup_modal_price_color: string | null
          popup_modal_title_color: string | null
          product_name_color: string | null
          product_name_font_size: string | null
          product_name_font_weight: string | null
          quantity_button_color: string | null
          quantity_controls_background: string | null
          quantity_text_color: string | null
          related_item_background_color: string | null
          related_item_name_color: string | null
          related_item_price_color: string | null
          related_section_title_color: string | null
          related_section_title_font_size: string | null
          sale_badge_background_color: string | null
          sale_badge_text_color: string | null
          section_padding: string | null
          summary_text_color: string | null
          tenant_id: string
          total_price_color: string | null
          updated_at: string | null
          variation_option_background_color: string | null
          variation_option_border_color: string | null
          variation_option_selected_background_color: string | null
          variation_option_selected_border_color: string | null
          variation_option_selected_text_color: string | null
          variation_option_text_color: string | null
          variation_optional_text: string | null
          variation_price_modifier_color: string | null
          variation_required_badge_color: string | null
          variation_required_text: string | null
          variation_section_title_color: string | null
          variation_section_title_font_size: string | null
        }
        Insert: {
          add_to_cart_button_background?: string | null
          add_to_cart_button_label?: string | null
          add_to_cart_button_shadow_color?: string | null
          add_to_cart_button_text_color?: string | null
          addon_background_color?: string | null
          addon_border_color?: string | null
          addon_optional_text?: string | null
          addon_price_color?: string | null
          addon_price_free_text?: string | null
          addon_section_title_color?: string | null
          addon_section_title_font_size?: string | null
          addon_selected_background_color?: string | null
          addon_selected_border_color?: string | null
          addon_selected_check_color?: string | null
          addon_selected_text_color?: string | null
          addon_text_color?: string | null
          animation_speed?: string | null
          breadcrumb_active_color?: string | null
          breadcrumb_color?: string | null
          button_border_radius?: string | null
          buy_now_button_background?: string | null
          buy_now_button_border_color?: string | null
          buy_now_button_label?: string | null
          buy_now_button_text_color?: string | null
          card_border_radius?: string | null
          checkout_modal_background_color?: string | null
          checkout_modal_border_color?: string | null
          checkout_modal_button_color?: string | null
          checkout_modal_button_text_color?: string | null
          checkout_modal_description_color?: string | null
          checkout_modal_price_color?: string | null
          checkout_modal_title_color?: string | null
          created_at?: string | null
          description_color?: string | null
          description_font_size?: string | null
          dietary_tag_background_color?: string | null
          dietary_tag_border_color?: string | null
          dietary_tag_text_color?: string | null
          enable_animations?: boolean | null
          font_family_body?: string | null
          font_family_heading?: string | null
          footer_background_color?: string | null
          footer_border_color?: string | null
          footer_empty_summary_text?: string | null
          footer_shadow_color?: string | null
          header_background_color?: string | null
          header_button_background_color?: string | null
          header_button_icon_color?: string | null
          id?: string
          image_background_color?: string | null
          image_placeholder_color?: string | null
          mobile_overrides?: Json
          modal_background_color?: string | null
          modal_close_button_background?: string | null
          modal_close_button_color?: string | null
          original_price_color?: string | null
          page_background_color?: string | null
          page_background_gradient?: string | null
          popup_modal_background_color?: string | null
          popup_modal_border_color?: string | null
          popup_modal_button_color?: string | null
          popup_modal_button_text_color?: string | null
          popup_modal_description_color?: string | null
          popup_modal_price_color?: string | null
          popup_modal_title_color?: string | null
          product_name_color?: string | null
          product_name_font_size?: string | null
          product_name_font_weight?: string | null
          quantity_button_color?: string | null
          quantity_controls_background?: string | null
          quantity_text_color?: string | null
          related_item_background_color?: string | null
          related_item_name_color?: string | null
          related_item_price_color?: string | null
          related_section_title_color?: string | null
          related_section_title_font_size?: string | null
          sale_badge_background_color?: string | null
          sale_badge_text_color?: string | null
          section_padding?: string | null
          summary_text_color?: string | null
          tenant_id: string
          total_price_color?: string | null
          updated_at?: string | null
          variation_option_background_color?: string | null
          variation_option_border_color?: string | null
          variation_option_selected_background_color?: string | null
          variation_option_selected_border_color?: string | null
          variation_option_selected_text_color?: string | null
          variation_option_text_color?: string | null
          variation_optional_text?: string | null
          variation_price_modifier_color?: string | null
          variation_required_badge_color?: string | null
          variation_required_text?: string | null
          variation_section_title_color?: string | null
          variation_section_title_font_size?: string | null
        }
        Update: {
          add_to_cart_button_background?: string | null
          add_to_cart_button_label?: string | null
          add_to_cart_button_shadow_color?: string | null
          add_to_cart_button_text_color?: string | null
          addon_background_color?: string | null
          addon_border_color?: string | null
          addon_optional_text?: string | null
          addon_price_color?: string | null
          addon_price_free_text?: string | null
          addon_section_title_color?: string | null
          addon_section_title_font_size?: string | null
          addon_selected_background_color?: string | null
          addon_selected_border_color?: string | null
          addon_selected_check_color?: string | null
          addon_selected_text_color?: string | null
          addon_text_color?: string | null
          animation_speed?: string | null
          breadcrumb_active_color?: string | null
          breadcrumb_color?: string | null
          button_border_radius?: string | null
          buy_now_button_background?: string | null
          buy_now_button_border_color?: string | null
          buy_now_button_label?: string | null
          buy_now_button_text_color?: string | null
          card_border_radius?: string | null
          checkout_modal_background_color?: string | null
          checkout_modal_border_color?: string | null
          checkout_modal_button_color?: string | null
          checkout_modal_button_text_color?: string | null
          checkout_modal_description_color?: string | null
          checkout_modal_price_color?: string | null
          checkout_modal_title_color?: string | null
          created_at?: string | null
          description_color?: string | null
          description_font_size?: string | null
          dietary_tag_background_color?: string | null
          dietary_tag_border_color?: string | null
          dietary_tag_text_color?: string | null
          enable_animations?: boolean | null
          font_family_body?: string | null
          font_family_heading?: string | null
          footer_background_color?: string | null
          footer_border_color?: string | null
          footer_empty_summary_text?: string | null
          footer_shadow_color?: string | null
          header_background_color?: string | null
          header_button_background_color?: string | null
          header_button_icon_color?: string | null
          id?: string
          image_background_color?: string | null
          image_placeholder_color?: string | null
          mobile_overrides?: Json
          modal_background_color?: string | null
          modal_close_button_background?: string | null
          modal_close_button_color?: string | null
          original_price_color?: string | null
          page_background_color?: string | null
          page_background_gradient?: string | null
          popup_modal_background_color?: string | null
          popup_modal_border_color?: string | null
          popup_modal_button_color?: string | null
          popup_modal_button_text_color?: string | null
          popup_modal_description_color?: string | null
          popup_modal_price_color?: string | null
          popup_modal_title_color?: string | null
          product_name_color?: string | null
          product_name_font_size?: string | null
          product_name_font_weight?: string | null
          quantity_button_color?: string | null
          quantity_controls_background?: string | null
          quantity_text_color?: string | null
          related_item_background_color?: string | null
          related_item_name_color?: string | null
          related_item_price_color?: string | null
          related_section_title_color?: string | null
          related_section_title_font_size?: string | null
          sale_badge_background_color?: string | null
          sale_badge_text_color?: string | null
          section_padding?: string | null
          summary_text_color?: string | null
          tenant_id?: string
          total_price_color?: string | null
          updated_at?: string | null
          variation_option_background_color?: string | null
          variation_option_border_color?: string | null
          variation_option_selected_background_color?: string | null
          variation_option_selected_border_color?: string | null
          variation_option_selected_text_color?: string | null
          variation_option_text_color?: string | null
          variation_optional_text?: string | null
          variation_price_modifier_color?: string | null
          variation_required_badge_color?: string | null
          variation_required_text?: string | null
          variation_section_title_color?: string | null
          variation_section_title_font_size?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "product_detail_settings_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: true
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      push_tokens: {
        Row: {
          created_at: string
          id: string
          platform: string
          tenant_id: string
          token: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          platform: string
          tenant_id: string
          token: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          platform?: string
          tenant_id?: string
          token?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "push_tokens_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      recipe_components: {
        Row: {
          created_at: string | null
          id: string
          inventory_item_id: string
          quantity: number
          recipe_id: string
          sort_order: number
          tenant_id: string
          unit_id: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          inventory_item_id: string
          quantity?: number
          recipe_id: string
          sort_order?: number
          tenant_id: string
          unit_id: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string
          inventory_item_id?: string
          quantity?: number
          recipe_id?: string
          sort_order?: number
          tenant_id?: string
          unit_id?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "recipe_components_inventory_item_id_fkey"
            columns: ["inventory_item_id"]
            isOneToOne: false
            referencedRelation: "inventory_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recipe_components_recipe_id_fkey"
            columns: ["recipe_id"]
            isOneToOne: false
            referencedRelation: "recipes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recipe_components_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recipe_components_unit_id_fkey"
            columns: ["unit_id"]
            isOneToOne: false
            referencedRelation: "inventory_units"
            referencedColumns: ["id"]
          },
        ]
      }
      recipes: {
        Row: {
          addon_id: string | null
          created_at: string | null
          id: string
          menu_item_id: string | null
          modifier_option_id: string | null
          notes: string | null
          prep_item_id: string | null
          target_type: string
          tenant_id: string
          updated_at: string | null
          variation_option_id: string | null
          yield_quantity: number | null
          yield_unit_id: string | null
        }
        Insert: {
          addon_id?: string | null
          created_at?: string | null
          id?: string
          menu_item_id?: string | null
          modifier_option_id?: string | null
          notes?: string | null
          prep_item_id?: string | null
          target_type: string
          tenant_id: string
          updated_at?: string | null
          variation_option_id?: string | null
          yield_quantity?: number | null
          yield_unit_id?: string | null
        }
        Update: {
          addon_id?: string | null
          created_at?: string | null
          id?: string
          menu_item_id?: string | null
          modifier_option_id?: string | null
          notes?: string | null
          prep_item_id?: string | null
          target_type?: string
          tenant_id?: string
          updated_at?: string | null
          variation_option_id?: string | null
          yield_quantity?: number | null
          yield_unit_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "recipes_menu_item_id_fkey"
            columns: ["menu_item_id"]
            isOneToOne: false
            referencedRelation: "menu_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recipes_prep_item_id_fkey"
            columns: ["prep_item_id"]
            isOneToOne: false
            referencedRelation: "inventory_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recipes_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recipes_yield_unit_id_fkey"
            columns: ["yield_unit_id"]
            isOneToOne: false
            referencedRelation: "inventory_units"
            referencedColumns: ["id"]
          },
        ]
      }
      sms_campaign_runs: {
        Row: {
          campaign_id: string
          claimed_at: string | null
          claimed_by_device: string | null
          completed_at: string | null
          created_at: string
          due_at: string
          id: string
          started_at: string | null
          status: string
          tenant_id: string
        }
        Insert: {
          campaign_id: string
          claimed_at?: string | null
          claimed_by_device?: string | null
          completed_at?: string | null
          created_at?: string
          due_at: string
          id?: string
          started_at?: string | null
          status?: string
          tenant_id: string
        }
        Update: {
          campaign_id?: string
          claimed_at?: string | null
          claimed_by_device?: string | null
          completed_at?: string | null
          created_at?: string
          due_at?: string
          id?: string
          started_at?: string | null
          status?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "sms_campaign_runs_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "sms_campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sms_campaign_runs_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      sms_campaigns: {
        Row: {
          audience: Json
          created_at: string
          created_by: string | null
          id: string
          max_per_run: number
          message_template: string
          name: string
          quiet_hours_end: string
          quiet_hours_start: string
          schedule_date: string | null
          schedule_interval_days: number | null
          schedule_kind: string
          schedule_time: string
          schedule_weekdays: number[]
          status: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          audience?: Json
          created_at?: string
          created_by?: string | null
          id?: string
          max_per_run?: number
          message_template: string
          name: string
          quiet_hours_end?: string
          quiet_hours_start?: string
          schedule_date?: string | null
          schedule_interval_days?: number | null
          schedule_kind?: string
          schedule_time?: string
          schedule_weekdays?: number[]
          status?: string
          tenant_id: string
          updated_at?: string
        }
        Update: {
          audience?: Json
          created_at?: string
          created_by?: string | null
          id?: string
          max_per_run?: number
          message_template?: string
          name?: string
          quiet_hours_end?: string
          quiet_hours_start?: string
          schedule_date?: string | null
          schedule_interval_days?: number | null
          schedule_kind?: string
          schedule_time?: string
          schedule_weekdays?: number[]
          status?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "sms_campaigns_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      sms_sends: {
        Row: {
          customer_id: string | null
          error_code: string | null
          error_message: string | null
          id: string
          message_body: string
          phone_e164: string
          result: string
          run_id: string
          sent_at: string
          tenant_id: string
        }
        Insert: {
          customer_id?: string | null
          error_code?: string | null
          error_message?: string | null
          id?: string
          message_body: string
          phone_e164: string
          result: string
          run_id: string
          sent_at?: string
          tenant_id: string
        }
        Update: {
          customer_id?: string | null
          error_code?: string | null
          error_message?: string | null
          id?: string
          message_body?: string
          phone_e164?: string
          result?: string
          run_id?: string
          sent_at?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "sms_sends_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sms_sends_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "sms_campaign_runs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sms_sends_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      sms_suppressions: {
        Row: {
          created_at: string
          id: string
          phone_e164: string
          reason: string | null
          tenant_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          phone_e164: string
          reason?: string | null
          tenant_id: string
        }
        Update: {
          created_at?: string
          id?: string
          phone_e164?: string
          reason?: string | null
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "sms_suppressions_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      stock_alerts: {
        Row: {
          created_at: string | null
          id: string
          inventory_item_id: string
          level: string
          outlet_id: string | null
          quantity: number
          reorder_level: number
          resolved_at: string | null
          tenant_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          inventory_item_id: string
          level: string
          outlet_id?: string | null
          quantity: number
          reorder_level?: number
          resolved_at?: string | null
          tenant_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          inventory_item_id?: string
          level?: string
          outlet_id?: string | null
          quantity?: number
          reorder_level?: number
          resolved_at?: string | null
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "stock_alerts_inventory_item_id_fkey"
            columns: ["inventory_item_id"]
            isOneToOne: false
            referencedRelation: "inventory_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_alerts_outlet_id_fkey"
            columns: ["outlet_id"]
            isOneToOne: false
            referencedRelation: "outlets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_alerts_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      stock_movements: {
        Row: {
          balance_after: number
          created_at: string | null
          created_by: string | null
          entered_quantity: number | null
          entered_unit_id: string | null
          id: string
          inventory_count_id: string | null
          inventory_item_id: string
          note: string | null
          order_id: string | null
          outlet_id: string | null
          quantity_delta: number
          reason: string
          stock_transfer_id: string | null
          target_qty: number | null
          tenant_id: string
          unit_cost: number | null
        }
        Insert: {
          balance_after?: number
          created_at?: string | null
          created_by?: string | null
          entered_quantity?: number | null
          entered_unit_id?: string | null
          id?: string
          inventory_count_id?: string | null
          inventory_item_id: string
          note?: string | null
          order_id?: string | null
          outlet_id?: string | null
          quantity_delta: number
          reason: string
          stock_transfer_id?: string | null
          target_qty?: number | null
          tenant_id: string
          unit_cost?: number | null
        }
        Update: {
          balance_after?: number
          created_at?: string | null
          created_by?: string | null
          entered_quantity?: number | null
          entered_unit_id?: string | null
          id?: string
          inventory_count_id?: string | null
          inventory_item_id?: string
          note?: string | null
          order_id?: string | null
          outlet_id?: string | null
          quantity_delta?: number
          reason?: string
          stock_transfer_id?: string | null
          target_qty?: number | null
          tenant_id?: string
          unit_cost?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "stock_movements_entered_unit_id_fkey"
            columns: ["entered_unit_id"]
            isOneToOne: false
            referencedRelation: "inventory_units"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_movements_inventory_count_id_fkey"
            columns: ["inventory_count_id"]
            isOneToOne: false
            referencedRelation: "inventory_counts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_movements_inventory_item_id_fkey"
            columns: ["inventory_item_id"]
            isOneToOne: false
            referencedRelation: "inventory_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_movements_outlet_id_fkey"
            columns: ["outlet_id"]
            isOneToOne: false
            referencedRelation: "outlets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_movements_stock_transfer_id_fkey"
            columns: ["stock_transfer_id"]
            isOneToOne: false
            referencedRelation: "stock_transfers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_movements_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      stock_transfer_lines: {
        Row: {
          created_at: string
          id: string
          inventory_item_id: string
          received_quantity: number | null
          sent_quantity: number
          tenant_id: string
          transfer_id: string
          unit_cost: number | null
        }
        Insert: {
          created_at?: string
          id?: string
          inventory_item_id: string
          received_quantity?: number | null
          sent_quantity: number
          tenant_id: string
          transfer_id: string
          unit_cost?: number | null
        }
        Update: {
          created_at?: string
          id?: string
          inventory_item_id?: string
          received_quantity?: number | null
          sent_quantity?: number
          tenant_id?: string
          transfer_id?: string
          unit_cost?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "stock_transfer_lines_inventory_item_id_fkey"
            columns: ["inventory_item_id"]
            isOneToOne: false
            referencedRelation: "inventory_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_transfer_lines_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_transfer_lines_transfer_id_fkey"
            columns: ["transfer_id"]
            isOneToOne: false
            referencedRelation: "stock_transfers"
            referencedColumns: ["id"]
          },
        ]
      }
      stock_transfers: {
        Row: {
          created_at: string
          created_by: string | null
          from_outlet_id: string | null
          id: string
          note: string | null
          received_at: string | null
          received_by: string | null
          sent_at: string | null
          sent_by: string | null
          status: string
          tenant_id: string
          to_outlet_id: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          from_outlet_id?: string | null
          id?: string
          note?: string | null
          received_at?: string | null
          received_by?: string | null
          sent_at?: string | null
          sent_by?: string | null
          status?: string
          tenant_id: string
          to_outlet_id?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          from_outlet_id?: string | null
          id?: string
          note?: string | null
          received_at?: string | null
          received_by?: string | null
          sent_at?: string | null
          sent_by?: string | null
          status?: string
          tenant_id?: string
          to_outlet_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "stock_transfers_from_outlet_id_fkey"
            columns: ["from_outlet_id"]
            isOneToOne: false
            referencedRelation: "outlets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_transfers_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_transfers_to_outlet_id_fkey"
            columns: ["to_outlet_id"]
            isOneToOne: false
            referencedRelation: "outlets"
            referencedColumns: ["id"]
          },
        ]
      }
      subscription_payments: {
        Row: {
          amount_php: number
          created_at: string
          id: string
          method: string | null
          note: string | null
          paid_at: string
          period_end: string
          period_start: string
          recorded_by: string | null
          reference: string | null
          tenant_id: string
        }
        Insert: {
          amount_php: number
          created_at?: string
          id?: string
          method?: string | null
          note?: string | null
          paid_at?: string
          period_end: string
          period_start: string
          recorded_by?: string | null
          reference?: string | null
          tenant_id: string
        }
        Update: {
          amount_php?: number
          created_at?: string
          id?: string
          method?: string | null
          note?: string | null
          paid_at?: string
          period_end?: string
          period_start?: string
          recorded_by?: string | null
          reference?: string | null
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "subscription_payments_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      tag_definitions: {
        Row: {
          created_at: string
          group_name: string
          id: string
          is_preset: boolean
          tag_value: string
          tenant_id: string | null
        }
        Insert: {
          created_at?: string
          group_name: string
          id?: string
          is_preset?: boolean
          tag_value: string
          tenant_id?: string | null
        }
        Update: {
          created_at?: string
          group_name?: string
          id?: string
          is_preset?: boolean
          tag_value?: string
          tenant_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "tag_definitions_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      tenant_subscriptions: {
        Row: {
          cancelled_at: string | null
          grace_days: number
          monthly_price_php: number
          notes: string | null
          paid_through: string | null
          started_at: string
          status: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          cancelled_at?: string | null
          grace_days?: number
          monthly_price_php?: number
          notes?: string | null
          paid_through?: string | null
          started_at?: string
          status?: string
          tenant_id: string
          updated_at?: string
        }
        Update: {
          cancelled_at?: string | null
          grace_days?: number
          monthly_price_php?: number
          notes?: string | null
          paid_through?: string | null
          started_at?: string
          status?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "tenant_subscriptions_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: true
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      tenants: {
        Row: {
          accent_color: string | null
          admin_email: string | null
          android_package_name: string | null
          announcement_bg_color: string | null
          announcement_text: string | null
          announcement_text_color: string | null
          app_enabled: boolean | null
          auto_86_enabled: boolean
          background_color: string | null
          background_image_attachment: string | null
          background_image_fit: string | null
          background_image_opacity: number | null
          background_image_position: string | null
          background_image_url: string | null
          background_overlay_color: string | null
          background_overlay_opacity: number | null
          border_color: string | null
          brand_color: string | null
          bundles_enabled: boolean | null
          button_primary_color: string | null
          button_primary_text_color: string | null
          button_secondary_color: string | null
          button_secondary_text_color: string | null
          card_description_color: string | null
          card_price_color: string | null
          card_roundness: string | null
          card_template: string | null
          card_title_color: string | null
          cards_border_color: string | null
          cards_color: string | null
          cart_accent_color: string | null
          cart_background_color: string | null
          cart_border_color: string | null
          cart_button_color: string | null
          cart_button_text_color: string | null
          cart_card_background_color: string | null
          cart_muted_text_color: string | null
          cart_summary_background_color: string | null
          cart_template: string | null
          cart_text_color: string | null
          category_nav_style: string | null
          checkout_accent_color: string | null
          checkout_background_color: string | null
          checkout_border_color: string | null
          checkout_button_color: string | null
          checkout_button_text_color: string | null
          checkout_card_background_color: string | null
          checkout_modal_background_color: string | null
          checkout_modal_border_color: string | null
          checkout_modal_button_color: string | null
          checkout_modal_button_text_color: string | null
          checkout_modal_description_color: string | null
          checkout_modal_price_color: string | null
          checkout_modal_title_color: string | null
          checkout_muted_text_color: string | null
          checkout_summary_background_color: string | null
          checkout_template: string | null
          checkout_text_color: string | null
          checkout_upsell_enabled: boolean | null
          checkout_upsell_max_items: number | null
          checkout_upsell_subtitle: string | null
          checkout_upsell_title: string | null
          convex_deploy_key: string | null
          convex_deployment_url: string | null
          convex_schema_version: string | null
          created_at: string
          delivery_min_fee: number | null
          delivery_price_per_km: number | null
          delivery_radius_km: number | null
          distance_delivery_enabled: boolean
          domain: string | null
          email_notifications_enabled: boolean | null
          enable_order_management: boolean | null
          enforce_operating_hours: boolean
          error_color: string | null
          facebook_page_id: string | null
          flash_screen_background_color: string | null
          flash_screen_duration_ms: number | null
          flash_screen_feature_enabled: boolean | null
          flash_screen_image_url: string | null
          flash_screen_is_active: boolean | null
          flash_screen_subtitle: string | null
          flash_screen_text_color: string | null
          flash_screen_title: string | null
          font_pair: string | null
          footer_about_us: string | null
          footer_address: string | null
          footer_background_color: string | null
          footer_border_color: string | null
          footer_business_name: string | null
          footer_copyright_text: string | null
          footer_email: string | null
          footer_enabled: boolean
          footer_facebook_name: string | null
          footer_facebook_url: string | null
          footer_heading_color: string | null
          footer_icon_background_color: string | null
          footer_icon_color: string | null
          footer_instagram_name: string | null
          footer_instagram_url: string | null
          footer_link_color: string | null
          footer_logo_url: string | null
          footer_muted_color: string | null
          footer_phone: string | null
          footer_powered_by_text: string | null
          footer_privacy_policy: string | null
          footer_refund_policy: string | null
          footer_show_powered_by: boolean
          footer_tagline: string | null
          footer_terms_of_service: string | null
          footer_text_color: string | null
          footer_theme: string
          footer_tiktok_name: string | null
          footer_tiktok_url: string | null
          footer_twitter_name: string | null
          footer_twitter_url: string | null
          footer_viber: string | null
          footer_whatsapp: string | null
          footer_youtube_name: string | null
          footer_youtube_url: string | null
          header_blur: boolean
          header_color: string | null
          header_font_color: string | null
          header_height: string
          header_logo_shape: string
          header_shadow: boolean
          header_show_cart: boolean
          header_show_logo: boolean
          header_show_name: boolean
          header_show_search: boolean
          header_sticky: boolean
          header_tagline: string | null
          header_tagline_color: string | null
          header_template: string
          hero_background_color: string | null
          hero_cta_primary_color: string | null
          hero_cta_primary_label: string | null
          hero_cta_primary_text_color: string | null
          hero_cta_secondary_label: string | null
          hero_cta_secondary_text_color: string | null
          hero_description: string | null
          hero_description_color: string | null
          hero_design: string | null
          hero_featured_product_id: string | null
          hero_image_url: string | null
          hero_kicker: string | null
          hero_kicker_color: string | null
          hero_link_url: string | null
          hero_preset: string | null
          hero_section_enabled: boolean
          hero_title: string | null
          hero_title_color: string | null
          hide_currency_symbol: boolean | null
          id: string
          inventory_enabled: boolean
          ios_app_store_id: string | null
          is_active: boolean
          is_announcement_visible: boolean | null
          is_promotion_visible: boolean | null
          lalamove_api_key: string | null
          lalamove_enabled: boolean | null
          lalamove_market: string | null
          lalamove_sandbox: boolean | null
          lalamove_secret_key: string | null
          lalamove_sender_name: string | null
          lalamove_sender_phone: string | null
          lalamove_service_type: string | null
          link_color: string | null
          logo_url: string
          low_stock_alerts_enabled: boolean
          mapbox_enabled: boolean | null
          max_outlets: number
          max_staff_per_branch: number
          menu_cart_badge_background_color: string | null
          menu_cart_badge_text_color: string | null
          menu_category_active_color: string | null
          menu_category_header_color: string | null
          menu_category_inactive_color: string | null
          menu_engineering_enabled: boolean | null
          menu_main_header_subtitle_color: string | null
          menu_main_header_text_color: string | null
          messenger_page_access_token: string | null
          messenger_page_id: string
          messenger_page_name: string | null
          messenger_redirect_enabled: boolean
          messenger_redirect_mode: string | null
          messenger_username: string | null
          mobile_card_template: string | null
          mobile_grid_columns: number | null
          mobile_header_template: string | null
          mobile_overrides: Json
          mobile_page_layout: string | null
          modal_background_color: string | null
          modal_description_color: string | null
          modal_price_color: string | null
          modal_title_color: string | null
          modifier_groups_enabled: boolean
          multi_branch_enabled: boolean
          name: string
          operating_hours: Json | null
          order_backend: string
          outlet_selection_timing: string
          page_layout: string | null
          pairing_rules_enabled: boolean | null
          primary_color: string
          promotion_banners: Json | null
          promotion_image_url: string | null
          qr_handoff_enabled: boolean
          restaurant_address: string | null
          restaurant_latitude: number | null
          restaurant_longitude: number | null
          search_bar_background: string | null
          search_bar_border: string | null
          search_bar_enabled: boolean
          search_bar_focus_ring: string | null
          search_bar_icon: string | null
          search_bar_placeholder: string | null
          search_bar_radius: string | null
          search_bar_style: string | null
          search_bar_text: string | null
          secondary_color: string
          shadow_color: string | null
          slug: string
          storefront_palette: string | null
          success_color: string | null
          supabase_order_anon_key: string | null
          supabase_order_db_url: string | null
          supabase_order_schema_version: number | null
          supabase_order_service_key: string | null
          supabase_order_url: string | null
          text_muted_color: string | null
          text_primary_color: string | null
          text_secondary_color: string | null
          timezone: string
          updated_at: string
          warning_color: string | null
        }
        Insert: {
          accent_color?: string | null
          admin_email?: string | null
          android_package_name?: string | null
          announcement_bg_color?: string | null
          announcement_text?: string | null
          announcement_text_color?: string | null
          app_enabled?: boolean | null
          auto_86_enabled?: boolean
          background_color?: string | null
          background_image_attachment?: string | null
          background_image_fit?: string | null
          background_image_opacity?: number | null
          background_image_position?: string | null
          background_image_url?: string | null
          background_overlay_color?: string | null
          background_overlay_opacity?: number | null
          border_color?: string | null
          brand_color?: string | null
          bundles_enabled?: boolean | null
          button_primary_color?: string | null
          button_primary_text_color?: string | null
          button_secondary_color?: string | null
          button_secondary_text_color?: string | null
          card_description_color?: string | null
          card_price_color?: string | null
          card_roundness?: string | null
          card_template?: string | null
          card_title_color?: string | null
          cards_border_color?: string | null
          cards_color?: string | null
          cart_accent_color?: string | null
          cart_background_color?: string | null
          cart_border_color?: string | null
          cart_button_color?: string | null
          cart_button_text_color?: string | null
          cart_card_background_color?: string | null
          cart_muted_text_color?: string | null
          cart_summary_background_color?: string | null
          cart_template?: string | null
          cart_text_color?: string | null
          category_nav_style?: string | null
          checkout_accent_color?: string | null
          checkout_background_color?: string | null
          checkout_border_color?: string | null
          checkout_button_color?: string | null
          checkout_button_text_color?: string | null
          checkout_card_background_color?: string | null
          checkout_modal_background_color?: string | null
          checkout_modal_border_color?: string | null
          checkout_modal_button_color?: string | null
          checkout_modal_button_text_color?: string | null
          checkout_modal_description_color?: string | null
          checkout_modal_price_color?: string | null
          checkout_modal_title_color?: string | null
          checkout_muted_text_color?: string | null
          checkout_summary_background_color?: string | null
          checkout_template?: string | null
          checkout_text_color?: string | null
          checkout_upsell_enabled?: boolean | null
          checkout_upsell_max_items?: number | null
          checkout_upsell_subtitle?: string | null
          checkout_upsell_title?: string | null
          convex_deploy_key?: string | null
          convex_deployment_url?: string | null
          convex_schema_version?: string | null
          created_at?: string
          delivery_min_fee?: number | null
          delivery_price_per_km?: number | null
          delivery_radius_km?: number | null
          distance_delivery_enabled?: boolean
          domain?: string | null
          email_notifications_enabled?: boolean | null
          enable_order_management?: boolean | null
          enforce_operating_hours?: boolean
          error_color?: string | null
          facebook_page_id?: string | null
          flash_screen_background_color?: string | null
          flash_screen_duration_ms?: number | null
          flash_screen_feature_enabled?: boolean | null
          flash_screen_image_url?: string | null
          flash_screen_is_active?: boolean | null
          flash_screen_subtitle?: string | null
          flash_screen_text_color?: string | null
          flash_screen_title?: string | null
          font_pair?: string | null
          footer_about_us?: string | null
          footer_address?: string | null
          footer_background_color?: string | null
          footer_border_color?: string | null
          footer_business_name?: string | null
          footer_copyright_text?: string | null
          footer_email?: string | null
          footer_enabled?: boolean
          footer_facebook_name?: string | null
          footer_facebook_url?: string | null
          footer_heading_color?: string | null
          footer_icon_background_color?: string | null
          footer_icon_color?: string | null
          footer_instagram_name?: string | null
          footer_instagram_url?: string | null
          footer_link_color?: string | null
          footer_logo_url?: string | null
          footer_muted_color?: string | null
          footer_phone?: string | null
          footer_powered_by_text?: string | null
          footer_privacy_policy?: string | null
          footer_refund_policy?: string | null
          footer_show_powered_by?: boolean
          footer_tagline?: string | null
          footer_terms_of_service?: string | null
          footer_text_color?: string | null
          footer_theme?: string
          footer_tiktok_name?: string | null
          footer_tiktok_url?: string | null
          footer_twitter_name?: string | null
          footer_twitter_url?: string | null
          footer_viber?: string | null
          footer_whatsapp?: string | null
          footer_youtube_name?: string | null
          footer_youtube_url?: string | null
          header_blur?: boolean
          header_color?: string | null
          header_font_color?: string | null
          header_height?: string
          header_logo_shape?: string
          header_shadow?: boolean
          header_show_cart?: boolean
          header_show_logo?: boolean
          header_show_name?: boolean
          header_show_search?: boolean
          header_sticky?: boolean
          header_tagline?: string | null
          header_tagline_color?: string | null
          header_template?: string
          hero_background_color?: string | null
          hero_cta_primary_color?: string | null
          hero_cta_primary_label?: string | null
          hero_cta_primary_text_color?: string | null
          hero_cta_secondary_label?: string | null
          hero_cta_secondary_text_color?: string | null
          hero_description?: string | null
          hero_description_color?: string | null
          hero_design?: string | null
          hero_featured_product_id?: string | null
          hero_image_url?: string | null
          hero_kicker?: string | null
          hero_kicker_color?: string | null
          hero_link_url?: string | null
          hero_preset?: string | null
          hero_section_enabled?: boolean
          hero_title?: string | null
          hero_title_color?: string | null
          hide_currency_symbol?: boolean | null
          id?: string
          inventory_enabled?: boolean
          ios_app_store_id?: string | null
          is_active?: boolean
          is_announcement_visible?: boolean | null
          is_promotion_visible?: boolean | null
          lalamove_api_key?: string | null
          lalamove_enabled?: boolean | null
          lalamove_market?: string | null
          lalamove_sandbox?: boolean | null
          lalamove_secret_key?: string | null
          lalamove_sender_name?: string | null
          lalamove_sender_phone?: string | null
          lalamove_service_type?: string | null
          link_color?: string | null
          logo_url?: string
          low_stock_alerts_enabled?: boolean
          mapbox_enabled?: boolean | null
          max_outlets?: number
          max_staff_per_branch?: number
          menu_cart_badge_background_color?: string | null
          menu_cart_badge_text_color?: string | null
          menu_category_active_color?: string | null
          menu_category_header_color?: string | null
          menu_category_inactive_color?: string | null
          menu_engineering_enabled?: boolean | null
          menu_main_header_subtitle_color?: string | null
          menu_main_header_text_color?: string | null
          messenger_page_access_token?: string | null
          messenger_page_id?: string
          messenger_page_name?: string | null
          messenger_redirect_enabled?: boolean
          messenger_redirect_mode?: string | null
          messenger_username?: string | null
          mobile_card_template?: string | null
          mobile_grid_columns?: number | null
          mobile_header_template?: string | null
          mobile_overrides?: Json
          mobile_page_layout?: string | null
          modal_background_color?: string | null
          modal_description_color?: string | null
          modal_price_color?: string | null
          modal_title_color?: string | null
          modifier_groups_enabled?: boolean
          multi_branch_enabled?: boolean
          name: string
          operating_hours?: Json | null
          order_backend?: string
          outlet_selection_timing?: string
          page_layout?: string | null
          pairing_rules_enabled?: boolean | null
          primary_color?: string
          promotion_banners?: Json | null
          promotion_image_url?: string | null
          qr_handoff_enabled?: boolean
          restaurant_address?: string | null
          restaurant_latitude?: number | null
          restaurant_longitude?: number | null
          search_bar_background?: string | null
          search_bar_border?: string | null
          search_bar_enabled?: boolean
          search_bar_focus_ring?: string | null
          search_bar_icon?: string | null
          search_bar_placeholder?: string | null
          search_bar_radius?: string | null
          search_bar_style?: string | null
          search_bar_text?: string | null
          secondary_color?: string
          shadow_color?: string | null
          slug: string
          storefront_palette?: string | null
          success_color?: string | null
          supabase_order_anon_key?: string | null
          supabase_order_db_url?: string | null
          supabase_order_schema_version?: number | null
          supabase_order_service_key?: string | null
          supabase_order_url?: string | null
          text_muted_color?: string | null
          text_primary_color?: string | null
          text_secondary_color?: string | null
          timezone?: string
          updated_at?: string
          warning_color?: string | null
        }
        Update: {
          accent_color?: string | null
          admin_email?: string | null
          android_package_name?: string | null
          announcement_bg_color?: string | null
          announcement_text?: string | null
          announcement_text_color?: string | null
          app_enabled?: boolean | null
          auto_86_enabled?: boolean
          background_color?: string | null
          background_image_attachment?: string | null
          background_image_fit?: string | null
          background_image_opacity?: number | null
          background_image_position?: string | null
          background_image_url?: string | null
          background_overlay_color?: string | null
          background_overlay_opacity?: number | null
          border_color?: string | null
          brand_color?: string | null
          bundles_enabled?: boolean | null
          button_primary_color?: string | null
          button_primary_text_color?: string | null
          button_secondary_color?: string | null
          button_secondary_text_color?: string | null
          card_description_color?: string | null
          card_price_color?: string | null
          card_roundness?: string | null
          card_template?: string | null
          card_title_color?: string | null
          cards_border_color?: string | null
          cards_color?: string | null
          cart_accent_color?: string | null
          cart_background_color?: string | null
          cart_border_color?: string | null
          cart_button_color?: string | null
          cart_button_text_color?: string | null
          cart_card_background_color?: string | null
          cart_muted_text_color?: string | null
          cart_summary_background_color?: string | null
          cart_template?: string | null
          cart_text_color?: string | null
          category_nav_style?: string | null
          checkout_accent_color?: string | null
          checkout_background_color?: string | null
          checkout_border_color?: string | null
          checkout_button_color?: string | null
          checkout_button_text_color?: string | null
          checkout_card_background_color?: string | null
          checkout_modal_background_color?: string | null
          checkout_modal_border_color?: string | null
          checkout_modal_button_color?: string | null
          checkout_modal_button_text_color?: string | null
          checkout_modal_description_color?: string | null
          checkout_modal_price_color?: string | null
          checkout_modal_title_color?: string | null
          checkout_muted_text_color?: string | null
          checkout_summary_background_color?: string | null
          checkout_template?: string | null
          checkout_text_color?: string | null
          checkout_upsell_enabled?: boolean | null
          checkout_upsell_max_items?: number | null
          checkout_upsell_subtitle?: string | null
          checkout_upsell_title?: string | null
          convex_deploy_key?: string | null
          convex_deployment_url?: string | null
          convex_schema_version?: string | null
          created_at?: string
          delivery_min_fee?: number | null
          delivery_price_per_km?: number | null
          delivery_radius_km?: number | null
          distance_delivery_enabled?: boolean
          domain?: string | null
          email_notifications_enabled?: boolean | null
          enable_order_management?: boolean | null
          enforce_operating_hours?: boolean
          error_color?: string | null
          facebook_page_id?: string | null
          flash_screen_background_color?: string | null
          flash_screen_duration_ms?: number | null
          flash_screen_feature_enabled?: boolean | null
          flash_screen_image_url?: string | null
          flash_screen_is_active?: boolean | null
          flash_screen_subtitle?: string | null
          flash_screen_text_color?: string | null
          flash_screen_title?: string | null
          font_pair?: string | null
          footer_about_us?: string | null
          footer_address?: string | null
          footer_background_color?: string | null
          footer_border_color?: string | null
          footer_business_name?: string | null
          footer_copyright_text?: string | null
          footer_email?: string | null
          footer_enabled?: boolean
          footer_facebook_name?: string | null
          footer_facebook_url?: string | null
          footer_heading_color?: string | null
          footer_icon_background_color?: string | null
          footer_icon_color?: string | null
          footer_instagram_name?: string | null
          footer_instagram_url?: string | null
          footer_link_color?: string | null
          footer_logo_url?: string | null
          footer_muted_color?: string | null
          footer_phone?: string | null
          footer_powered_by_text?: string | null
          footer_privacy_policy?: string | null
          footer_refund_policy?: string | null
          footer_show_powered_by?: boolean
          footer_tagline?: string | null
          footer_terms_of_service?: string | null
          footer_text_color?: string | null
          footer_theme?: string
          footer_tiktok_name?: string | null
          footer_tiktok_url?: string | null
          footer_twitter_name?: string | null
          footer_twitter_url?: string | null
          footer_viber?: string | null
          footer_whatsapp?: string | null
          footer_youtube_name?: string | null
          footer_youtube_url?: string | null
          header_blur?: boolean
          header_color?: string | null
          header_font_color?: string | null
          header_height?: string
          header_logo_shape?: string
          header_shadow?: boolean
          header_show_cart?: boolean
          header_show_logo?: boolean
          header_show_name?: boolean
          header_show_search?: boolean
          header_sticky?: boolean
          header_tagline?: string | null
          header_tagline_color?: string | null
          header_template?: string
          hero_background_color?: string | null
          hero_cta_primary_color?: string | null
          hero_cta_primary_label?: string | null
          hero_cta_primary_text_color?: string | null
          hero_cta_secondary_label?: string | null
          hero_cta_secondary_text_color?: string | null
          hero_description?: string | null
          hero_description_color?: string | null
          hero_design?: string | null
          hero_featured_product_id?: string | null
          hero_image_url?: string | null
          hero_kicker?: string | null
          hero_kicker_color?: string | null
          hero_link_url?: string | null
          hero_preset?: string | null
          hero_section_enabled?: boolean
          hero_title?: string | null
          hero_title_color?: string | null
          hide_currency_symbol?: boolean | null
          id?: string
          inventory_enabled?: boolean
          ios_app_store_id?: string | null
          is_active?: boolean
          is_announcement_visible?: boolean | null
          is_promotion_visible?: boolean | null
          lalamove_api_key?: string | null
          lalamove_enabled?: boolean | null
          lalamove_market?: string | null
          lalamove_sandbox?: boolean | null
          lalamove_secret_key?: string | null
          lalamove_sender_name?: string | null
          lalamove_sender_phone?: string | null
          lalamove_service_type?: string | null
          link_color?: string | null
          logo_url?: string
          low_stock_alerts_enabled?: boolean
          mapbox_enabled?: boolean | null
          max_outlets?: number
          max_staff_per_branch?: number
          menu_cart_badge_background_color?: string | null
          menu_cart_badge_text_color?: string | null
          menu_category_active_color?: string | null
          menu_category_header_color?: string | null
          menu_category_inactive_color?: string | null
          menu_engineering_enabled?: boolean | null
          menu_main_header_subtitle_color?: string | null
          menu_main_header_text_color?: string | null
          messenger_page_access_token?: string | null
          messenger_page_id?: string
          messenger_page_name?: string | null
          messenger_redirect_enabled?: boolean
          messenger_redirect_mode?: string | null
          messenger_username?: string | null
          mobile_card_template?: string | null
          mobile_grid_columns?: number | null
          mobile_header_template?: string | null
          mobile_overrides?: Json
          mobile_page_layout?: string | null
          modal_background_color?: string | null
          modal_description_color?: string | null
          modal_price_color?: string | null
          modal_title_color?: string | null
          modifier_groups_enabled?: boolean
          multi_branch_enabled?: boolean
          name?: string
          operating_hours?: Json | null
          order_backend?: string
          outlet_selection_timing?: string
          page_layout?: string | null
          pairing_rules_enabled?: boolean | null
          primary_color?: string
          promotion_banners?: Json | null
          promotion_image_url?: string | null
          qr_handoff_enabled?: boolean
          restaurant_address?: string | null
          restaurant_latitude?: number | null
          restaurant_longitude?: number | null
          search_bar_background?: string | null
          search_bar_border?: string | null
          search_bar_enabled?: boolean
          search_bar_focus_ring?: string | null
          search_bar_icon?: string | null
          search_bar_placeholder?: string | null
          search_bar_radius?: string | null
          search_bar_style?: string | null
          search_bar_text?: string | null
          secondary_color?: string
          shadow_color?: string | null
          slug?: string
          storefront_palette?: string | null
          success_color?: string | null
          supabase_order_anon_key?: string | null
          supabase_order_db_url?: string | null
          supabase_order_schema_version?: number | null
          supabase_order_service_key?: string | null
          supabase_order_url?: string | null
          text_muted_color?: string | null
          text_primary_color?: string | null
          text_secondary_color?: string | null
          timezone?: string
          updated_at?: string
          warning_color?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "tenants_hero_featured_product_id_fkey"
            columns: ["hero_featured_product_id"]
            isOneToOne: false
            referencedRelation: "menu_items"
            referencedColumns: ["id"]
          },
        ]
      }
      upsell_pairs: {
        Row: {
          bcg_strategy: string | null
          created_at: string | null
          display_order: number | null
          id: string
          is_active: boolean | null
          is_auto_generated: boolean | null
          max_suggestions: number | null
          pair_type: string
          source_item_id: string
          source_label: string | null
          target_item_id: string
          target_label: string | null
          tenant_id: string
          updated_at: string | null
          upgrade_display_style: string | null
          upgrade_header: string | null
        }
        Insert: {
          bcg_strategy?: string | null
          created_at?: string | null
          display_order?: number | null
          id?: string
          is_active?: boolean | null
          is_auto_generated?: boolean | null
          max_suggestions?: number | null
          pair_type: string
          source_item_id: string
          source_label?: string | null
          target_item_id: string
          target_label?: string | null
          tenant_id: string
          updated_at?: string | null
          upgrade_display_style?: string | null
          upgrade_header?: string | null
        }
        Update: {
          bcg_strategy?: string | null
          created_at?: string | null
          display_order?: number | null
          id?: string
          is_active?: boolean | null
          is_auto_generated?: boolean | null
          max_suggestions?: number | null
          pair_type?: string
          source_item_id?: string
          source_label?: string | null
          target_item_id?: string
          target_label?: string | null
          tenant_id?: string
          updated_at?: string | null
          upgrade_display_style?: string | null
          upgrade_header?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "upsell_pairs_source_item_id_fkey"
            columns: ["source_item_id"]
            isOneToOne: false
            referencedRelation: "menu_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "upsell_pairs_target_item_id_fkey"
            columns: ["target_item_id"]
            isOneToOne: false
            referencedRelation: "menu_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "upsell_pairs_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      voucher_redemptions: {
        Row: {
          amount_discounted: number
          channel: string
          created_at: string
          customer_key: string | null
          id: string
          order_id: string
          outlet_id: string | null
          redeemed_by: string | null
          tenant_id: string
          voucher_id: string
        }
        Insert: {
          amount_discounted: number
          channel: string
          created_at?: string
          customer_key?: string | null
          id?: string
          order_id: string
          outlet_id?: string | null
          redeemed_by?: string | null
          tenant_id: string
          voucher_id: string
        }
        Update: {
          amount_discounted?: number
          channel?: string
          created_at?: string
          customer_key?: string | null
          id?: string
          order_id?: string
          outlet_id?: string | null
          redeemed_by?: string | null
          tenant_id?: string
          voucher_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "voucher_redemptions_outlet_id_fkey"
            columns: ["outlet_id"]
            isOneToOne: false
            referencedRelation: "outlets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "voucher_redemptions_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "voucher_redemptions_voucher_id_fkey"
            columns: ["voucher_id"]
            isOneToOne: false
            referencedRelation: "vouchers"
            referencedColumns: ["id"]
          },
        ]
      }
      voucher_targets: {
        Row: {
          created_at: string
          id: string
          target_id: string
          target_type: string
          voucher_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          target_id: string
          target_type: string
          voucher_id: string
        }
        Update: {
          created_at?: string
          id?: string
          target_id?: string
          target_type?: string
          voucher_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "voucher_targets_voucher_id_fkey"
            columns: ["voucher_id"]
            isOneToOne: false
            referencedRelation: "vouchers"
            referencedColumns: ["id"]
          },
        ]
      }
      vouchers: {
        Row: {
          channels: string[]
          code: string
          created_at: string
          created_by: string | null
          description: string | null
          discount_type: string
          discount_value: number
          ends_at: string | null
          id: string
          is_active: boolean
          is_stackable: boolean
          max_discount_amount: number | null
          min_order_amount: number
          name: string
          outlet_ids: string[] | null
          scope: string
          starts_at: string | null
          tenant_id: string
          updated_at: string
          usage_limit_per_customer: number | null
          usage_limit_total: number | null
          used_count: number
        }
        Insert: {
          channels?: string[]
          code: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          discount_type: string
          discount_value?: number
          ends_at?: string | null
          id?: string
          is_active?: boolean
          is_stackable?: boolean
          max_discount_amount?: number | null
          min_order_amount?: number
          name: string
          outlet_ids?: string[] | null
          scope?: string
          starts_at?: string | null
          tenant_id: string
          updated_at?: string
          usage_limit_per_customer?: number | null
          usage_limit_total?: number | null
          used_count?: number
        }
        Update: {
          channels?: string[]
          code?: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          discount_type?: string
          discount_value?: number
          ends_at?: string | null
          id?: string
          is_active?: boolean
          is_stackable?: boolean
          max_discount_amount?: number | null
          min_order_amount?: number
          name?: string
          outlet_ids?: string[] | null
          scope?: string
          starts_at?: string | null
          tenant_id?: string
          updated_at?: string
          usage_limit_per_customer?: number | null
          usage_limit_total?: number | null
          used_count?: number
        }
        Relationships: [
          {
            foreignKeyName: "vouchers_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      app_user_may_reach_branch: {
        Args: { target_outlet_id: string; target_tenant_id: string }
        Returns: boolean
      }
      app_user_may_see_order: {
        Args: { order_outlet_id: string; order_tenant_id: string }
        Returns: boolean
      }
      growth_coach_openrouter_key: { Args: never; Returns: string }
      initialize_order_types_for_tenant: {
        Args: { tenant_uuid: string }
        Returns: undefined
      }
      redeem_voucher: {
        Args: {
          p_amount: number
          p_channel: string
          p_customer_key?: string
          p_order_id: string
          p_outlet_id?: string
          p_redeemed_by?: string
          p_tenant_id: string
          p_voucher_id: string
        }
        Returns: string
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
