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
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      active_sync_sessions: {
        Row: {
          completed_at: string | null
          current_item_index: number | null
          current_item_sku: string | null
          direction: string
          elapsed_seconds: number | null
          estimated_remaining_seconds: number | null
          id: string
          items_per_second: number | null
          last_heartbeat: string | null
          metadata: Json | null
          processed_items: number | null
          session_token: string
          started_at: string | null
          status: string | null
          sync_log_id: string | null
          sync_type: string
          total_items: number | null
          user_id: string | null
        }
        Insert: {
          completed_at?: string | null
          current_item_index?: number | null
          current_item_sku?: string | null
          direction: string
          elapsed_seconds?: number | null
          estimated_remaining_seconds?: number | null
          id?: string
          items_per_second?: number | null
          last_heartbeat?: string | null
          metadata?: Json | null
          processed_items?: number | null
          session_token: string
          started_at?: string | null
          status?: string | null
          sync_log_id?: string | null
          sync_type: string
          total_items?: number | null
          user_id?: string | null
        }
        Update: {
          completed_at?: string | null
          current_item_index?: number | null
          current_item_sku?: string | null
          direction?: string
          elapsed_seconds?: number | null
          estimated_remaining_seconds?: number | null
          id?: string
          items_per_second?: number | null
          last_heartbeat?: string | null
          metadata?: Json | null
          processed_items?: number | null
          session_token?: string
          started_at?: string | null
          status?: string | null
          sync_log_id?: string | null
          sync_type?: string
          total_items?: number | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "active_sync_sessions_sync_log_id_fkey"
            columns: ["sync_log_id"]
            isOneToOne: false
            referencedRelation: "sync_logs"
            referencedColumns: ["id"]
          },
        ]
      }
      api_rate_limits: {
        Row: {
          created_at: string | null
          endpoint: string | null
          id: string
          is_throttled: boolean | null
          last_request_at: string | null
          limit_window_end: string
          limit_window_start: string
          platform: string | null
          requests_limit: number
          requests_made: number | null
          throttle_delay_ms: number | null
          updated_at: string | null
          user_id: string | null
        }
        Insert: {
          created_at?: string | null
          endpoint?: string | null
          id?: string
          is_throttled?: boolean | null
          last_request_at?: string | null
          limit_window_end: string
          limit_window_start: string
          platform?: string | null
          requests_limit: number
          requests_made?: number | null
          throttle_delay_ms?: number | null
          updated_at?: string | null
          user_id?: string | null
        }
        Update: {
          created_at?: string | null
          endpoint?: string | null
          id?: string
          is_throttled?: boolean | null
          last_request_at?: string | null
          limit_window_end?: string
          limit_window_start?: string
          platform?: string | null
          requests_limit?: number
          requests_made?: number | null
          throttle_delay_ms?: number | null
          updated_at?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      change_log: {
        Row: {
          after_snapshot_id: string | null
          before_snapshot_id: string | null
          change_source: string
          changed_at: string
          entity_id: string
          entity_type: string
          field_name: string
          id: string
          metadata: Json | null
          new_value: Json | null
          old_value: Json | null
          operation: string
          platform: string
          sync_log_id: string | null
          triggered_by: string | null
          user_id: string
          value_diff: Json | null
        }
        Insert: {
          after_snapshot_id?: string | null
          before_snapshot_id?: string | null
          change_source: string
          changed_at?: string
          entity_id: string
          entity_type: string
          field_name: string
          id?: string
          metadata?: Json | null
          new_value?: Json | null
          old_value?: Json | null
          operation: string
          platform: string
          sync_log_id?: string | null
          triggered_by?: string | null
          user_id: string
          value_diff?: Json | null
        }
        Update: {
          after_snapshot_id?: string | null
          before_snapshot_id?: string | null
          change_source?: string
          changed_at?: string
          entity_id?: string
          entity_type?: string
          field_name?: string
          id?: string
          metadata?: Json | null
          new_value?: Json | null
          old_value?: Json | null
          operation?: string
          platform?: string
          sync_log_id?: string | null
          triggered_by?: string | null
          user_id?: string
          value_diff?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "change_log_after_snapshot_id_fkey"
            columns: ["after_snapshot_id"]
            isOneToOne: false
            referencedRelation: "product_snapshots"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "change_log_before_snapshot_id_fkey"
            columns: ["before_snapshot_id"]
            isOneToOne: false
            referencedRelation: "product_snapshots"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "change_log_sync_log_id_fkey"
            columns: ["sync_log_id"]
            isOneToOne: false
            referencedRelation: "sync_logs"
            referencedColumns: ["id"]
          },
        ]
      }
      connections: {
        Row: {
          created_at: string | null
          credentials: Json | null
          id: string
          last_sync: string | null
          metadata: Json | null
          platform: string | null
          status: string | null
          updated_at: string | null
          user_id: string | null
        }
        Insert: {
          created_at?: string | null
          credentials?: Json | null
          id?: string
          last_sync?: string | null
          metadata?: Json | null
          platform?: string | null
          status?: string | null
          updated_at?: string | null
          user_id?: string | null
        }
        Update: {
          created_at?: string | null
          credentials?: Json | null
          id?: string
          last_sync?: string | null
          metadata?: Json | null
          platform?: string | null
          status?: string | null
          updated_at?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      customer_mappings: {
        Row: {
          company: string | null
          created_at: string | null
          email: string | null
          first_name: string | null
          id: string
          last_name: string | null
          last_synced: string | null
          metadata: Json | null
          netsuite_customer_id: string | null
          phone: string | null
          shopify_customer_id: string
          sync_status: string | null
          updated_at: string | null
          user_id: string | null
        }
        Insert: {
          company?: string | null
          created_at?: string | null
          email?: string | null
          first_name?: string | null
          id?: string
          last_name?: string | null
          last_synced?: string | null
          metadata?: Json | null
          netsuite_customer_id?: string | null
          phone?: string | null
          shopify_customer_id: string
          sync_status?: string | null
          updated_at?: string | null
          user_id?: string | null
        }
        Update: {
          company?: string | null
          created_at?: string | null
          email?: string | null
          first_name?: string | null
          id?: string
          last_name?: string | null
          last_synced?: string | null
          metadata?: Json | null
          netsuite_customer_id?: string | null
          phone?: string | null
          shopify_customer_id?: string
          sync_status?: string | null
          updated_at?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      dashboard_widgets: {
        Row: {
          config: Json | null
          created_at: string | null
          height: number | null
          id: string
          is_visible: boolean | null
          position_x: number | null
          position_y: number | null
          refresh_interval_seconds: number | null
          title: string
          updated_at: string | null
          user_id: string | null
          widget_type: string | null
          width: number | null
        }
        Insert: {
          config?: Json | null
          created_at?: string | null
          height?: number | null
          id?: string
          is_visible?: boolean | null
          position_x?: number | null
          position_y?: number | null
          refresh_interval_seconds?: number | null
          title: string
          updated_at?: string | null
          user_id?: string | null
          widget_type?: string | null
          width?: number | null
        }
        Update: {
          config?: Json | null
          created_at?: string | null
          height?: number | null
          id?: string
          is_visible?: boolean | null
          position_x?: number | null
          position_y?: number | null
          refresh_interval_seconds?: number | null
          title?: string
          updated_at?: string | null
          user_id?: string | null
          widget_type?: string | null
          width?: number | null
        }
        Relationships: []
      }
      field_lookup_tables: {
        Row: {
          created_at: string | null
          default_value: string | null
          description: string | null
          id: string
          is_active: boolean | null
          lookup_type: string | null
          mappings: Json
          name: string
          source_platform: string | null
          target_platform: string | null
          updated_at: string | null
          user_id: string | null
        }
        Insert: {
          created_at?: string | null
          default_value?: string | null
          description?: string | null
          id?: string
          is_active?: boolean | null
          lookup_type?: string | null
          mappings: Json
          name: string
          source_platform?: string | null
          target_platform?: string | null
          updated_at?: string | null
          user_id?: string | null
        }
        Update: {
          created_at?: string | null
          default_value?: string | null
          description?: string | null
          id?: string
          is_active?: boolean | null
          lookup_type?: string | null
          mappings?: Json
          name?: string
          source_platform?: string | null
          target_platform?: string | null
          updated_at?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      field_mapping_executions: {
        Row: {
          created_at: string | null
          error_message: string | null
          field_mapping_id: string | null
          id: string
          source_value: Json | null
          status: string | null
          sync_log_id: string | null
          target_value: Json | null
          transformation_duration_ms: number | null
          transformed_value: Json | null
          warnings: string[] | null
        }
        Insert: {
          created_at?: string | null
          error_message?: string | null
          field_mapping_id?: string | null
          id?: string
          source_value?: Json | null
          status?: string | null
          sync_log_id?: string | null
          target_value?: Json | null
          transformation_duration_ms?: number | null
          transformed_value?: Json | null
          warnings?: string[] | null
        }
        Update: {
          created_at?: string | null
          error_message?: string | null
          field_mapping_id?: string | null
          id?: string
          source_value?: Json | null
          status?: string | null
          sync_log_id?: string | null
          target_value?: Json | null
          transformation_duration_ms?: number | null
          transformed_value?: Json | null
          warnings?: string[] | null
        }
        Relationships: [
          {
            foreignKeyName: "field_mapping_executions_field_mapping_id_fkey"
            columns: ["field_mapping_id"]
            isOneToOne: false
            referencedRelation: "field_mappings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "field_mapping_executions_sync_log_id_fkey"
            columns: ["sync_log_id"]
            isOneToOne: false
            referencedRelation: "sync_logs"
            referencedColumns: ["id"]
          },
        ]
      }
      field_mapping_templates: {
        Row: {
          category: string | null
          created_at: string | null
          description: string | null
          id: string
          is_active: boolean | null
          is_default: boolean | null
          metadata: Json | null
          name: string
          template_type: string | null
          updated_at: string | null
          user_id: string | null
        }
        Insert: {
          category?: string | null
          created_at?: string | null
          description?: string | null
          id?: string
          is_active?: boolean | null
          is_default?: boolean | null
          metadata?: Json | null
          name: string
          template_type?: string | null
          updated_at?: string | null
          user_id?: string | null
        }
        Update: {
          category?: string | null
          created_at?: string | null
          description?: string | null
          id?: string
          is_active?: boolean | null
          is_default?: boolean | null
          metadata?: Json | null
          name?: string
          template_type?: string | null
          updated_at?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      field_mapping_validation_errors: {
        Row: {
          actual_value: string | null
          created_at: string | null
          error_message: string | null
          error_type: string | null
          expected_value: string | null
          field_mapping_id: string | null
          field_path: string | null
          id: string
          resolved: boolean | null
          resolved_at: string | null
          severity: string | null
          sync_log_id: string | null
        }
        Insert: {
          actual_value?: string | null
          created_at?: string | null
          error_message?: string | null
          error_type?: string | null
          expected_value?: string | null
          field_mapping_id?: string | null
          field_path?: string | null
          id?: string
          resolved?: boolean | null
          resolved_at?: string | null
          severity?: string | null
          sync_log_id?: string | null
        }
        Update: {
          actual_value?: string | null
          created_at?: string | null
          error_message?: string | null
          error_type?: string | null
          expected_value?: string | null
          field_mapping_id?: string | null
          field_path?: string | null
          id?: string
          resolved?: boolean | null
          resolved_at?: string | null
          severity?: string | null
          sync_log_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "field_mapping_validation_errors_field_mapping_id_fkey"
            columns: ["field_mapping_id"]
            isOneToOne: false
            referencedRelation: "field_mappings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "field_mapping_validation_errors_sync_log_id_fkey"
            columns: ["sync_log_id"]
            isOneToOne: false
            referencedRelation: "sync_logs"
            referencedColumns: ["id"]
          },
        ]
      }
      field_mappings: {
        Row: {
          created_at: string | null
          default_value: string | null
          field_label: string | null
          field_type: string | null
          id: string
          is_active: boolean | null
          is_required: boolean | null
          priority: number | null
          source_field_path: string
          source_platform: string | null
          sync_direction: string | null
          target_field_path: string
          target_platform: string | null
          template_id: string | null
          transformation_config: Json | null
          transformation_enabled: boolean | null
          transformation_type: string | null
          updated_at: string | null
          user_id: string | null
          validation_rules: Json | null
        }
        Insert: {
          created_at?: string | null
          default_value?: string | null
          field_label?: string | null
          field_type?: string | null
          id?: string
          is_active?: boolean | null
          is_required?: boolean | null
          priority?: number | null
          source_field_path: string
          source_platform?: string | null
          sync_direction?: string | null
          target_field_path: string
          target_platform?: string | null
          template_id?: string | null
          transformation_config?: Json | null
          transformation_enabled?: boolean | null
          transformation_type?: string | null
          updated_at?: string | null
          user_id?: string | null
          validation_rules?: Json | null
        }
        Update: {
          created_at?: string | null
          default_value?: string | null
          field_label?: string | null
          field_type?: string | null
          id?: string
          is_active?: boolean | null
          is_required?: boolean | null
          priority?: number | null
          source_field_path?: string
          source_platform?: string | null
          sync_direction?: string | null
          target_field_path?: string
          target_platform?: string | null
          template_id?: string | null
          transformation_config?: Json | null
          transformation_enabled?: boolean | null
          transformation_type?: string | null
          updated_at?: string | null
          user_id?: string | null
          validation_rules?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "field_mappings_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "field_mapping_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      field_transformation_rules: {
        Row: {
          created_at: string | null
          description: string | null
          id: string
          input_schema: Json | null
          is_active: boolean | null
          is_global: boolean | null
          name: string
          output_schema: Json | null
          rule_config: Json
          rule_type: string | null
          test_cases: Json | null
          updated_at: string | null
          usage_count: number | null
          user_id: string | null
        }
        Insert: {
          created_at?: string | null
          description?: string | null
          id?: string
          input_schema?: Json | null
          is_active?: boolean | null
          is_global?: boolean | null
          name: string
          output_schema?: Json | null
          rule_config: Json
          rule_type?: string | null
          test_cases?: Json | null
          updated_at?: string | null
          usage_count?: number | null
          user_id?: string | null
        }
        Update: {
          created_at?: string | null
          description?: string | null
          id?: string
          input_schema?: Json | null
          is_active?: boolean | null
          is_global?: boolean | null
          name?: string
          output_schema?: Json | null
          rule_config?: Json
          rule_type?: string | null
          test_cases?: Json | null
          updated_at?: string | null
          usage_count?: number | null
          user_id?: string | null
        }
        Relationships: []
      }
      incremental_changes: {
        Row: {
          change_detected: boolean | null
          change_magnitude: string | null
          changed_fields: string[] | null
          created_at: string
          current_hash: string
          entity_id: string
          entity_type: string
          id: string
          last_checked_at: string
          last_modified_at: string
          platform: string
          previous_hash: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          change_detected?: boolean | null
          change_magnitude?: string | null
          changed_fields?: string[] | null
          created_at?: string
          current_hash: string
          entity_id: string
          entity_type: string
          id?: string
          last_checked_at: string
          last_modified_at: string
          platform: string
          previous_hash?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          change_detected?: boolean | null
          change_magnitude?: string | null
          changed_fields?: string[] | null
          created_at?: string
          current_hash?: string
          entity_id?: string
          entity_type?: string
          id?: string
          last_checked_at?: string
          last_modified_at?: string
          platform?: string
          previous_hash?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      item_mappings: {
        Row: {
          conflict_resolution: string | null
          created_at: string | null
          id: string
          last_synced: string | null
          mapping_rules: Json | null
          mapping_type: string | null
          metadata: Json | null
          netsuite_product_id: string | null
          next_sync_scheduled: string | null
          shopify_product_id: string | null
          sync_direction: string | null
          sync_enabled: boolean | null
          sync_frequency: string | null
          sync_status: string | null
          updated_at: string | null
          user_id: string | null
        }
        Insert: {
          conflict_resolution?: string | null
          created_at?: string | null
          id?: string
          last_synced?: string | null
          mapping_rules?: Json | null
          mapping_type?: string | null
          metadata?: Json | null
          netsuite_product_id?: string | null
          next_sync_scheduled?: string | null
          shopify_product_id?: string | null
          sync_direction?: string | null
          sync_enabled?: boolean | null
          sync_frequency?: string | null
          sync_status?: string | null
          updated_at?: string | null
          user_id?: string | null
        }
        Update: {
          conflict_resolution?: string | null
          created_at?: string | null
          id?: string
          last_synced?: string | null
          mapping_rules?: Json | null
          mapping_type?: string | null
          metadata?: Json | null
          netsuite_product_id?: string | null
          next_sync_scheduled?: string | null
          shopify_product_id?: string | null
          sync_direction?: string | null
          sync_enabled?: boolean | null
          sync_frequency?: string | null
          sync_status?: string | null
          updated_at?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "item_mappings_netsuite_product_id_fkey"
            columns: ["netsuite_product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "item_mappings_shopify_product_id_fkey"
            columns: ["shopify_product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      notification_preferences: {
        Row: {
          alert_types: Json | null
          created_at: string | null
          email_notifications: boolean | null
          id: string
          quiet_hours_end: string | null
          quiet_hours_start: string | null
          slack_notifications: boolean | null
          slack_webhook_url: string | null
          sms_notifications: boolean | null
          sms_phone_number: string | null
          timezone: string | null
          updated_at: string | null
          user_id: string | null
        }
        Insert: {
          alert_types?: Json | null
          created_at?: string | null
          email_notifications?: boolean | null
          id?: string
          quiet_hours_end?: string | null
          quiet_hours_start?: string | null
          slack_notifications?: boolean | null
          slack_webhook_url?: string | null
          sms_notifications?: boolean | null
          sms_phone_number?: string | null
          timezone?: string | null
          updated_at?: string | null
          user_id?: string | null
        }
        Update: {
          alert_types?: Json | null
          created_at?: string | null
          email_notifications?: boolean | null
          id?: string
          quiet_hours_end?: string | null
          quiet_hours_start?: string | null
          slack_notifications?: boolean | null
          slack_webhook_url?: string | null
          sms_notifications?: boolean | null
          sms_phone_number?: string | null
          timezone?: string | null
          updated_at?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      order_line_mappings: {
        Row: {
          created_at: string | null
          discount_amount: number | null
          error_message: string | null
          id: string
          netsuite_line_id: string | null
          order_mapping_id: string | null
          product_mapping_id: string | null
          product_name: string | null
          quantity: number
          shopify_line_item_id: string
          sku: string | null
          sync_status: string | null
          tax_amount: number | null
          total_price: number | null
          unit_price: number | null
        }
        Insert: {
          created_at?: string | null
          discount_amount?: number | null
          error_message?: string | null
          id?: string
          netsuite_line_id?: string | null
          order_mapping_id?: string | null
          product_mapping_id?: string | null
          product_name?: string | null
          quantity: number
          shopify_line_item_id: string
          sku?: string | null
          sync_status?: string | null
          tax_amount?: number | null
          total_price?: number | null
          unit_price?: number | null
        }
        Update: {
          created_at?: string | null
          discount_amount?: number | null
          error_message?: string | null
          id?: string
          netsuite_line_id?: string | null
          order_mapping_id?: string | null
          product_mapping_id?: string | null
          product_name?: string | null
          quantity?: number
          shopify_line_item_id?: string
          sku?: string | null
          sync_status?: string | null
          tax_amount?: number | null
          total_price?: number | null
          unit_price?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "order_line_mappings_order_mapping_id_fkey"
            columns: ["order_mapping_id"]
            isOneToOne: false
            referencedRelation: "order_mappings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_line_mappings_product_mapping_id_fkey"
            columns: ["product_mapping_id"]
            isOneToOne: false
            referencedRelation: "item_mappings"
            referencedColumns: ["id"]
          },
        ]
      }
      order_mappings: {
        Row: {
          created_at: string | null
          currency: string | null
          error_details: Json | null
          id: string
          last_synced: string | null
          metadata: Json | null
          netsuite_order_number: string | null
          netsuite_sales_order_id: string | null
          order_date: string | null
          shopify_order_id: string
          shopify_order_number: string | null
          sync_direction: string | null
          sync_status: string | null
          total_amount: number | null
          updated_at: string | null
          user_id: string | null
        }
        Insert: {
          created_at?: string | null
          currency?: string | null
          error_details?: Json | null
          id?: string
          last_synced?: string | null
          metadata?: Json | null
          netsuite_order_number?: string | null
          netsuite_sales_order_id?: string | null
          order_date?: string | null
          shopify_order_id: string
          shopify_order_number?: string | null
          sync_direction?: string | null
          sync_status?: string | null
          total_amount?: number | null
          updated_at?: string | null
          user_id?: string | null
        }
        Update: {
          created_at?: string | null
          currency?: string | null
          error_details?: Json | null
          id?: string
          last_synced?: string | null
          metadata?: Json | null
          netsuite_order_number?: string | null
          netsuite_sales_order_id?: string | null
          order_date?: string | null
          shopify_order_id?: string
          shopify_order_number?: string | null
          sync_direction?: string | null
          sync_status?: string | null
          total_amount?: number | null
          updated_at?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      order_sync_history: {
        Row: {
          created_at: string | null
          error_message: string | null
          id: string
          netsuite_data: Json | null
          operation: string | null
          order_mapping_id: string | null
          processing_time_ms: number | null
          shopify_data: Json | null
          status: string | null
          sync_log_id: string | null
          warnings: string[] | null
        }
        Insert: {
          created_at?: string | null
          error_message?: string | null
          id?: string
          netsuite_data?: Json | null
          operation?: string | null
          order_mapping_id?: string | null
          processing_time_ms?: number | null
          shopify_data?: Json | null
          status?: string | null
          sync_log_id?: string | null
          warnings?: string[] | null
        }
        Update: {
          created_at?: string | null
          error_message?: string | null
          id?: string
          netsuite_data?: Json | null
          operation?: string | null
          order_mapping_id?: string | null
          processing_time_ms?: number | null
          shopify_data?: Json | null
          status?: string | null
          sync_log_id?: string | null
          warnings?: string[] | null
        }
        Relationships: [
          {
            foreignKeyName: "order_sync_history_order_mapping_id_fkey"
            columns: ["order_mapping_id"]
            isOneToOne: false
            referencedRelation: "order_mappings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_sync_history_sync_log_id_fkey"
            columns: ["sync_log_id"]
            isOneToOne: false
            referencedRelation: "sync_logs"
            referencedColumns: ["id"]
          },
        ]
      }
      price_tiers: {
        Row: {
          base_price: number | null
          created_at: string | null
          currency: string | null
          id: string
          item_mapping_id: string | null
          last_updated: string | null
          netsuite_price_level: string | null
          shopify_catalog_id: string | null
          sync_enabled: boolean | null
          tier_name: string | null
          tier_prices: Json | null
        }
        Insert: {
          base_price?: number | null
          created_at?: string | null
          currency?: string | null
          id?: string
          item_mapping_id?: string | null
          last_updated?: string | null
          netsuite_price_level?: string | null
          shopify_catalog_id?: string | null
          sync_enabled?: boolean | null
          tier_name?: string | null
          tier_prices?: Json | null
        }
        Update: {
          base_price?: number | null
          created_at?: string | null
          currency?: string | null
          id?: string
          item_mapping_id?: string | null
          last_updated?: string | null
          netsuite_price_level?: string | null
          shopify_catalog_id?: string | null
          sync_enabled?: boolean | null
          tier_name?: string | null
          tier_prices?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "price_tiers_item_mapping_id_fkey"
            columns: ["item_mapping_id"]
            isOneToOne: false
            referencedRelation: "item_mappings"
            referencedColumns: ["id"]
          },
        ]
      }
      product_snapshots: {
        Row: {
          created_at: string
          data_checksum: string
          expires_at: string | null
          id: string
          metadata: Json | null
          notes: string | null
          platform: string
          previous_snapshot_id: string | null
          product_id: string
          restore_point_id: string | null
          snapshot_data: Json
          snapshot_type: string
          sync_log_id: string | null
          user_id: string
          version: number
        }
        Insert: {
          created_at?: string
          data_checksum: string
          expires_at?: string | null
          id?: string
          metadata?: Json | null
          notes?: string | null
          platform: string
          previous_snapshot_id?: string | null
          product_id: string
          restore_point_id?: string | null
          snapshot_data: Json
          snapshot_type: string
          sync_log_id?: string | null
          user_id: string
          version?: number
        }
        Update: {
          created_at?: string
          data_checksum?: string
          expires_at?: string | null
          id?: string
          metadata?: Json | null
          notes?: string | null
          platform?: string
          previous_snapshot_id?: string | null
          product_id?: string
          restore_point_id?: string | null
          snapshot_data?: Json
          snapshot_type?: string
          sync_log_id?: string | null
          user_id?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "product_snapshots_previous_snapshot_id_fkey"
            columns: ["previous_snapshot_id"]
            isOneToOne: false
            referencedRelation: "product_snapshots"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_snapshots_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_snapshots_sync_log_id_fkey"
            columns: ["sync_log_id"]
            isOneToOne: false
            referencedRelation: "sync_logs"
            referencedColumns: ["id"]
          },
        ]
      }
      product_sync_history: {
        Row: {
          after_data: Json | null
          before_data: Json | null
          created_at: string | null
          error_message: string | null
          id: string
          operation: string | null
          platform: string | null
          product_id: string | null
          status: string | null
          sync_log_id: string | null
          warnings: string[] | null
        }
        Insert: {
          after_data?: Json | null
          before_data?: Json | null
          created_at?: string | null
          error_message?: string | null
          id?: string
          operation?: string | null
          platform?: string | null
          product_id?: string | null
          status?: string | null
          sync_log_id?: string | null
          warnings?: string[] | null
        }
        Update: {
          after_data?: Json | null
          before_data?: Json | null
          created_at?: string | null
          error_message?: string | null
          id?: string
          operation?: string | null
          platform?: string | null
          product_id?: string | null
          status?: string | null
          sync_log_id?: string | null
          warnings?: string[] | null
        }
        Relationships: [
          {
            foreignKeyName: "product_sync_history_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_sync_history_sync_log_id_fkey"
            columns: ["sync_log_id"]
            isOneToOne: false
            referencedRelation: "sync_logs"
            referencedColumns: ["id"]
          },
        ]
      }
      products: {
        Row: {
          attributes: Json | null
          compare_at_price: number | null
          cost: number | null
          created_at: string | null
          description: string | null
          dimensions: Json | null
          id: string
          images: Json | null
          inventory_quantity: number | null
          is_active: boolean | null
          last_platform_sync: string | null
          name: string | null
          platform: string | null
          platform_product_id: string
          price: number | null
          product_type: string | null
          sku: string | null
          tags: string[] | null
          updated_at: string | null
          user_id: string | null
          variants: Json | null
          vendor: string | null
          weight: number | null
          weight_unit: string | null
        }
        Insert: {
          attributes?: Json | null
          compare_at_price?: number | null
          cost?: number | null
          created_at?: string | null
          description?: string | null
          dimensions?: Json | null
          id?: string
          images?: Json | null
          inventory_quantity?: number | null
          is_active?: boolean | null
          last_platform_sync?: string | null
          name?: string | null
          platform?: string | null
          platform_product_id: string
          price?: number | null
          product_type?: string | null
          sku?: string | null
          tags?: string[] | null
          updated_at?: string | null
          user_id?: string | null
          variants?: Json | null
          vendor?: string | null
          weight?: number | null
          weight_unit?: string | null
        }
        Update: {
          attributes?: Json | null
          compare_at_price?: number | null
          cost?: number | null
          created_at?: string | null
          description?: string | null
          dimensions?: Json | null
          id?: string
          images?: Json | null
          inventory_quantity?: number | null
          is_active?: boolean | null
          last_platform_sync?: string | null
          name?: string | null
          platform?: string | null
          platform_product_id?: string
          price?: number | null
          product_type?: string | null
          sku?: string | null
          tags?: string[] | null
          updated_at?: string | null
          user_id?: string | null
          variants?: Json | null
          vendor?: string | null
          weight?: number | null
          weight_unit?: string | null
        }
        Relationships: []
      }
      restore_points: {
        Row: {
          created_at: string
          description: string | null
          expires_at: string | null
          id: string
          inventory_count: number | null
          metadata: Json | null
          name: string
          orders_count: number | null
          point_type: string
          products_count: number | null
          restore_result: Json | null
          restored_at: string | null
          restored_by: string | null
          status: string | null
          sync_log_id: string | null
          tags: string[] | null
          total_snapshots: number | null
          user_id: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          expires_at?: string | null
          id?: string
          inventory_count?: number | null
          metadata?: Json | null
          name: string
          orders_count?: number | null
          point_type: string
          products_count?: number | null
          restore_result?: Json | null
          restored_at?: string | null
          restored_by?: string | null
          status?: string | null
          sync_log_id?: string | null
          tags?: string[] | null
          total_snapshots?: number | null
          user_id: string
        }
        Update: {
          created_at?: string
          description?: string | null
          expires_at?: string | null
          id?: string
          inventory_count?: number | null
          metadata?: Json | null
          name?: string
          orders_count?: number | null
          point_type?: string
          products_count?: number | null
          restore_result?: Json | null
          restored_at?: string | null
          restored_by?: string | null
          status?: string | null
          sync_log_id?: string | null
          tags?: string[] | null
          total_snapshots?: number | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "restore_points_sync_log_id_fkey"
            columns: ["sync_log_id"]
            isOneToOne: false
            referencedRelation: "sync_logs"
            referencedColumns: ["id"]
          },
        ]
      }
      rollback_operations: {
        Row: {
          completed_at: string | null
          dry_run: boolean | null
          entity_ids: string[] | null
          entity_type: string
          errors: Json | null
          id: string
          items_failed: number | null
          items_restored: number | null
          items_to_restore: number | null
          metadata: Json | null
          platforms: string[] | null
          restore_point_id: string | null
          started_at: string
          status: string | null
          target_timestamp: string
          user_id: string
          validation_errors: Json | null
          validation_passed: boolean | null
          warnings: Json | null
        }
        Insert: {
          completed_at?: string | null
          dry_run?: boolean | null
          entity_ids?: string[] | null
          entity_type: string
          errors?: Json | null
          id?: string
          items_failed?: number | null
          items_restored?: number | null
          items_to_restore?: number | null
          metadata?: Json | null
          platforms?: string[] | null
          restore_point_id?: string | null
          started_at?: string
          status?: string | null
          target_timestamp: string
          user_id: string
          validation_errors?: Json | null
          validation_passed?: boolean | null
          warnings?: Json | null
        }
        Update: {
          completed_at?: string | null
          dry_run?: boolean | null
          entity_ids?: string[] | null
          entity_type?: string
          errors?: Json | null
          id?: string
          items_failed?: number | null
          items_restored?: number | null
          items_to_restore?: number | null
          metadata?: Json | null
          platforms?: string[] | null
          restore_point_id?: string | null
          started_at?: string
          status?: string | null
          target_timestamp?: string
          user_id?: string
          validation_errors?: Json | null
          validation_passed?: boolean | null
          warnings?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "rollback_operations_restore_point_id_fkey"
            columns: ["restore_point_id"]
            isOneToOne: false
            referencedRelation: "restore_points"
            referencedColumns: ["id"]
          },
        ]
      }
      snapshot_retention_policies: {
        Row: {
          archive_before_delete: boolean | null
          archive_location: string | null
          compress_old_snapshots: boolean | null
          compression_after_days: number | null
          created_at: string
          description: string | null
          id: string
          is_active: boolean | null
          last_executed_at: string | null
          min_snapshots_to_keep: number | null
          policy_name: string
          priority: number | null
          retention_days: number
          snapshot_types: string[] | null
          total_snapshots_deleted: number | null
          total_space_freed_mb: number | null
          updated_at: string
          user_id: string | null
        }
        Insert: {
          archive_before_delete?: boolean | null
          archive_location?: string | null
          compress_old_snapshots?: boolean | null
          compression_after_days?: number | null
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean | null
          last_executed_at?: string | null
          min_snapshots_to_keep?: number | null
          policy_name: string
          priority?: number | null
          retention_days?: number
          snapshot_types?: string[] | null
          total_snapshots_deleted?: number | null
          total_space_freed_mb?: number | null
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          archive_before_delete?: boolean | null
          archive_location?: string | null
          compress_old_snapshots?: boolean | null
          compression_after_days?: number | null
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean | null
          last_executed_at?: string | null
          min_snapshots_to_keep?: number | null
          policy_name?: string
          priority?: number | null
          retention_days?: number
          snapshot_types?: string[] | null
          total_snapshots_deleted?: number | null
          total_space_freed_mb?: number | null
          updated_at?: string
          user_id?: string | null
        }
        Relationships: []
      }
      sync_configurations: {
        Row: {
          config_key: string
          config_value: Json | null
          created_at: string | null
          description: string | null
          id: string
          is_active: boolean | null
          updated_at: string | null
          user_id: string | null
        }
        Insert: {
          config_key: string
          config_value?: Json | null
          created_at?: string | null
          description?: string | null
          id?: string
          is_active?: boolean | null
          updated_at?: string | null
          user_id?: string | null
        }
        Update: {
          config_key?: string
          config_value?: Json | null
          created_at?: string | null
          description?: string | null
          id?: string
          is_active?: boolean | null
          updated_at?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      sync_logs: {
        Row: {
          completed_at: string | null
          created_at: string | null
          direction: string | null
          duration_seconds: number | null
          error_details: Json | null
          id: string
          item_mapping_id: string | null
          items_failed: number | null
          items_processed: number | null
          items_skipped: number | null
          items_succeeded: number | null
          max_retries: number | null
          order_count: number | null
          order_sync_details: Json | null
          retry_count: number | null
          started_at: string | null
          status: string | null
          sync_type: string | null
          triggered_by: string | null
          user_id: string | null
          warnings: Json | null
        }
        Insert: {
          completed_at?: string | null
          created_at?: string | null
          direction?: string | null
          duration_seconds?: number | null
          error_details?: Json | null
          id?: string
          item_mapping_id?: string | null
          items_failed?: number | null
          items_processed?: number | null
          items_skipped?: number | null
          items_succeeded?: number | null
          max_retries?: number | null
          order_count?: number | null
          order_sync_details?: Json | null
          retry_count?: number | null
          started_at?: string | null
          status?: string | null
          sync_type?: string | null
          triggered_by?: string | null
          user_id?: string | null
          warnings?: Json | null
        }
        Update: {
          completed_at?: string | null
          created_at?: string | null
          direction?: string | null
          duration_seconds?: number | null
          error_details?: Json | null
          id?: string
          item_mapping_id?: string | null
          items_failed?: number | null
          items_processed?: number | null
          items_skipped?: number | null
          items_succeeded?: number | null
          max_retries?: number | null
          order_count?: number | null
          order_sync_details?: Json | null
          retry_count?: number | null
          started_at?: string | null
          status?: string | null
          sync_type?: string | null
          triggered_by?: string | null
          user_id?: string | null
          warnings?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "sync_logs_item_mapping_id_fkey"
            columns: ["item_mapping_id"]
            isOneToOne: false
            referencedRelation: "item_mappings"
            referencedColumns: ["id"]
          },
        ]
      }
      sync_performance_stats: {
        Row: {
          avg_duration_seconds: number | null
          avg_items_per_second: number | null
          created_at: string | null
          error_rate_percentage: number | null
          failed_items: number | null
          failed_syncs: number | null
          id: string
          max_duration_seconds: number | null
          min_duration_seconds: number | null
          period_end: string
          period_start: string
          platform: string | null
          successful_items: number | null
          successful_syncs: number | null
          sync_type: string | null
          time_period: string | null
          total_items: number | null
          total_syncs: number | null
          user_id: string | null
        }
        Insert: {
          avg_duration_seconds?: number | null
          avg_items_per_second?: number | null
          created_at?: string | null
          error_rate_percentage?: number | null
          failed_items?: number | null
          failed_syncs?: number | null
          id?: string
          max_duration_seconds?: number | null
          min_duration_seconds?: number | null
          period_end: string
          period_start: string
          platform?: string | null
          successful_items?: number | null
          successful_syncs?: number | null
          sync_type?: string | null
          time_period?: string | null
          total_items?: number | null
          total_syncs?: number | null
          user_id?: string | null
        }
        Update: {
          avg_duration_seconds?: number | null
          avg_items_per_second?: number | null
          created_at?: string | null
          error_rate_percentage?: number | null
          failed_items?: number | null
          failed_syncs?: number | null
          id?: string
          max_duration_seconds?: number | null
          min_duration_seconds?: number | null
          period_end?: string
          period_start?: string
          platform?: string | null
          successful_items?: number | null
          successful_syncs?: number | null
          sync_type?: string | null
          time_period?: string | null
          total_items?: number | null
          total_syncs?: number | null
          user_id?: string | null
        }
        Relationships: []
      }
      sync_queue: {
        Row: {
          completed_at: string | null
          created_at: string | null
          created_by: string | null
          current_operation: string | null
          direction: string | null
          error_message: string | null
          estimated_completion: string | null
          estimated_items: number | null
          failed_items: number | null
          id: string
          metadata: Json | null
          priority: number | null
          processed_items: number | null
          progress_percentage: number | null
          queued_at: string | null
          started_at: string | null
          status: string | null
          sync_type: string | null
          updated_at: string | null
          user_id: string | null
        }
        Insert: {
          completed_at?: string | null
          created_at?: string | null
          created_by?: string | null
          current_operation?: string | null
          direction?: string | null
          error_message?: string | null
          estimated_completion?: string | null
          estimated_items?: number | null
          failed_items?: number | null
          id?: string
          metadata?: Json | null
          priority?: number | null
          processed_items?: number | null
          progress_percentage?: number | null
          queued_at?: string | null
          started_at?: string | null
          status?: string | null
          sync_type?: string | null
          updated_at?: string | null
          user_id?: string | null
        }
        Update: {
          completed_at?: string | null
          created_at?: string | null
          created_by?: string | null
          current_operation?: string | null
          direction?: string | null
          error_message?: string | null
          estimated_completion?: string | null
          estimated_items?: number | null
          failed_items?: number | null
          id?: string
          metadata?: Json | null
          priority?: number | null
          processed_items?: number | null
          progress_percentage?: number | null
          queued_at?: string | null
          started_at?: string | null
          status?: string | null
          sync_type?: string | null
          updated_at?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      sync_schedules: {
        Row: {
          created_at: string | null
          cron_expression: string | null
          description: string | null
          id: string
          interval_minutes: number | null
          is_active: boolean | null
          last_run: string | null
          name: string
          next_run: string | null
          schedule_type: string | null
          sync_direction: string | null
          target_filters: Json | null
          updated_at: string | null
          user_id: string | null
        }
        Insert: {
          created_at?: string | null
          cron_expression?: string | null
          description?: string | null
          id?: string
          interval_minutes?: number | null
          is_active?: boolean | null
          last_run?: string | null
          name: string
          next_run?: string | null
          schedule_type?: string | null
          sync_direction?: string | null
          target_filters?: Json | null
          updated_at?: string | null
          user_id?: string | null
        }
        Update: {
          created_at?: string | null
          cron_expression?: string | null
          description?: string | null
          id?: string
          interval_minutes?: number | null
          is_active?: boolean | null
          last_run?: string | null
          name?: string
          next_run?: string | null
          schedule_type?: string | null
          sync_direction?: string | null
          target_filters?: Json | null
          updated_at?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      system_alerts: {
        Row: {
          acknowledged_at: string | null
          acknowledged_by: string | null
          alert_data: Json | null
          alert_type: string | null
          created_at: string | null
          expires_at: string | null
          id: string
          is_acknowledged: boolean | null
          is_resolved: boolean | null
          message: string
          notification_channels: string[] | null
          notification_sent: boolean | null
          related_entity_id: string | null
          related_entity_type: string | null
          resolution_notes: string | null
          resolved_at: string | null
          severity: string | null
          source: string | null
          title: string
          user_id: string | null
        }
        Insert: {
          acknowledged_at?: string | null
          acknowledged_by?: string | null
          alert_data?: Json | null
          alert_type?: string | null
          created_at?: string | null
          expires_at?: string | null
          id?: string
          is_acknowledged?: boolean | null
          is_resolved?: boolean | null
          message: string
          notification_channels?: string[] | null
          notification_sent?: boolean | null
          related_entity_id?: string | null
          related_entity_type?: string | null
          resolution_notes?: string | null
          resolved_at?: string | null
          severity?: string | null
          source?: string | null
          title: string
          user_id?: string | null
        }
        Update: {
          acknowledged_at?: string | null
          acknowledged_by?: string | null
          alert_data?: Json | null
          alert_type?: string | null
          created_at?: string | null
          expires_at?: string | null
          id?: string
          is_acknowledged?: boolean | null
          is_resolved?: boolean | null
          message?: string
          notification_channels?: string[] | null
          notification_sent?: boolean | null
          related_entity_id?: string | null
          related_entity_type?: string | null
          resolution_notes?: string | null
          resolved_at?: string | null
          severity?: string | null
          source?: string | null
          title?: string
          user_id?: string | null
        }
        Relationships: []
      }
      system_metrics: {
        Row: {
          created_at: string | null
          id: string
          metric_name: string
          metric_type: string | null
          metric_unit: string | null
          metric_value: number | null
          platform: string | null
          tags: Json | null
          timestamp: string | null
          user_id: string | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          metric_name: string
          metric_type?: string | null
          metric_unit?: string | null
          metric_value?: number | null
          platform?: string | null
          tags?: Json | null
          timestamp?: string | null
          user_id?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string
          metric_name?: string
          metric_type?: string | null
          metric_unit?: string | null
          metric_value?: number | null
          platform?: string | null
          tags?: Json | null
          timestamp?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      webhook_events: {
        Row: {
          created_at: string | null
          event_type: string | null
          id: string
          last_error: string | null
          payload: Json | null
          platform_event_id: string | null
          processed: boolean | null
          processed_at: string | null
          processing_attempts: number | null
          source: string | null
          user_id: string | null
        }
        Insert: {
          created_at?: string | null
          event_type?: string | null
          id?: string
          last_error?: string | null
          payload?: Json | null
          platform_event_id?: string | null
          processed?: boolean | null
          processed_at?: string | null
          processing_attempts?: number | null
          source?: string | null
          user_id?: string | null
        }
        Update: {
          created_at?: string | null
          event_type?: string | null
          id?: string
          last_error?: string | null
          payload?: Json | null
          platform_event_id?: string | null
          processed?: boolean | null
          processed_at?: string | null
          processing_attempts?: number | null
          source?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      aggregate_sync_performance: {
        Args: {
          p_period_end: string
          p_period_start: string
          p_time_period: string
          p_user_id: string
        }
        Returns: undefined
      }
      calculate_checksum: {
        Args: { data: Json }
        Returns: string
      }
      calculate_next_sync_time: {
        Args: {
          cron_expr: string
          interval_mins: number
          last_run: string
          schedule_type: string
        }
        Returns: string
      }
      calculate_sync_progress: {
        Args: { processed: number; total: number }
        Returns: number
      }
      cleanup_old_metrics: {
        Args: Record<PropertyKey, never>
        Returns: undefined
      }
      create_alert: {
        Args: {
          p_alert_data?: Json
          p_alert_type: string
          p_message: string
          p_related_entity_id?: string
          p_related_entity_type?: string
          p_severity: string
          p_source?: string
          p_title: string
          p_user_id: string
        }
        Returns: string
      }
      create_default_dashboard_widgets: {
        Args: { p_user_id: string }
        Returns: undefined
      }
      create_default_notification_preferences: {
        Args: { p_user_id: string }
        Returns: undefined
      }
      create_restore_point: {
        Args: {
          p_description?: string
          p_name: string
          p_point_type?: string
          p_user_id: string
        }
        Returns: string
      }
      find_or_create_customer_mapping: {
        Args: {
          p_company?: string
          p_email: string
          p_first_name?: string
          p_last_name?: string
          p_shopify_customer_id: string
          p_user_id: string
        }
        Returns: string
      }
      get_changes_between: {
        Args: {
          p_end_time: string
          p_entity_type?: string
          p_start_time: string
          p_user_id: string
        }
        Returns: {
          changed_at: string
          entity_id: string
          entity_type: string
          field_name: string
          new_value: Json
          old_value: Json
          operation: string
          platform: string
        }[]
      }
      get_order_sync_stats: {
        Args: { p_days?: number; p_user_id: string }
        Returns: Json
      }
      validate_field_mapping: {
        Args: { mapping_id: string }
        Returns: Json
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
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {},
  },
} as const
