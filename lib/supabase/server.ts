import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

function parseSupabaseCookie(cookieValue: string | undefined): string {
  if (!cookieValue) return '';
  try {
    // Try to parse as JSON array and return the first element (the JWT)
    const arr = JSON.parse(decodeURIComponent(cookieValue));
    if (Array.isArray(arr) && typeof arr[0] === 'string') {
      return arr[0];
    }
  } catch {
    // Fallback: return as is
    return cookieValue;
  }
  return cookieValue;
}

export function createClient() {
  const cookieStore = cookies()
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll().map(({ name, value, ...rest }) => ({
            name,
            value: parseSupabaseCookie(value),
            ...rest,
          }));
        }
      }
    }
  )
}
