/**
 * Type definitions for chat/DM functionality
 */

export type UserDmThread = {
  id: number
  title: string | null
  created_by: number
  user_id: number
  is_private: boolean
  created_at: string

  me_id: number
  other_user_id: number
  other_user_name: string
  other_user_email: string
  other_user_photo: string | null

  last_message_at: string | null
  last_comment: string | null
}

export type UserDmSearchResult = {
  mention_id: number
  thread_id: number
  thread_title: string | null
  other_user_id: number
  other_user_name: string
  other_user_email: string
  other_user_photo: string | null
  comment: string
  created_at: string
}
