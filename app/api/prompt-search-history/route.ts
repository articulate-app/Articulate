import { NextRequest, NextResponse } from "next/server"
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs"
import { getCurrentUser } from "../../../lib/utils/getCurrentUser"
import type { PromptSearchHistoryRow } from "../../hooks/usePromptSearchHistory"

export async function GET() {
  try {
    const currentUser = await getCurrentUser()
    if (!currentUser) {
      return NextResponse.json(
        { error: { code: 401, message: "Unauthorized" } },
        { status: 401 },
      )
    }

    const supabase = createClientComponentClient()
    const { data, error } = await supabase
      .from("prompt_search_history")
      .select("id, term, language_code, searched_by, searched_at")
      .eq("searched_by", currentUser.id)
      .order("searched_at", { ascending: false })
      .limit(50)

    if (error) {
      console.error("Error fetching prompt search history:", error)
      return NextResponse.json(
        { error: { code: 500, message: "Failed to fetch search history" } },
        { status: 500 },
      )
    }

    return NextResponse.json({
      history: (data || []) as PromptSearchHistoryRow[],
    })
  } catch (error) {
    console.error("GET /api/prompt-search-history error:", error)
    return NextResponse.json(
      { error: { code: 500, message: "Internal server error" } },
      { status: 500 },
    )
  }
}

export async function POST(request: NextRequest) {
  try {
    const currentUser = await getCurrentUser()
    if (!currentUser) {
      return NextResponse.json(
        { error: { code: 401, message: "Unauthorized" } },
        { status: 401 },
      )
    }

    const body = (await request.json()) as {
      term?: string
      languageCode?: string | null
    }
    const term = typeof body.term === "string" ? body.term.trim() : ""
    if (!term) {
      return NextResponse.json(
        { error: { code: 400, message: "Search term is required" } },
        { status: 400 },
      )
    }

    const languageCode =
      typeof body.languageCode === "string" && body.languageCode.trim()
        ? body.languageCode.trim()
        : null

    const supabase = createClientComponentClient()
    const { data, error } = await supabase
      .from("prompt_search_history")
      .insert({
        term,
        language_code: languageCode,
        searched_by: currentUser.id,
      })
      .select("id, term, language_code, searched_by, searched_at")
      .single()

    if (error) {
      console.error("Error logging prompt search history:", error)
      return NextResponse.json(
        { error: { code: 500, message: "Failed to log search history" } },
        { status: 500 },
      )
    }

    return NextResponse.json(data)
  } catch (error) {
    console.error("POST /api/prompt-search-history error:", error)
    return NextResponse.json(
      { error: { code: 500, message: "Internal server error" } },
      { status: 500 },
    )
  }
}
