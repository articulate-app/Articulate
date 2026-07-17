import { describe, expect, it } from "vitest"
import { applyAiThreadOpenParams, buildNewAiThreadParams } from "../app/lib/ai-thread-route"

describe("ai-thread-route", () => {
  it("opens a clicked thread and keeps right pane visible", () => {
    const current = new URLSearchParams("layout=left,middle&rightView=task")
    const next = applyAiThreadOpenParams(current, "thread-b")

    expect(next.get("aiThreadId")).toBe("thread-b")
    expect(next.get("rightView")).toBe("ai")
    expect(next.get("taskAiOpen")).toBe("true")
    expect(next.get("layout")).toContain("right")
  })

  it("builds create-new-ai-thread params without auto-selecting existing thread", () => {
    const current = new URLSearchParams("layout=left,middle,right&taskAiOpen=true&aiThreadId=thread-a")
    const next = buildNewAiThreadParams(current)

    expect(next.get("newAiThread")).toBe("true")
    expect(next.get("aiThreadId")).toBeNull()
    expect(next.get("taskAiOpen")).toBe("true")
    expect(next.get("rightView")).toBe("ai")
  })
})
