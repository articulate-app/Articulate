import { describe, expect, it } from "vitest"
import {
  applyCreatedTaskSelectionUrlParams,
  buildAiPaneFocusParams,
  buildMiddlePaneFocusParams,
  isAiPaneFocusMode,
  isMiddlePaneFocusMode,
  isMiddleRightSplitMode,
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
    expect(next.get("layout")).toBe("right")
    expect(next.get("aiThreadId")).toBe("thread-a")
    expect(isAiPaneFocusMode(next)).toBe(true)
  })

  it("disables ai focus mode without mutating thread id", () => {
    const current = new URLSearchParams("layout=right&taskAiOpen=true&aiThreadId=thread-b&aiFocus=true")
    const next = buildAiPaneFocusParams(current, false)

    expect(next.get("aiFocus")).toBeNull()
    expect(next.get("aiThreadId")).toBe("thread-b")
    expect(next.get("layout")).toBe("left,middle,right")
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

  it("converts expanded middle focus into the details+AI split when opening ai", () => {
    const current = new URLSearchParams(
      "layout=left,middle,right&focus=middle&centerArtifactId=art-1&rightView=ai&taskAiOpen=true",
    )
    const next = preserveTaskDetailsFocusWhenOpeningAi(current)

    expect(next.get("focus")).toBe("right")
    expect(next.get("rightView")).toBe("ai")
    expect(next.get("taskAiOpen")).toBe("true")
    expect(next.get("centerArtifactId")).toBe("art-1")
    expect(isTaskDetailsAiSplitMode(next)).toBe(true)
    expect(isMiddleRightSplitMode(next)).toBe(true)
    expect(isMiddlePaneFocusMode(next)).toBe(false)
  })

  it("treats focus=right + rightView=start as a middle+right split", () => {
    const params = new URLSearchParams(
      "layout=left,middle,right&focus=right&centerArtifactId=art-1&rightView=start",
    )
    expect(isMiddleRightSplitMode(params)).toBe(true)
    expect(isTaskDetailsAiSplitMode(params)).toBe(false)
    expect(isMiddlePaneFocusMode(params)).toBe(false)
  })

  it("does not force focus=right when opening ai without focused task context", () => {
    const current = new URLSearchParams("layout=left,middle&object=task&mode=grouped")
    const next = preserveTaskDetailsFocusWhenOpeningAi(current)

    expect(next.get("focus")).toBeNull()
    expect(next.get("rightView")).toBe("ai")
    expect(next.get("taskAiOpen")).toBe("true")
  })

  it("expands middle pane without rewriting rightView / AI state", () => {
    const current = new URLSearchParams(
      "layout=middle,right&rightView=ai&taskAiOpen=true&aiThreadId=thread-a&centerUserId=60&rightUserId=60",
    )
    const next = buildMiddlePaneFocusParams(current, true)

    expect(next.get("focus")).toBe("middle")
    expect(next.get("rightView")).toBe("ai")
    expect(next.get("taskAiOpen")).toBe("true")
    expect(next.get("aiThreadId")).toBe("thread-a")
    expect(next.get("centerUserId")).toBe("60")
    expect(next.get("rightUserId")).toBe("60")
    expect(isMiddlePaneFocusMode(next)).toBe(true)
    expect(isTaskDetailsOnlyFocusMode(next)).toBe(false)
  })

  it("collapses middle pane focus without touching right pane params", () => {
    const current = new URLSearchParams(
      "layout=middle,right&focus=middle&rightView=ai&taskAiOpen=true&aiThreadId=thread-a",
    )
    const next = buildMiddlePaneFocusParams(current, false)

    expect(next.get("focus")).toBeNull()
    expect(next.get("rightView")).toBe("ai")
    expect(next.get("taskAiOpen")).toBe("true")
    expect(isMiddlePaneFocusMode(next)).toBe(false)
  })

  it("treats legacy focus=right&rightView=details as middle focus", () => {
    const params = new URLSearchParams(
      "layout=right&focus=right&rightView=details&id=13131&taskTab=content",
    )
    expect(isMiddlePaneFocusMode(params)).toBe(true)
  })

  it("moves rightThreadId into centerThreadId when opening ai", () => {
    const current = new URLSearchParams(
      "layout=right&rightView=details&object=all&rightThreadId=8935&rightMentionId=8935",
    )
    const next = preserveTaskDetailsFocusWhenOpeningAi(current)

    expect(next.get("rightView")).toBe("ai")
    expect(next.get("taskAiOpen")).toBe("true")
    expect(next.get("centerThreadId")).toBe("8935")
    expect(next.get("centerMentionId")).toBe("8935")
    expect(next.get("rightThreadId")).toBeNull()
    expect(next.get("rightMentionId")).toBeNull()
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
