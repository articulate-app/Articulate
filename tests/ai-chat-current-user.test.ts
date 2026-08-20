import { describe, expect, it } from "vitest"
import {
  buildCurrentUserContextPrompt,
  normalizeAiChatCurrentUser,
} from "../supabase/functions/_shared/ai-chat-current-user"

describe("ai chat current user", () => {
  it("normalizes the signed-in workspace user", () => {
    expect(normalizeAiChatCurrentUser({ id: 12, full_name: "Ivo Relvas" })).toEqual({
      user_id: 12,
      full_name: "Ivo Relvas",
      first_name: "Ivo",
    })
    expect(normalizeAiChatCurrentUser({ id: 0, full_name: "Boavista" })).toBeNull()
  })

  it("labels the speaker so project names are not treated as the user", () => {
    const prompt = buildCurrentUserContextPrompt({
      user_id: 12,
      full_name: "Ivo Relvas",
      first_name: "Ivo",
    })
    expect(prompt).toContain("CURRENT USER")
    expect(prompt).toContain("Ivo Relvas")
    expect(prompt).toContain("signed-in person")
    expect(prompt).not.toContain("Boavista")
  })
})
