import { describe, expect, it } from "vitest"
import { aiApplyOriginTag } from "../app/lib/collaboration/apply-ai-proposal-pipeline"
import { applyCompletedAiPatchToYdoc } from "../app/lib/collaboration/apply-ai-proposal"
import { tipTapJsonToYDoc, yDocToPlainText } from "../app/lib/collaboration/ydoc-content"

describe("artifact collaboration AI pipeline (unit)", () => {
  it("keeps origin metadata compact and complete enough to retry", () => {
    const tag = aiApplyOriginTag({
      proposalId: "11111111-1111-4111-8111-111111111111",
      agentId: "ai-artifact-worker",
      runId: "22222222-2222-4222-8222-222222222222",
      messageId: "33333333-3333-4333-8333-333333333333",
      threadId: "44444444-4444-4444-8444-444444444444",
      idempotencyKey: "build:unit:patches",
    })
    expect(tag.startsWith("ai:")).toBe(true)
    expect(tag.length).toBeLessThanOrEqual(80)
    expect(tag).toContain("build:unit:patches")
  })

  it("applies two agents on different sentences without dropping either", () => {
    const ydoc = tipTapJsonToYDoc({
      type: "doc",
      content: [{
        type: "paragraph",
        content: [{ type: "text", text: "Alpha stays. Bravo changes." }],
      }],
    })
    const first = applyCompletedAiPatchToYdoc({
      currentHtml: "<p>Alpha stays. Bravo changes.</p>",
      expectedText: "Bravo changes.",
      patchedHtml: "<p>Alpha stays. Bravo done.</p>",
      ydoc,
    })
    expect(first.ok).toBe(true)
    const second = applyCompletedAiPatchToYdoc({
      currentHtml: yDocToPlainText(ydoc),
      expectedText: "Alpha stays.",
      patchedHtml: "<p>Alpha rewritten. Bravo done.</p>",
      ydoc,
    })
    expect(second.ok).toBe(true)
    expect(yDocToPlainText(ydoc)).toContain("Alpha rewritten")
    expect(yDocToPlainText(ydoc)).toContain("Bravo done")
  })

  it("conflicts when two agents target the same sentence after the first apply", () => {
    const ydoc = tipTapJsonToYDoc({
      type: "doc",
      content: [{
        type: "paragraph",
        content: [{ type: "text", text: "Shared sentence stays here." }],
      }],
    })
    const first = applyCompletedAiPatchToYdoc({
      currentHtml: "<p>Shared sentence stays here.</p>",
      expectedText: "Shared sentence stays here.",
      patchedHtml: "<p>Agent A rewrote it.</p>",
      ydoc,
    })
    expect(first.ok).toBe(true)
    const second = applyCompletedAiPatchToYdoc({
      currentHtml: "<p>Agent A rewrote it.</p>",
      expectedText: "Shared sentence stays here.",
      patchedHtml: "<p>Agent B rewrote it.</p>",
      ydoc,
    })
    expect(second.ok).toBe(false)
    if (!second.ok) expect(second.status).toBe("conflict")
    expect(yDocToPlainText(ydoc)).toContain("Agent A rewrote it")
    expect(yDocToPlainText(ydoc)).not.toContain("Agent B rewrote it")
  })
})
