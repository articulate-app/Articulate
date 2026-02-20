import { supabase } from "../supabase"

/**
 * Resolves the app's internal `users.id` from the authenticated Supabase user.
 * Returns null if the user is not signed in or the mapping is missing.
 */
export async function getCurrentUserId(): Promise<{ data: number | null; error: any }> {
  const { data: authData, error: authError } = await supabase.auth.getUser()
  if (authError) return { data: null, error: authError }

  const authUserId = authData?.user?.id
  if (!authUserId) return { data: null, error: null }

  const { data: row, error } = await supabase
    .from("users")
    .select("id")
    .eq("auth_user_id", authUserId)
    .maybeSingle()

  return { data: (row?.id as number | undefined) ?? null, error }
}


