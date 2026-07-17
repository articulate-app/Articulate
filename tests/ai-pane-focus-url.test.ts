import { describe, expect, it } from "vitest"
import {
  applyCreatedTaskSelectionUrlParams,
  buildAiPaneFocusParams,
  isAiPaneFocusMode,
  isTaskAiPaneOpen,
  isTaskDetailsAiSplitMode,
  isTaskDetailsOnlyFocusMode,
  preserveTaskDetailsFocusWhenOpeningAi,
} from "../app/components/tasks/ai-pane-focus-url"

describe("ai pane focus url helpers", () => {
  it("enables shareable ai focus mode", () => {
    const current = new URLSearchParams("layout=left,middle&taskAiOpen=true&aiThreadId=thread-a")
    const next = buildAiPaneFocusParams(current, true)

    expect(next.get("aiFocus")).toBe("true")
    expect(next.get("taskAiOpen")).toBe("true")
    expect(next.get("rightView")).toBe("ai")
    expect(next.get("layout")?.includes("right")).toBe(true)
    expect(next.get("aiThreadId")).toBe("thread-a")
    expect(isAiPaneFocusMode(next)).toBe(true)
  })

  it("disables ai focus mode without mutating thread id", () => {
    const current = new URLSearchParams("layout=left,middle,right&taskAiOpen=true&aiThreadId=thread-b&aiFocus=true")
    const next = buildAiPaneFocusParams(current, false)

    expect(next.get("aiFocus")).toBeNull()
    expect(next.get("aiThreadId")).toBe("thread-b")
    expect(isAiPaneFocusMode(next)).toBe(false)
  })

  it("detects focused task details only mode", () => {
    const params = new URLSearchParams(
      "layout=right&focus=right&rightView=details&id=13131&taskTab=content"
    )
    expect(isTaskDetailsOnlyFocusMode(params)).toBe(true)
    expect(isTaskDetailsAiSplitMode(params)).toBe(false)
  })

  it("detects focused task details + ai split mode", () => {
    const params = new URLSearchParams(
      "layout=right&focus=right&rightView=ai&taskAiOpen=true&id=13131&aiThreadId=thread-a"
    )
    expect(isTaskDetailsOnlyFocusMode(params)).toBe(false)
    expect(isTaskDetailsAiSplitMode(params)).toBe(true)
  })

  it("preserves focus=right when opening ai from focused task details", () => {
    const current = new URLSearchParams(
      "layout=right&object=task&focus=right&rightView=details&id=13131&taskTab=content&taskAiOpen=true&aiThreadId=thread-a"
    )
    const next = preserveTaskDetailsFocusWhenOpeningAi(current)

    expect(next.get("focus")).toBe("right")
    expect(next.get("rightView")).toBe("ai")
    expect(next.get("taskAiOpen")).toBe("true")
    expect(next.get("id")).toBe("13131")
    expect(next.get("aiThreadId")).toBe("thread-a")
    expect(isTaskDetailsAiSplitMode(next)).toBe(true)
  })

  it("does not force focus=right when opening ai without focused task context", () => {
    const current = new URLSearchParams("layout=left,middle&object=task&mode=grouped")
    const next = preserveTaskDetailsFocusWhenOpeningAi(current)

    expect(next.get("focus")).toBeNull()
    expect(next.get("rightView")).toBe("ai")
    expect(next.get("taskAiOpen")).toBe("true")
  })

  it("preserves ai pane state when selecting a newly created task", () => {
    const current = new URLSearchParams(
      "layout=right&rightView=ai&taskAiOpen=true&object=task&mode=grouped&project=111&centerTaskId=13167&aiThreadId=de35b6e5-c5aa-4193-8740-84f84646e482"
    )
    const next = applyCreatedTaskSelectionUrlParams(current, 13334)

    expect(isTaskAiPaneOpen(next)).toBe(true)
    expect(next.get("rightView")).toBe("ai")
    expect(next.get("taskAiOpen")).toBe("true")
    expect(next.get("aiThreadId")).toBe("de35b6e5-c5aa-4193-8740-84f84646e482")
    expect(next.get("id")).toBe("13334")
    expect(next.get("centerTaskId")).toBe("13167")
  })

  it("opens task details when ai pane was closed before task creation", () => {
    const current = new URLSearchParams(
      "layout=left,middle,right&rightView=details&taskAiOpen=false&object=task&project=111"
    )
    const next = applyCreatedTaskSelectionUrlParams(current, 13334)

    expect(isTaskAiPaneOpen(next)).toBe(false)
    expect(next.get("rightView")).toBe("details")
    expect(next.get("taskAiOpen")).toBe("false")
    expect(next.get("aiThreadId")).toBeNull()
    expect(next.get("id")).toBe("13334")
  })
})
