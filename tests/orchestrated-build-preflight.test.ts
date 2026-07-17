import { beforeEach, describe, expect, it } from "vitest"
import { useAiChangePreviewStreamStore } from "../app/store/ai-change-preview-stream"
import {
  discoverOrchestratedBuildsFromMessageContentJson,
} from "../features/ai-chat/discover-orchestrated-build"
import {
  applyPreflightSkipsFromContentJson,
  parseOrchestratedBuildPreflightSkip,
} from "../features/ai-chat/orchestrated-build-preflight"

describe("orchestrated build skipped preflight", () => {
  beforeEach(() => {
    useAiChangePreviewStreamStore.setState({ previews: {} })
  })

  it("parses requires_clarification / no_build_created tool results", () => {
    const skip = parseOrchestratedBuildPreflightSkip({
      tool_name: "ai_start_orchestrated_build",
      result: {
        requires_clarification: true,
        clarification_reason: "missing_task_channels",
        missing_channel_tasks: [],
        candidate_options: [],
        no_build_created: true,
      },
    })
    expect(skip).toEqual({
      requires_clarification: true,
      clarification_reason: "missing_task_channels",
      missing_channel_tasks: [],
      candidate_options: [],
      no_build_created: true,
    })
  })

  it("does not discover a build card for skipped preflight", () => {
    const builds = discoverOrchestratedBuildsFromMessageContentJson({
      tool_results: [
        {
          tool_name: "ai_start_orchestrated_build",
          result: {
            requires_clarification: true,
            clarification_reason: "missing_task_channels",
            no_build_created: true,
          },
        },
      ],
    })
    expect(builds).toHaveLength(0)
  })

  it("marks matching change previews as Waiting for input", () => {
    useAiChangePreviewStreamStore.getState().upsertAiChangePreview({
      threadId: "thread-1",
      assistantMessageId: "asst-1",
      preview: {
        type: "ai_change_preview",
        phase: "started",
        change_id: "preview-1",
        tool_name: "ai_start_orchestrated_build",
        entity_type: "ai_orchestrated_build",
        title: "Building content",
        summary: "Starting…",
      },
    })

    applyPreflightSkipsFromContentJson({
      contentJson: {
        tool_results: [
          {
            tool_name: "ai_start_orchestrated_build",
            result: {
              requires_clarification: true,
              clarification_reason: "missing_task_channels",
              no_build_created: true,
            },
          },
        ],
      },
      threadId: "thread-1",
      assistantMessageId: "asst-1",
    })

    const entry = useAiChangePreviewStreamStore.getState().getPreview("preview-1")
    expect(entry?.requires_clarification).toBe(true)
    expect(entry?.no_build_created).toBe(true)
    expect(entry?.summary).toBe("Waiting for input")
  })
})
