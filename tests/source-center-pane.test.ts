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
import { buildAiRunTargets } from "../features/ai-chat/build-ai-run-targets"
import type { AiContextTag } from "../features/ai-chat/composer-inline-editor"

describe("source center pane selection", () => {
  it("resolves source tab identity by id", () => {
    const active = resolveActiveCenterPaneTab({
      selectedTaskId: null,
      isSuggestion: false,
      selectedDetailTarget: null,
      centerSourceId: "22222222-2222-4222-8222-222222222222",
      centerSourceTitle: "Competitor article",
    })
    expect(active).toEqual({
      key: buildCenterPaneTabKey("source", "22222222-2222-4222-8222-222222222222"),
      kind: "source",
      id: "22222222-2222-4222-8222-222222222222",
      title: "Competitor article",
    })
  })

  it("reads source selection from URL params", () => {
    const params = buildCenterPaneSelectionSearchParams({
      currentSearchParams: new URLSearchParams("centerTaskId=12"),
      entity: "source",
      id: "22222222-2222-4222-8222-222222222222",
    })
    expect(params.get("centerSourceId")).toBe("22222222-2222-4222-8222-222222222222")
    expect(params.get("centerTaskId")).toBeNull()
    expect(getActiveCenterSelection(params)).toEqual({
      type: "source",
      id: "22222222-2222-4222-8222-222222222222",
    })
  })
})

describe("app://source and ai-agent-run links", () => {
  it("parses source and agent-run links", () => {
    expect(parseAppEntityLink("app://source/22222222-2222-4222-8222-222222222222")).toEqual({
      type: "source",
      id: "22222222-2222-4222-8222-222222222222",
    })
    expect(
      parseAppEntityLink("app://ai-agent-run/33333333-3333-4333-8333-333333333333"),
    ).toEqual({
      type: "ai-agent-run",
      id: "33333333-3333-4333-8333-333333333333",
    })
  })

  it("opens source center selection and agent-run page path", () => {
    const openUrl = buildNextUrlForEntityLink({
      currentPathname: "/",
      currentSearchParams: new URLSearchParams("layout=left,middle"),
      parsedLink: {
        type: "source",
        id: "22222222-2222-4222-8222-222222222222",
      },
    })
    expect(openUrl).toContain("centerSourceId=22222222-2222-4222-8222-222222222222")

    const agentUrl = buildNextUrlForEntityLink({
      currentPathname: "/",
      currentSearchParams: new URLSearchParams(),
      parsedLink: {
        type: "ai-agent-run",
        id: "33333333-3333-4333-8333-333333333333",
      },
    })
    expect(agentUrl).toBe("/ai-agent-runs/33333333-3333-4333-8333-333333333333")
  })
})

describe("source tags in AI composer payloads", () => {
  it("emits tagged_source_ids/refs and factual source targets", () => {
    const tags: AiContextTag[] = [
      {
        type: "source",
        id: "22222222-2222-4222-8222-222222222222",
        label: "Competitor article",
        source: "mention",
        sourceId: "22222222-2222-4222-8222-222222222222",
        sourceTitle: "Competitor article",
        taskId: undefined,
        projectId: 111,
      },
    ]
    const refs = buildAiChatTaggedRefs(tags)
    expect(refs.tagged_source_ids).toEqual(["22222222-2222-4222-8222-222222222222"])
    expect(refs.tagged_source_refs).toEqual([
      {
        source_id: "22222222-2222-4222-8222-222222222222",
        title: "Competitor article",
        task_id: null,
        project_id: 111,
      },
    ])

    const targets = buildAiRunTargets({ messageTags: tags })
    expect(targets).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          target_kind: "source",
          source_id: "22222222-2222-4222-8222-222222222222",
          source: "explicit_tag",
          allow_write: false,
        }),
      ]),
    )
  })
})
