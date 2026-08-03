"use client"

import { useCallback, useEffect, useState } from "react"
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs"

export type PromptSearchHistoryRow = {
  id: number
  term: string
  language_code: string | null
  searched_by: number
  searched_at: string
}

const REST_BASE = "https://hlszgarnpleikfkwujph.supabase.co/rest/v1"

async function getAuthHeaders() {
  const supabase = createClientComponentClient()
  const {
    data: { session },
  } = await supabase.auth.getSession()

  return {
    "Content-Type": "application/json",
    Prefer: "return=representation",
    apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    Authorization: session?.access_token
      ? `Bearer ${session.access_token}`
      : `Bearer ${process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY}`,
  }
}

/**
 * Prompt research history — mirrors keyword history (direct Supabase REST + user session).
 */
export function usePromptSearchHistory() {
  const [searchHistory, setSearchHistory] = useState<PromptSearchHistoryRow[]>([])
  const [historyLoading, setHistoryLoading] = useState(false)

  const fetchSearchHistory = useCallback(async () => {
    setHistoryLoading(true)
    try {
      const headers = await getAuthHeaders()
      const response = await fetch(
        `${REST_BASE}/prompt_search_history?select=id,term,language_code,searched_by,searched_at&order=searched_at.desc&limit=50`,
        { headers },
      )
      if (!response.ok) return
      const data = (await response.json()) as PromptSearchHistoryRow[]
      setSearchHistory(Array.isArray(data) ? data : [])
    } catch (error) {
      console.error("Failed to fetch prompt search history:", error)
    } finally {
      setHistoryLoading(false)
    }
  }, [])

  const logSearch = useCallback(
    async (term: string, languageCode?: string) => {
      const trimmed = term.trim()
      if (!trimmed) return
      try {
        const supabase = createClientComponentClient()
        const {
          data: { user },
        } = await supabase.auth.getUser()
        if (!user) return

        const { data: dbUser } = await supabase
          .from("users")
          .select("id")
          .eq("auth_user_id", user.id)
          .single()
        if (!dbUser) return

        const headers = await getAuthHeaders()
        const response = await fetch(`${REST_BASE}/prompt_search_history`, {
          method: "POST",
          headers,
          body: JSON.stringify({
            term: trimmed,
            language_code: languageCode || null,
            searched_by: dbUser.id,
          }),
        })
        if (!response.ok) return
        await fetchSearchHistory()
      } catch (error) {
        console.error("Failed to log prompt search:", error)
      }
    },
    [fetchSearchHistory],
  )

  useEffect(() => {
    void fetchSearchHistory()
  }, [fetchSearchHistory])

  return {
    searchHistory,
    historyLoading,
    fetchSearchHistory,
    logSearch,
  }
}
