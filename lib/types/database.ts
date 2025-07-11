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
      [_ in never]: never
    }
    Enums: {
      [_ in never]: never
    }
  }
} 