import { describe, expect, it } from "vitest"
import { resolveActiveCenterPaneTab } from "../app/lib/center-pane-tabs"
import { buildCenterPaneTabKey } from "../app/store/center-pane-tabs"
import {
  buildCenterPaneSelectionSearchParams,
  getActiveCenterSelection,
} from "../app/lib/center-pane-selection-url"
import {
  buildNextUrlForEntityLink,
  parseAppEntityLink,
} from "../features/ai-chat/app-entity-links"
import { buildAiChatTaggedRefs } from "../features/ai-chat/build-ai-chat-tagged-refs"
import { shouldSuppressBuildAckChatBubble } from "../features/ai-chat/component-linked-message-output"
import type { AiContextTag } from "../features/ai-chat/composer-inline-editor"

describe("artifact center pane selection", () => {
  it("resolves artifact tab identity by id, not title", () => {
    const active = resolveActiveCenterPaneTab({
      selectedTaskId: null,
      isSuggestion: false,
      selectedDetailTarget: null,
      centerArtifactId: "11111111-1111-4111-8111-111111111111",
      centerArtifactTitle: "Blog article",
    })
    expect(active).toEqual({
      key: buildCenterPaneTabKey("artifact", "11111111-1111-4111-8111-111111111111"),
      kind: "artifact",
      id: "11111111-1111-4111-8111-111111111111",
      title: "Blog article",
    })
  })

  it("keeps version out of tab identity while reading it from URL", () => {
    const params = buildCenterPaneSelectionSearchParams({
      currentSearchParams: new URLSearchParams("centerTaskId=12"),
      entity: "artifact",
      id: "11111111-1111-4111-8111-111111111111",
      version: 4,
    })
    expect(params.get("centerArtifactId")).toBe("11111111-1111-4111-8111-111111111111")
    expect(params.get("version")).toBe("4")
    expect(params.get("centerTaskId")).toBeNull()
    expect(getActiveCenterSelection(params)).toEqual({
      type: "artifact",
      id: "11111111-1111-4111-8111-111111111111",
      version: 4,
    })
  })
})

describe("app://artifact links", () => {
  it("parses open and download links", () => {
    expect(
      parseAppEntityLink("app://artifact/11111111-1111-4111-8111-111111111111"),
    ).toEqual({
      type: "artifact",
      id: "11111111-1111-4111-8111-111111111111",
      version: null,
    })
    expect(
      parseAppEntityLink(
        "app://artifact/11111111-1111-4111-8111-111111111111/download?format=html&version=4",
      ),
    ).toEqual({
      type: "artifact-download",
      id: "11111111-1111-4111-8111-111111111111",
      format: "html",
      version: 4,
      attachmentId: null,
    })
  })

  it("opens artifact center selection without navigating for downloads", () => {
    const openUrl = buildNextUrlForEntityLink({
      currentPathname: "/",
      currentSearchParams: new URLSearchParams("layout=left,middle"),
      parsedLink: {
        type: "artifact",
        id: "11111111-1111-4111-8111-111111111111",
        version: 2,
      },
    })
    expect(openUrl).toContain("centerArtifactId=11111111-1111-4111-8111-111111111111")
    expect(openUrl).toContain("version=2")
    expect(openUrl).toContain("layout=left%2Cmiddle")

    const downloadUrl = buildNextUrlForEntityLink({
      currentPathname: "/",
      currentSearchParams: new URLSearchParams(),
      parsedLink: {
        type: "artifact-download",
        id: "11111111-1111-4111-8111-111111111111",
        format: "md",
        version: 3,
        attachmentId: null,
      },
    })
    expect(downloadUrl).toBeNull()
  })

  it("keeps left pane and opens middle when opening artifact from AI chat", () => {
    const openUrl = buildNextUrlForEntityLink({
      currentPathname: "/",
      currentSearchParams: new URLSearchParams(
        "layout=left,right&taskAiOpen=true&rightView=ai&aiThreadId=thread-a&leftPaneView=ai-thread-list",
      ),
      parsedLink: {
        type: "artifact",
        id: "11111111-1111-4111-8111-111111111111",
      },
      fromAiChat: true,
    })
    expect(openUrl).toContain("centerArtifactId=11111111-1111-4111-8111-111111111111")
    expect(openUrl).toContain("rightView=ai")
    expect(openUrl).toContain("taskAiOpen=true")
    expect(openUrl).toContain("leftPaneView=ai-thread-list")
    const params = new URLSearchParams(openUrl!.split("?")[1] ?? "")
    const layout = (params.get("layout") || "").split(",")
    expect(layout).toContain("left")
    expect(layout).toContain("middle")
    expect(layout).toContain("right")
    expect(params.get("layout")).not.toBe("right")
  })

  it("expands solo-right AI layout to middle,right when opening an artifact", () => {
    const openUrl = buildNextUrlForEntityLink({
      currentPathname: "/",
      currentSearchParams: new URLSearchParams(
        "layout=right&taskAiOpen=true&rightView=ai&aiFocus=true&aiThreadId=thread-a",
      ),
      parsedLink: {
        type: "artifact",
        id: "11111111-1111-4111-8111-111111111111",
      },
      fromAiChat: true,
    })
    const params = new URLSearchParams(openUrl!.split("?")[1] ?? "")
    expect(params.get("layout")).toBe("middle,right")
    expect(params.get("aiFocus")).toBeNull()
    expect(params.get("rightView")).toBe("ai")
    expect(params.get("centerArtifactId")).toBe("11111111-1111-4111-8111-111111111111")
  })
})

describe("artifact composer tags", () => {
  it("emits tagged_artifact_ids/refs and read-only targets metadata", () => {
    const tags: AiContextTag[] = [
      {
        type: "artifact",
        id: "11111111-1111-4111-8111-111111111111",
        label: "Blog article",
        source: "mention",
        artifactId: "11111111-1111-4111-8111-111111111111",
        artifactVersionNumber: 4,
        artifactTitle: "Blog article",
        taskId: 13334,
        projectId: 111,
      },
    ]
    const payload = buildAiChatTaggedRefs(tags)
    expect(payload.tagged_artifact_ids).toEqual(["11111111-1111-4111-8111-111111111111"])
    expect(payload.tagged_artifact_refs).toEqual([
      {
        artifact_id: "11111111-1111-4111-8111-111111111111",
        artifact_version_number: 4,
        title: "Blog article",
        task_id: 13334,
        project_id: 111,
      },
    ])
  })
})

describe("artifact build control suppression", () => {
  it("suppresses artifact_build_control and hidden ui_visibility bubbles", () => {
    expect(
      shouldSuppressBuildAckChatBubble({ output_kind: "artifact_build_control" }),
    ).toBe(true)
    expect(shouldSuppressBuildAckChatBubble({ ui_visibility: "hidden" })).toBe(true)
  })
})
