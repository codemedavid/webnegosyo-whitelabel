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
    PostgrestVersion: "13.0.5"
  }
  public: {
    Tables: {
      app_users: {
        Row: {
          created_at: string
          role: string
          tenant_id: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          role: string
          tenant_id?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          role?: string
          tenant_id?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "app_users_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      bundle_items: {
        Row: {
          bundle_id: string
          display_order: number
          id: string
          menu_item_id: string
          quantity: number
        }
        Insert: {
          bundle_id: string
          display_order?: number
          id?: string
          menu_item_id: string
          quantity?: number
        }
        Update: {
          bundle_id?: string
          display_order?: number
          id?: string
          menu_item_id?: string
          quantity?: number
        }
        Relationships: [
          {
            foreignKeyName: "bundle_items_bundle_id_fkey"
            columns: ["bundle_id"]
            isOneToOne: false
            referencedRelation: "bundles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bundle_items_menu_item_id_fkey"
            columns: ["menu_item_id"]
            isOneToOne: false
            referencedRelation: "menu_items"
            referencedColumns: ["id"]
          },
        ]
      }
      bundles: {
        Row: {
          created_at: string
          description: string | null
          discount_percent: number | null
          display_order: number
          fixed_price: number | null
          id: string
          image_url: string
          is_active: boolean
          name: string
          pricing_type: string
          show_as_upsell: boolean
          show_on_menu: boolean
          tenant_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          discount_percent?: number | null
          display_order?: number
          fixed_price?: number | null
          id?: string
          image_url?: string
          is_active?: boolean
          name: string
          pricing_type: string
          show_as_upsell?: boolean
          show_on_menu?: boolean
          tenant_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          discount_percent?: number | null
          display_order?: number
          fixed_price?: number | null
          id?: string
          image_url?: string
          is_active?: boolean
          name?: string
          pricing_type?: string
          show_as_upsell?: boolean
          show_on_menu?: boolean
          tenant_id?: string
          updated_at?: string
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
          default_addons: Json
          description: string | null
          display_layout: string
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
          default_addons?: Json
          description?: string | null
          display_layout?: string
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
          default_addons?: Json
          description?: string | null
          display_layout?: string
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
      complementary_pairs: {
        Row: {
          created_at: string
          display_order: number
          id: string
          is_active: boolean
          source_category_id: string | null
          source_item_id: string | null
          source_type: string
          target_item_id: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          display_order?: number
          id?: string
          is_active?: boolean
          source_category_id?: string | null
          source_item_id?: string | null
          source_type: string
          target_item_id: string
          tenant_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          display_order?: number
          id?: string
          is_active?: boolean
          source_category_id?: string | null
          source_item_id?: string | null
          source_type?: string
          target_item_id?: string
          tenant_id?: string
          updated_at?: string
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
      menu_items: {
        Row: {
          addons: Json
          badge_text: string | null
          bcg_classification: string | null
          category_id: string | null
          created_at: string
          description: string
          discounted_price: number | null
          id: string
          image_url: string
          is_available: boolean
          is_featured: boolean
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
          badge_text?: string | null
          bcg_classification?: string | null
          category_id?: string | null
          created_at?: string
          description: string
          discounted_price?: number | null
          id?: string
          image_url: string
          is_available?: boolean
          is_featured?: boolean
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
          badge_text?: string | null
          bcg_classification?: string | null
          category_id?: string | null
          created_at?: string
          description?: string
          discounted_price?: number | null
          id?: string
          image_url?: string
          is_available?: boolean
          is_featured?: boolean
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
      order_items: {
        Row: {
          addons: string[]
          id: string
          menu_item_id: string | null
          menu_item_name: string
          order_id: string
          price: number
          quantity: number
          special_instructions: string | null
          subtotal: number
          variation: string | null
        }
        Insert: {
          addons?: string[]
          id?: string
          menu_item_id?: string | null
          menu_item_name: string
          order_id: string
          price: number
          quantity?: number
          special_instructions?: string | null
          subtotal: number
          variation?: string | null
        }
        Update: {
          addons?: string[]
          id?: string
          menu_item_id?: string | null
          menu_item_name?: string
          order_id?: string
          price?: number
          quantity?: number
          special_instructions?: string | null
          subtotal?: number
          variation?: string | null
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
      order_types: {
        Row: {
          created_at: string
          description: string | null
          id: string
          is_enabled: boolean
          name: string
          note: string | null
          order_index: number
          tenant_id: string
          type: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          is_enabled?: boolean
          name: string
          note?: string | null
          order_index?: number
          tenant_id: string
          type: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          is_enabled?: boolean
          name?: string
          note?: string | null
          order_index?: number
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
          created_at: string
          customer_contact: string | null
          customer_data: Json | null
          customer_name: string | null
          delivery_fee: number | null
          id: string
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
          payment_method_details: string | null
          payment_method_id: string | null
          payment_method_name: string | null
          payment_method_qr_code_url: string | null
          payment_status: string | null
          status: string
          tenant_id: string
          total: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          customer_contact?: string | null
          customer_data?: Json | null
          customer_name?: string | null
          delivery_fee?: number | null
          id?: string
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
          payment_method_details?: string | null
          payment_method_id?: string | null
          payment_method_name?: string | null
          payment_method_qr_code_url?: string | null
          payment_status?: string | null
          status?: string
          tenant_id: string
          total: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          customer_contact?: string | null
          customer_data?: Json | null
          customer_name?: string | null
          delivery_fee?: number | null
          id?: string
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
          payment_method_details?: string | null
          payment_method_id?: string | null
          payment_method_name?: string | null
          payment_method_qr_code_url?: string | null
          payment_status?: string | null
          status?: string
          tenant_id?: string
          total?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "orders_order_type_id_fkey"
            columns: ["order_type_id"]
            isOneToOne: false
            referencedRelation: "order_types"
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
      push_subscriptions: {
        Row: {
          auth_key: string | null
          created_at: string | null
          device_token: string | null
          endpoint: string | null
          expo_push_token: string | null
          id: string
          is_active: boolean | null
          p256dh: string | null
          platform: string
          tenant_id: string
        }
        Insert: {
          auth_key?: string | null
          created_at?: string | null
          device_token?: string | null
          endpoint?: string | null
          expo_push_token?: string | null
          id?: string
          is_active?: boolean | null
          p256dh?: string | null
          platform: string
          tenant_id: string
        }
        Update: {
          auth_key?: string | null
          created_at?: string | null
          device_token?: string | null
          endpoint?: string | null
          expo_push_token?: string | null
          id?: string
          is_active?: boolean | null
          p256dh?: string | null
          platform?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "push_subscriptions_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
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
          background_color: string | null
          border_color: string | null
          bundles_enabled: boolean
          button_primary_color: string | null
          button_primary_text_color: string | null
          button_secondary_color: string | null
          button_secondary_text_color: string | null
          card_description_color: string | null
          card_price_color: string | null
          card_template: string | null
          card_title_color: string | null
          cards_border_color: string | null
          cards_color: string | null
          checkout_modal_background_color: string | null
          checkout_modal_border_color: string | null
          checkout_modal_button_color: string | null
          checkout_modal_button_text_color: string | null
          checkout_modal_description_color: string | null
          checkout_modal_price_color: string | null
          checkout_modal_title_color: string | null
          checkout_upsell_enabled: boolean | null
          checkout_upsell_max_items: number | null
          checkout_upsell_subtitle: string | null
          checkout_upsell_title: string | null
          convex_deploy_key: string | null
          convex_deployment_url: string | null
          convex_schema_version: number | null
          created_at: string
          domain: string | null
          email_notifications_enabled: boolean
          enable_order_management: boolean | null
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
          header_color: string | null
          header_font_color: string | null
          hero_description: string | null
          hero_description_color: string | null
          hero_title: string | null
          hero_title_color: string | null
          hero_design: Record<string, unknown> | null
          hero_section_enabled: boolean
          hide_currency_symbol: boolean
          id: string
          ios_app_store_id: string | null
          is_active: boolean
          is_announcement_visible: boolean | null
          is_promotion_visible: boolean | null
          lalamove_api_key: string | null
          lalamove_enabled: boolean | null
          lalamove_market: string | null
          lalamove_sandbox: boolean | null
          lalamove_secret_key: string | null
          lalamove_service_type: string | null
          link_color: string | null
          logo_url: string
          mapbox_enabled: boolean | null
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
          messenger_redirect_mode: string | null
          messenger_username: string | null
          mobile_card_template: string | null
          mobile_grid_columns: number | null
          mobile_page_layout: string | null
          modal_background_color: string | null
          modal_description_color: string | null
          modal_price_color: string | null
          modal_title_color: string | null
          name: string
          page_layout: string | null
          primary_color: string
          promotion_banners: Json | null
          promotion_image_url: string | null
          restaurant_address: string | null
          restaurant_latitude: number | null
          restaurant_longitude: number | null
          secondary_color: string
          shadow_color: string | null
          slug: string
          success_color: string | null
          text_muted_color: string | null
          text_primary_color: string | null
          text_secondary_color: string | null
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
          background_color?: string | null
          border_color?: string | null
          bundles_enabled?: boolean
          button_primary_color?: string | null
          button_primary_text_color?: string | null
          button_secondary_color?: string | null
          button_secondary_text_color?: string | null
          card_description_color?: string | null
          card_price_color?: string | null
          card_template?: string | null
          card_title_color?: string | null
          cards_border_color?: string | null
          cards_color?: string | null
          checkout_modal_background_color?: string | null
          checkout_modal_border_color?: string | null
          checkout_modal_button_color?: string | null
          checkout_modal_button_text_color?: string | null
          checkout_modal_description_color?: string | null
          checkout_modal_price_color?: string | null
          checkout_modal_title_color?: string | null
          checkout_upsell_enabled?: boolean | null
          checkout_upsell_max_items?: number | null
          checkout_upsell_subtitle?: string | null
          checkout_upsell_title?: string | null
          convex_deploy_key?: string | null
          convex_deployment_url?: string | null
          convex_schema_version?: number | null
          created_at?: string
          domain?: string | null
          email_notifications_enabled?: boolean
          enable_order_management?: boolean | null
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
          header_color?: string | null
          header_font_color?: string | null
          hero_description?: string | null
          hero_description_color?: string | null
          hero_title?: string | null
          hero_title_color?: string | null
          hero_design?: Record<string, unknown> | null
          hero_section_enabled?: boolean
          hide_currency_symbol?: boolean
          id?: string
          ios_app_store_id?: string | null
          is_active?: boolean
          is_announcement_visible?: boolean | null
          is_promotion_visible?: boolean | null
          lalamove_api_key?: string | null
          lalamove_enabled?: boolean | null
          lalamove_market?: string | null
          lalamove_sandbox?: boolean | null
          lalamove_secret_key?: string | null
          lalamove_service_type?: string | null
          link_color?: string | null
          logo_url?: string
          mapbox_enabled?: boolean | null
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
          messenger_redirect_mode?: string | null
          messenger_username?: string | null
          mobile_card_template?: string | null
          mobile_grid_columns?: number | null
          mobile_page_layout?: string | null
          modal_background_color?: string | null
          modal_description_color?: string | null
          modal_price_color?: string | null
          modal_title_color?: string | null
          name: string
          page_layout?: string | null
          primary_color?: string
          promotion_banners?: Json | null
          promotion_image_url?: string | null
          restaurant_address?: string | null
          restaurant_latitude?: number | null
          restaurant_longitude?: number | null
          secondary_color?: string
          shadow_color?: string | null
          slug: string
          success_color?: string | null
          text_muted_color?: string | null
          text_primary_color?: string | null
          text_secondary_color?: string | null
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
          background_color?: string | null
          border_color?: string | null
          bundles_enabled?: boolean
          button_primary_color?: string | null
          button_primary_text_color?: string | null
          button_secondary_color?: string | null
          button_secondary_text_color?: string | null
          card_description_color?: string | null
          card_price_color?: string | null
          card_template?: string | null
          card_title_color?: string | null
          cards_border_color?: string | null
          cards_color?: string | null
          checkout_modal_background_color?: string | null
          checkout_modal_border_color?: string | null
          checkout_modal_button_color?: string | null
          checkout_modal_button_text_color?: string | null
          checkout_modal_description_color?: string | null
          checkout_modal_price_color?: string | null
          checkout_modal_title_color?: string | null
          checkout_upsell_enabled?: boolean | null
          checkout_upsell_max_items?: number | null
          checkout_upsell_subtitle?: string | null
          checkout_upsell_title?: string | null
          convex_deploy_key?: string | null
          convex_deployment_url?: string | null
          convex_schema_version?: number | null
          created_at?: string
          domain?: string | null
          email_notifications_enabled?: boolean
          enable_order_management?: boolean | null
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
          header_color?: string | null
          header_font_color?: string | null
          hero_description?: string | null
          hero_description_color?: string | null
          hero_title?: string | null
          hero_title_color?: string | null
          hero_design?: Record<string, unknown> | null
          hero_section_enabled?: boolean
          hide_currency_symbol?: boolean
          id?: string
          ios_app_store_id?: string | null
          is_active?: boolean
          is_announcement_visible?: boolean | null
          is_promotion_visible?: boolean | null
          lalamove_api_key?: string | null
          lalamove_enabled?: boolean | null
          lalamove_market?: string | null
          lalamove_sandbox?: boolean | null
          lalamove_secret_key?: string | null
          lalamove_service_type?: string | null
          link_color?: string | null
          logo_url?: string
          mapbox_enabled?: boolean | null
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
          messenger_redirect_mode?: string | null
          messenger_username?: string | null
          mobile_card_template?: string | null
          mobile_grid_columns?: number | null
          mobile_page_layout?: string | null
          modal_background_color?: string | null
          modal_description_color?: string | null
          modal_price_color?: string | null
          modal_title_color?: string | null
          name?: string
          page_layout?: string | null
          primary_color?: string
          promotion_banners?: Json | null
          promotion_image_url?: string | null
          restaurant_address?: string | null
          restaurant_latitude?: number | null
          restaurant_longitude?: number | null
          secondary_color?: string
          shadow_color?: string | null
          slug?: string
          success_color?: string | null
          text_muted_color?: string | null
          text_primary_color?: string | null
          text_secondary_color?: string | null
          updated_at?: string
          warning_color?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "tenants_facebook_page_id_fkey"
            columns: ["facebook_page_id"]
            isOneToOne: false
            referencedRelation: "facebook_pages"
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
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      initialize_order_types_for_tenant: {
        Args: { tenant_uuid: string }
        Returns: undefined
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
