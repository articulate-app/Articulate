import { describe, expect, it } from "vitest"
import * as Y from "yjs"
import {
  applyCompletedAiPatchToYdoc,
  proposalConflictPayload,
  validateExpectedText,
} from "../app/lib/collaboration/apply-ai-proposal"
import { tipTapJsonToYDoc, yDocToPlainText } from "../app/lib/collaboration/ydoc-content"

function docWith(text: string): Y.Doc {
  return tipTapJsonToYDoc({
    type: "doc",
    content: [{ type: "paragraph", content: [{ type: "text", text }] }],
  })
}

describe("artifact collaboration AI apply (unit)", () => {
  it("creates a persistent conflict when the user changed the same sentence", () => {
    const ydoc = docWith("The user rewrote this sentence.")
    const result = applyCompletedAiPatchToYdoc({
      currentHtml: "<p>The user rewrote this sentence.</p>",
      expectedText: "The original sentence.",
      patchedHtml: "<p>The AI sentence.</p>",
      ydoc,
    })
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.status).toBe("conflict")
      expect(result.reason).toBe("expected_text_mismatch")
      const payload = proposalConflictPayload({
        expectedText: "The original sentence.",
        currentText: result.currentText,
        incomingText: "The AI sentence.",
      })
      expect(payload.kind).toBe("span_conflict")
      expect(String(payload.current)).toContain("user rewrote")
      expect(String(payload.incoming)).toContain("AI sentence")
      expect(String(payload.current).length).toBeLessThan(80)
    }
    expect(yDocToPlainText(ydoc)).toContain("The user rewrote this sentence.")
  })

  it("applies an AI patch in one transaction when expected text still matches", () => {
    const ydoc = docWith("Keep this intro. Change only the ending.")
    const result = applyCompletedAiPatchToYdoc({
      currentHtml: "<p>Keep this intro. Change only the ending.</p>",
      expectedText: "Change only the ending.",
      patchedHtml: "<p>Keep this intro. AI ending.</p>",
      ydoc,
    })
    expect(result.ok).toBe(true)
    expect(yDocToPlainText(ydoc)).toContain("AI ending")
    expect(yDocToPlainText(ydoc)).toContain("Keep this intro")
  })

  it("accepts a missing expected_text as valid for a completed proposal", () => {
    expect(validateExpectedText({
      currentHtml: "<p>Hello</p>",
      ydoc: docWith("Hello"),
    }).ok).toBe(true)
  })
})
