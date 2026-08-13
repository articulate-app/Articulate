import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs"
import { cookies } from "next/headers"
import type { SupabaseClient } from "@supabase/supabase-js"

export async function requireAppUser(): Promise<{
  supabase: SupabaseClient
  authUserId: string
  userId: number
  email: string | null
}> {
  const supabase = createRouteHandlerClient({ cookies })
  const {
    data: { session },
  } = await supabase.auth.getSession()
  if (!session?.user?.id) {
    throw new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    })
  }

  const { data: profile, error } = await supabase
    .from("users")
    .select("id, email")
    .eq("auth_user_id", session.user.id)
    .maybeSingle()

  if (error || !profile?.id) {
    throw new Response(JSON.stringify({ error: "User profile not found" }), {
      status: 403,
      headers: { "Content-Type": "application/json" },
    })
  }

  return {
    supabase,
    authUserId: session.user.id,
    userId: Number(profile.id),
    email: typeof profile.email === "string" ? profile.email : session.user.email ?? null,
  }
}

export function jsonError(error: unknown, fallbackStatus = 500) {
  if (error instanceof Response) return error
  const message = error instanceof Error ? error.message : String(error)
  return Response.json({ error: message }, { status: fallbackStatus })
}
