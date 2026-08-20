import { describe, expect, it } from "vitest"
import { parseCollabConflict } from "../app/lib/collaboration/collab-conflict"

describe("collab conflict parse", () => {
  it("clips a whole-article payload down to the colliding phrase", () => {
    const article = [
      "Intro stays the same across both versions of this article.",
      "The user rewrote this sentence.",
      "Closing stays the same across both versions of this article.",
    ].join(" ")
    const parsed = parseCollabConflict({
      id: "proposal-1",
      conflict: {
        kind: "expected_text_mismatch",
        current_text: article,
        expected_text: [
          "Intro stays the same across both versions of this article.",
          "The original sentence.",
          "Closing stays the same across both versions of this article.",
        ].join(" "),
        incoming: "The AI sentence.",
      },
    })
    expect(parsed?.id).toBe("proposal-1")
    expect(parsed?.current).toContain("user rewrote")
    expect(parsed?.current).not.toContain("Closing stays")
    expect(parsed?.incoming).toBe("The AI sentence.")
    expect((parsed?.current ?? "").length).toBeLessThan(80)
  })
})
