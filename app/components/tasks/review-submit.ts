import { NewReviewPayload } from "../../lib/types/tasks"

export async function submitTaskReview(supabase: any, payload: NewReviewPayload) {
  return supabase.from("reviews").insert(payload)
}
