"use client"

import { createClientComponentClient, type SupabaseClient } from "@supabase/auth-helpers-nextjs"

let browserClient: SupabaseClient | null = null

export function getSupabaseBrowser(): SupabaseClient {
  if (!browserClient) {
    browserClient = createClientComponentClient()
  }
  return browserClient
}

export type { SupabaseClient }


