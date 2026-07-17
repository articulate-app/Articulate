import { describe, expect, it } from "vitest"
import {
  applyAiChatTaskLinkNavigation,
  buildNextUrlForEntityLink,
  getResolvedTaskIdFromSearchParams,
  parseAppEntityLink,
} from "../features/ai-chat/app-entity-links"

const aiSplitUrl =
  "layout=right&focus=right&rightView=ai&taskAiOpen=true&centerTaskId=13131&taskTab=content&activeChannelId=11&aiThreadId=thread-a&object=task&mode=grouped"

describe("parseAppEntityLink", () => {
  it("parses app://task links", () => {
    expect(parseAppEntityLink("app://task/13131")).toEqual({ type: "task", id: 13131 })
  })
})

describe("getResolvedTaskIdFromSearchParams", () => {
  it("prefers centerTaskId over legacy id", () => {
    const params = new URLSearchParams("centerTaskId=13131&id=999")
    expect(getResolvedTaskIdFromSearchParams(params)).toBe(13131)
  })
})

describe("applyAiChatTaskLinkNavigation", () => {
  it("returns null for the same task without mutating params", () => {
    const current = new URLSearchParams(aiSplitUrl)
    expect(applyAiChatTaskLinkNavigation(current, 13131)).toBeNull()
  })

  it("preserves ai split layout when opening a different task", () => {
    const current = new URLSearchParams(aiSplitUrl)
    const next = applyAiChatTaskLinkNavigation(current, 14000)
    expect(next?.get("centerTaskId")).toBe("14000")
    expect(next?.get("layout")).toBe("right")
    expect(next?.get("focus")).toBe("right")
    expect(next?.get("rightView")).toBe("ai")
    expect(next?.get("taskAiOpen")).toBe("true")
    expect(next?.get("taskTab")).toBe("content")
    expect(next?.get("activeChannelId")).toBe("11")
    expect(next?.get("aiThreadId")).toBe("thread-a")
    expect(next?.get("id")).toBeNull()
  })
})

describe("buildNextUrlForEntityLink", () => {
  it("no-ops same-task clicks from ai chat", () => {
    const nextUrl = buildNextUrlForEntityLink({
      currentPathname: "/",
      currentSearchParams: new URLSearchParams(aiSplitUrl),
      parsedLink: { type: "task", id: 13131 },
      fromAiChat: true,
    })
    expect(nextUrl).toBeNull()
  })

  it("keeps ai pane open for different-task clicks from ai chat", () => {
    const nextUrl = buildNextUrlForEntityLink({
      currentPathname: "/",
      currentSearchParams: new URLSearchParams(aiSplitUrl),
      parsedLink: { type: "task", id: 14000 },
      fromAiChat: true,
    })
    expect(nextUrl).toContain("centerTaskId=14000")
    expect(nextUrl).toContain("rightView=ai")
    expect(nextUrl).toContain("taskAiOpen=true")
    expect(nextUrl).toContain("focus=right")
    expect(nextUrl).not.toContain("rightView=details")
  })

  it("still switches to details for non-ai navigation", () => {
    const nextUrl = buildNextUrlForEntityLink({
      currentPathname: "/",
      currentSearchParams: new URLSearchParams("layout=left,middle&object=task"),
      parsedLink: { type: "task", id: 13131 },
    })
    expect(nextUrl).toContain("id=13131")
    expect(nextUrl).toContain("rightView=details")
  })
})
