import { describe, expect, it } from "vitest"
import {
  buildArticulatePublicationPrompt,
  parseArticulateReasonStep,
} from "../supabase/functions/_shared/publishing/articulate-reason-step"

describe("articulate publication reasoning", () => {
  it("forbids inventing a second browser agent and credentials", () => {
    const { system } = buildArticulatePublicationPrompt({
      task: "Prepare a blog draft",
      url: "https://cms.example/login",
      allowFinalPublish: false,
    })
    expect(system).toMatch(/only reasoning agent/i)
    expect(system).toMatch(/Never fill password fields/)
    expect(system).toMatch(/Never invent URLs/)
    expect(system).toMatch(/never click the final irreversible/i)
  })

  it("parses concrete BrowserController actions", () => {
    const parsed = parseArticulateReasonStep({
      thought: "Open the editor",
      status: "continue",
      actions: [
        { type: "navigate", url: "https://cms.example/new" },
        { type: "click", index: 3 },
      ],
      message: "Opening the editor",
    })
    expect(parsed.status).toBe("continue")
    expect(parsed.actions).toEqual([
      { type: "navigate", url: "https://cms.example/new" },
      { type: "click", index: 3 },
    ])
  })

  it("maps needs_user without executing actions", () => {
    const parsed = parseArticulateReasonStep({
      thought: "Login wall",
      status: "needs_user",
      actions: [{ type: "type", index: 1, text: "secret" }],
      message: "Sign in in the browser.",
      publication_phase: "needs_user",
    })
    expect(parsed.status).toBe("needs_user")
    expect(parsed.actions).toEqual([])
    expect(parsed.publication_phase).toBe("needs_user")
  })
})
