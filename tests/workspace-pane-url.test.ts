import { describe, expect, it } from "vitest"
import {
  applyCloseLeftPaneToSearchParams,
  applyWorkspaceViewToSearchParams,
  getActiveLeftWorkspaceTab,
  getActiveMiddleWorkspaceTab,
  getActiveRightWorkspaceTab,
  isAiActiveInPane,
  isRightViewEntityType,
  LEFT_PANE_EMPTY_VIEW,
} from "../app/lib/workspace-pane-url"

describe("workspace-pane-url", () => {
  it("parses middle task from centerTaskId (compat)", () => {
    const params = new URLSearchParams(
      "layout=right&centerTaskId=13418&rightView=ai&taskAiOpen=true&aiThreadId=abc",
    )
    const middle = getActiveMiddleWorkspaceTab(params)
    const right = getActiveRightWorkspaceTab(params)
    expect(middle).toMatchObject({ type: "task", id: "13418" })
    expect(right).toMatchObject({ type: "ai", id: "abc" })
    expect(isAiActiveInPane(params, "right")).toBe(true)
    expect(isAiActiveInPane(params, "middle")).toBe(false)
  })

  it("parses AI in middle via centerView=ai", () => {
    const params = new URLSearchParams(
      "layout=left,middle,right&centerView=ai&aiThreadId=thread-1&rightView=task&rightTaskId=99",
    )
    expect(getActiveMiddleWorkspaceTab(params)).toMatchObject({
      type: "ai",
      id: "thread-1",
    })
    expect(getActiveRightWorkspaceTab(params)).toMatchObject({
      type: "task",
      id: "99",
    })
    expect(isAiActiveInPane(params, "middle")).toBe(true)
    expect(isAiActiveInPane(params, "right")).toBe(false)
  })

  it("opens task in right without clearing middle AI", () => {
    const current = new URLSearchParams(
      "layout=left,middle,right&centerView=ai&aiThreadId=thread-1&taskAiOpen=true",
    )
    const next = applyWorkspaceViewToSearchParams({
      current,
      pane: "right",
      type: "task",
      id: 13418,
    })
    expect(next.get("centerView")).toBe("ai")
    expect(next.get("aiThreadId")).toBe("thread-1")
    expect(next.get("rightView")).toBe("task")
    expect(next.get("rightTaskId")).toBe("13418")
  })

  it("opens AI in middle and demotes right AI host (single pane)", () => {
    const current = new URLSearchParams(
      "layout=right&centerTaskId=1&rightView=ai&taskAiOpen=true&aiThreadId=t1",
    )
    const next = applyWorkspaceViewToSearchParams({
      current,
      pane: "middle",
      type: "ai",
      params: { aiThreadId: "t1" },
    })
    expect(next.get("centerView")).toBe("ai")
    expect(next.get("aiThreadId")).toBe("t1")
    // AI may only be active in one pane — demote the previous right host.
    expect(next.get("rightView")).toBe("details")
  })

  it("opens AI on right and clears middle AI host (single pane)", () => {
    const current = new URLSearchParams(
      "layout=left,middle&centerView=ai&aiThreadId=t1",
    )
    const next = applyWorkspaceViewToSearchParams({
      current,
      pane: "right",
      type: "ai",
      params: { forceNewAiThread: true },
    })
    expect(next.get("rightView")).toBe("ai")
    expect(next.get("taskAiOpen")).toBe("true")
    expect(next.get("centerView")).toBeNull()
    expect(next.get("newAiThread")).toBe("true")
  })

  it("case1: open user in right preserves middle project", () => {
    const current = new URLSearchParams(
      "layout=right&rightView=project&centerProjectId=33&rightProjectId=33&object=project",
    )
    const next = applyWorkspaceViewToSearchParams({
      current,
      pane: "right",
      type: "user",
      id: 60,
    })
    expect(next.get("centerProjectId")).toBe("33")
    expect(next.get("centerUserId")).toBeNull()
    expect(next.get("rightView")).toBe("user")
    expect(next.get("rightUserId")).toBe("60")
    expect(next.get("rightProjectId")).toBeNull()
  })

  it("case2: open project in right preserves middle task", () => {
    const current = new URLSearchParams(
      "layout=left,middle,right&centerTaskId=13418&rightView=ai&taskAiOpen=true&aiThreadId=thread-a",
    )
    const next = applyWorkspaceViewToSearchParams({
      current,
      pane: "right",
      type: "project",
      id: 33,
    })
    expect(next.get("centerTaskId")).toBe("13418")
    expect(next.get("rightView")).toBe("project")
    expect(next.get("rightProjectId")).toBe("33")
    expect(next.get("aiThreadId")).toBe("thread-a")
  })

  it("case3: open user in middle preserves right artifact", () => {
    const current = new URLSearchParams(
      "layout=left,middle,right&centerView=browser&browserTabId=b1&rightView=artifact&rightArtifactId=art-a",
    )
    const next = applyWorkspaceViewToSearchParams({
      current,
      pane: "middle",
      type: "user",
      id: 60,
    })
    expect(next.get("centerUserId")).toBe("60")
    expect(next.get("centerView")).toBeNull()
    expect(next.get("rightView")).toBe("artifact")
    expect(next.get("rightArtifactId")).toBe("art-a")
  })

  it("case4: activating same entity id in right does not rewrite middle", () => {
    const current = new URLSearchParams(
      "layout=right&centerProjectId=33&rightView=project&rightProjectId=33",
    )
    const next = applyWorkspaceViewToSearchParams({
      current,
      pane: "right",
      type: "project",
      id: 33,
    })
    expect(next.get("centerProjectId")).toBe("33")
    expect(next.get("rightProjectId")).toBe("33")
    expect(next.get("rightView")).toBe("project")
  })

  it("case5: open browser in right does not change middle", () => {
    const current = new URLSearchParams(
      "layout=left,middle,right&centerTaskId=13418&rightView=ai&taskAiOpen=true",
    )
    const next = applyWorkspaceViewToSearchParams({
      current,
      pane: "right",
      type: "browser",
      id: "b-new",
      params: { browserTabId: "b-new", keepAiOpen: true },
    })
    expect(next.get("centerTaskId")).toBe("13418")
    expect(next.get("rightView")).toBe("browser")
    expect(next.get("browserTabId")).toBe("b-new")
  })

  it("opens research in right as peer tab without closing AI", () => {
    const current = new URLSearchParams(
      "layout=left,middle,right&taskAiOpen=true&rightView=ai&aiThreadId=f4b20797-c1f4-443b-be11-82e6d658ce81&leftPaneView=template-list&centerArtifactId=73cd38e6-5f44-441c-81e4-cc7f0de61b84",
    )
    const next = applyWorkspaceViewToSearchParams({
      current,
      pane: "right",
      type: "research",
      params: { researchTab: "keywords" },
    })
    expect(next.get("rightView")).toBe("research")
    expect(next.get("researchTab")).toBe("keywords")
    expect(next.get("taskAiOpen")).toBe("true")
    expect(next.get("aiThreadId")).toBe("f4b20797-c1f4-443b-be11-82e6d658ce81")
    expect(next.get("centerArtifactId")).toBe("73cd38e6-5f44-441c-81e4-cc7f0de61b84")
    expect(next.get("leftPaneView")).toBe("template-list")
  })

  it("opens research in right without resurrecting a closed AI pane", () => {
    const current = new URLSearchParams(
      "layout=left,middle,right&taskAiOpen=false&rightView=details&centerArtifactId=1",
    )
    const next = applyWorkspaceViewToSearchParams({
      current,
      pane: "right",
      type: "research",
      params: { researchTab: "keywords" },
    })
    expect(next.get("rightView")).toBe("research")
    expect(next.get("taskAiOpen")).toBe("false")
  })

  it("case6: open AI in middle does not change right project", () => {
    const current = new URLSearchParams(
      "layout=left,middle,right&centerTaskId=1&rightView=project&rightProjectId=33",
    )
    const next = applyWorkspaceViewToSearchParams({
      current,
      pane: "middle",
      type: "ai",
      params: { forceNewAiThread: true },
    })
    expect(next.get("centerView")).toBe("ai")
    expect(next.get("rightView")).toBe("project")
    expect(next.get("rightProjectId")).toBe("33")
    expect(next.get("centerTaskId")).toBeNull()
    // Middle AI must not flip taskAiOpen (that seeds the right AI pane).
    expect(next.get("taskAiOpen")).toBeNull()
  })

  it("opens browser in middle", () => {
    const current = new URLSearchParams("layout=left,middle,right&rightView=ai&taskAiOpen=true")
    const next = applyWorkspaceViewToSearchParams({
      current,
      pane: "middle",
      type: "browser",
      id: "b1",
      params: { browserTabId: "b1" },
    })
    expect(next.get("centerView")).toBe("browser")
    expect(next.get("browserTabId")).toBe("b1")
  })

  it("detects entity rightView values", () => {
    expect(isRightViewEntityType("task")).toBe(true)
    expect(isRightViewEntityType("task-details")).toBe(true)
    expect(isRightViewEntityType("ai")).toBe(false)
    expect(isRightViewEntityType("browser")).toBe(false)
    expect(isRightViewEntityType("task-list")).toBe(false)
  })

  it("opens and parses task-list in either pane without clearing the other", () => {
    const current = new URLSearchParams(
      "layout=left,middle&centerView=task-list&rightView=ai&taskAiOpen=true",
    )
    expect(getActiveMiddleWorkspaceTab(current)).toMatchObject({
      type: "task-list",
      id: "main",
    })
    const next = applyWorkspaceViewToSearchParams({
      current,
      pane: "right",
      type: "task",
      id: 13418,
    })
    expect(next.get("centerView")).toBe("task-list")
    expect(next.get("rightView")).toBe("task")
    expect(next.get("rightTaskId")).toBe("13418")
    expect(getActiveRightWorkspaceTab(next)).toMatchObject({
      type: "task",
      id: "13418",
    })

    const rightList = applyWorkspaceViewToSearchParams({
      current: new URLSearchParams("layout=middle,right&centerTaskId=1"),
      pane: "right",
      type: "task-list",
      id: "main",
    })
    expect(rightList.get("rightView")).toBe("task-list")
    expect(rightList.get("centerTaskId")).toBe("1")
    expect(getActiveRightWorkspaceTab(rightList)).toMatchObject({
      type: "task-list",
      id: "main",
    })
  })

  it("opens new message (thread:new) in middle and clears focus=left", () => {
    const next = applyWorkspaceViewToSearchParams({
      current: new URLSearchParams(
        "layout=left,middle&leftPaneView=mention-list&focus=left&taskAiOpen=false",
      ),
      pane: "middle",
      type: "thread",
      id: "new",
      params: { compose: true },
    })
    expect(next.get("centerThreadId")).toBe("new")
    expect(next.get("focus")).toBeNull()
    expect(next.get("leftPaneView")).toBe("mention-list")
    expect(getActiveMiddleWorkspaceTab(next)).toMatchObject({
      type: "thread",
      id: "new",
    })
  })

  it("opens project list in left via leftPaneView and migrates object=", () => {
    const next = applyWorkspaceViewToSearchParams({
      current: new URLSearchParams("layout=left,middle&object=task"),
      pane: "left",
      type: "project-list",
      id: "main",
    })
    expect(next.get("leftPaneView")).toBe("project-list")
    expect(next.get("object")).toBe("project")
    expect(getActiveLeftWorkspaceTab(next)).toMatchObject({
      type: "project-list",
      id: "main",
    })
  })

  it("defaults left homepage to AI when leftPaneView is absent", () => {
    const params = new URLSearchParams("layout=left,middle&object=mention")
    expect(getActiveLeftWorkspaceTab(params)).toMatchObject({
      type: "ai",
      id: "main",
    })
  })

  it("opening a right pane view from focus=middle keeps the middle+right split", () => {
    const fromMiddleFocus = applyWorkspaceViewToSearchParams({
      current: new URLSearchParams(
        "layout=left,middle,right&focus=middle&centerTaskId=1&rightView=ai&taskAiOpen=true",
      ),
      pane: "right",
      type: "start",
    })
    expect(fromMiddleFocus.get("focus")).toBe("right")
    expect(fromMiddleFocus.get("rightView")).toBe("start")

    const detailsAiSplit = applyWorkspaceViewToSearchParams({
      current: new URLSearchParams(
        "layout=left,middle,right&focus=right&rightView=ai&taskAiOpen=true&id=1",
      ),
      pane: "right",
      type: "ai",
    })
    expect(detailsAiSplit.get("focus")).toBe("right")
    expect(detailsAiSplit.get("rightView")).toBe("ai")
  })

  it("opening AI from focus=middle keeps the details+AI split instead of restoring left panes", () => {
    const next = applyWorkspaceViewToSearchParams({
      current: new URLSearchParams(
        "layout=left,middle,right&focus=middle&centerArtifactId=art-1&rightView=details",
      ),
      pane: "right",
      type: "ai",
      params: { aiThreadId: "thread-a" },
    })
    expect(next.get("focus")).toBe("right")
    expect(next.get("rightView")).toBe("ai")
    expect(next.get("taskAiOpen")).toBe("true")
    expect(next.get("centerArtifactId")).toBe("art-1")
  })

  it("closes the left pane without reseeding homepage AI", () => {
    const next = applyCloseLeftPaneToSearchParams(
      new URLSearchParams(
        "layout=left,middle,right&leftPaneView=project-list&object=project&focus=left&centerTaskId=1",
      ),
    )
    expect(next.get("layout")).toBe("middle,right")
    expect(next.get("leftPaneView")).toBe(LEFT_PANE_EMPTY_VIEW)
    expect(next.get("object")).toBeNull()
    expect(next.get("focus")).toBeNull()
    expect(getActiveLeftWorkspaceTab(next)).toBeNull()
    expect(next.get("centerTaskId")).toBe("1")
  })
})
