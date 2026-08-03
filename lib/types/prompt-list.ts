export interface PromptList {
  id: number
  name: string
  notes?: string | null
  created_by: number
  created_at: string
  updated_at: string
}

export interface PromptListItem {
  id: number
  list_id: number
  prompt: string
  language_code?: string | null
  region_id?: string | null
  notes?: string | null
  added_by: number
  added_at: string
  updated_at: string
}
