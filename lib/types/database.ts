export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export interface Database {
  public: {
    Tables: {
      tasks: {
        Row: {
          id: number
          title: string
          project_id_int: number
          project_status_id: number
          delivery_date: string | null
          publication_date: string | null
          notes: string | null
          briefing: string | null
          attachment: string | null
          copy_post: string | null
          key_visual: string | null
          related_products: string | null
          linkbuilding: string | null
          keyword: string | null
          meta_title: string | null
          meta_description: string | null
          h1: string | null
          h2: string | null
          alt_text: string | null
          filename: string | null
          internal_links: string | null
          tags: string | null
          category: string | null
          secondary_keywords: string | null
          is_parent_task: boolean
          is_deleted: boolean
          created_at: string
          updated_at: string
          synced_at: string | null
          production_type_id: number
          language_id: number
          briefing_type_id: number | null
          content_type_id: number
          assigned_to_id: number
          parent_task_id_int: number | null
          channels: string[] | null
        }
        Insert: {
          // Define insert types if needed
        }
        Update: {
          // Define update types if needed
        }
        Relationships: []
      }
      users: {
        Row: {
          id: number
          full_name: string
          email: string
          created_at: string
          updated_at: string
        }
        Insert: {
          // Define insert types if needed
        }
        Update: {
          // Define update types if needed
        }
        Relationships: []
      },
      mentions: {
        Row: {
          id: number
          comment: string | null
          attachment: string | null
          created_by: number | null
          created_at: string | null
          reply_to_id: number | null
          thread_id: number | null
        }
        Insert: {
          comment?: string | null
          attachment?: string | null
          created_by?: number | null
          created_at?: string | null
          reply_to_id?: number | null
          thread_id?: number | null
        }
        Update: {
          comment?: string | null
          attachment?: string | null
          created_by?: number | null
          created_at?: string | null
          reply_to_id?: number | null
          thread_id?: number | null
        }
        Relationships: []
      },
      task_activity_logs: {
        Row: {
          id: number
          task_id: number
          created_by: number
          action: string
          task_parameter: string | null
          new_value: string | null
          created_at: string
        }
        Insert: {
          // Define insert types if needed
        }
        Update: {
          // Define update types if needed
        }
        Relationships: []
      }
      // Add other tables as needed
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      project_channel_briefing_types: {
        Args: {
          p_project_id: number
          p_content_type_id: number
          p_channel_id: number
        }
        Returns: {
          briefing_type_id: number
          title: string
          description: string | null
          is_assigned_to_channel: boolean
          is_default_for_channel: boolean
          effective_default_briefing_type_id: number | null
          option_group: 'assigned' | 'available'
          channel_position: number | null
          project_position: number | null
        }[]
      }
      pcctb_add: {
        Args: {
          p_project_id: number
          p_content_type_id: number
          p_channel_id: number
          p_briefing_type_id: number
        }
        Returns: unknown
      }
      pcctb_set_default: {
        Args: {
          p_project_id: number
          p_content_type_id: number
          p_channel_id: number
          p_briefing_type_id: number
        }
        Returns: unknown
      }
      /**
       * Add a project-scoped component to the Project × Content Type × Channel × Briefing Type component list.
       * Note: `p_briefing_type_id` is required so inserted rows match the page filter.
       */
      pcctbc_add_project: {
        Args: {
          p_project_id: number
          p_content_type_id: number
          p_channel_id: number
          p_briefing_type_id: number
          p_project_component_id: number
          p_position: number | null
          p_custom_title: string | null
          p_custom_description: string | null
          p_purpose: string | null
          p_guidance: string | null
          p_suggested_word_count: number | null
          p_subheads: Json | null
        }
        Returns: unknown
      }
    }
    Enums: {
      [_ in never]: never
    }
  }
} 