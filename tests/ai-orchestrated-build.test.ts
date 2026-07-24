import { beforeEach, describe, expect, it } from "vitest"
import {
  isActiveAiOrchestratedBuildStatus,
  isTerminalAiOrchestratedBuildStatus,
} from "../app/lib/ai/ai-orchestrated-build-types"
import { parseAiOrchestratedBuildSnapshot } from "../features/ai-chat/ai-build-orchestrator-api"
import { resolveOrchestratedBuildErrorMessage } from "../features/ai-chat/ai-orchestrated-build-errors"
import {
  discoverOrchestratedBuildFromChangePreview,
  discoverOrchestratedBuildsFromMessageContentJson,
  isOrchestratedBuildChangePreview,
} from "../features/ai-chat/discover-orchestrated-build"
import {
  listUnitsForBuild,
  useAiOrchestratedBuildStore,
} from "../app/store/ai-orchestrated-build-store"

const BUILD_ID = "635c0ae7-9d47-432c-8768-8f30d415376a"
const UNIT_A = "e92627a5-d0d5-49e1-b5b1-2bd940126f41"
const UNIT_B = "a1111111-1111-4111-8111-111111111111"

describe("orchestrated build discovery", () => {
  it("discovers builds from ai_change_preview with entity_type", () => {
    const discovered = discoverOrchestratedBuildFromChangePreview({
      entity_type: "ai_orchestrated_build",
      entity_id: BUILD_ID,
      tool_name: "ai_start_orchestrated_build",
      title: "Building 3 tasks",
      summary: "Queued",
    })
    expect(discovered?.buildId).toBe(BUILD_ID)
    expect(isOrchestratedBuildChangePreview({
      entity_type: "ai_orchestrated_build",
      entity_id: BUILD_ID,
      tool_name: "ai_start_orchestrated_build",
    })).toBe(true)
  })

  it("treats ai_start_artifact_build as a dispatch preview (not a change card)", () => {
    expect(isOrchestratedBuildChangePreview({
      entity_type: "ai_orchestrated_build",
      entity_id: BUILD_ID,
      tool_name: "ai_start_artifact_build",
    })).toBe(true)
    const discovered = discoverOrchestratedBuildFromChangePreview({
      entity_type: "ai_orchestrated_build",
      entity_id: BUILD_ID,
      tool_name: "ai_start_artifact_build",
      title: "Artifact build",
    })
    expect(discovered?.buildId).toBe(BUILD_ID)
  })

  it("discovers builds from tool_results without chat text parsing", () => {
    const builds = discoverOrchestratedBuildsFromMessageContentJson({
      tool_results: [
        {
          tool_name: "ai_start_orchestrated_build",
          build_id: BUILD_ID,
          title: "Build started",
        },
      ],
    })
    expect(builds).toHaveLength(1)
    expect(builds[0]?.buildId).toBe(BUILD_ID)
    expect(builds[0]?.source).toBe("tool_result")
  })

  it("dedupes the same build_id from preview and tool result", () => {
    const builds = discoverOrchestratedBuildsFromMessageContentJson({
      ai_change_previews: [
        {
          entity_type: "ai_orchestrated_build",
          entity_id: BUILD_ID,
          tool_name: "ai_start_orchestrated_build",
        },
      ],
      tool_results: [
        {
          tool_name: "ai_start_orchestrated_build",
          result: { build_id: BUILD_ID },
        },
      ],
    })
    expect(builds).toHaveLength(1)
  })
})

describe("orchestrated build snapshot parse", () => {
  it("parses snapshots and strips lease fields", () => {
    const snapshot = parseAiOrchestratedBuildSnapshot({
      ok: true,
      build: {
        id: BUILD_ID,
        status: "running",
        total_units: 2,
        queued_units: 1,
        running_units: 1,
        succeeded_units: 0,
        failed_units: 0,
        last_event_sequence: 3,
        change_set_id: null,
        lease_token: "secret-lease",
      },
      units: [
        {
          id: UNIT_A,
          unit_key: "task:1",
          task_id: 1,
          status: "running",
          attempt: 1,
          result: {},
        },
      ],
      events: [
        {
          sequence: 3,
          event_type: "unit.progress",
          phase: "running",
          unit_id: UNIT_A,
          payload: { lease_token: "nope", note: "ok" },
        },
      ],
      next_sequence: 4,
    })

    expect(snapshot?.build.id).toBe(BUILD_ID)
    expect(snapshot?.units).toHaveLength(1)
    expect(snapshot?.events[0]?.payload).toEqual({ note: "ok" })
    expect(JSON.stringify(snapshot)).not.toMatch(/lease/i)
  })
})

describe("orchestrated build store merge", () => {
  beforeEach(() => {
    useAiOrchestratedBuildStore.setState({ builds: {} })
  })

  it("keeps one card per build_id and merges units/events by id/sequence", () => {
    const store = useAiOrchestratedBuildStore.getState()
    store.registerBuild({
      buildId: BUILD_ID,
      threadId: "thread-1",
      assistantMessageId: "temp-1",
      title: "Build",
    })
    store.applySnapshot({
      buildId: BUILD_ID,
      snapshot: {
        ok: true,
        build: {
          id: BUILD_ID,
          status: "running",
          total_units: 2,
          queued_units: 1,
          running_units: 1,
          succeeded_units: 0,
          failed_units: 0,
          last_event_sequence: 1,
        },
        units: [
          {
            id: UNIT_A,
            unit_key: "task:10",
            task_id: 10,
            status: "running",
            attempt: 1,
            result: {},
          },
        ],
        events: [{ sequence: 1, event_type: "build.started", phase: "running", payload: {} }],
        next_sequence: 2,
      },
    })
    store.applySnapshot({
      buildId: BUILD_ID,
      snapshot: {
        ok: true,
        build: {
          id: BUILD_ID,
          status: "partially_completed",
          total_units: 2,
          queued_units: 0,
          running_units: 0,
          succeeded_units: 1,
          failed_units: 1,
          last_event_sequence: 4,
          change_set_id: "cs-1",
        },
        units: [
          {
            id: UNIT_A,
            unit_key: "task:10",
            task_id: 10,
            status: "succeeded",
            attempt: 1,
            result: {
              saved: [
                {
                  task_id: 10,
                  channel_id: 11,
                  component_id: "comp-1",
                  output_id: "out-1",
                  title: "Intro",
                  snippet: "Short text",
                },
              ],
            },
          },
          {
            id: UNIT_B,
            unit_key: "task:20",
            task_id: 20,
            status: "failed",
            attempt: 1,
            result: {},
            error_code: "component_revision_conflict",
            error_message: "conflict",
          },
        ],
        events: [
          { sequence: 2, event_type: "unit.saved", phase: "succeeded", unit_id: UNIT_A, payload: {} },
          { sequence: 4, event_type: "build.done", phase: "partially_completed", payload: {} },
        ],
        next_sequence: 5,
      },
    })

    const entry = store.getBuild(BUILD_ID)
    expect(Object.keys(useAiOrchestratedBuildStore.getState().builds)).toHaveLength(1)
    expect(entry?.build?.status).toBe("partially_completed")
    expect(entry?.build?.change_set_id).toBe("cs-1")
    expect(listUnitsForBuild(entry)).toHaveLength(2)
    expect(entry?.unitsById[UNIT_A]?.result.saved?.[0]?.title).toBe("Intro")
    expect(entry?.eventsBySequence[1]).toBeTruthy()
    expect(entry?.eventsBySequence[4]).toBeTruthy()
    expect(entry?.afterSequence).toBe(5)
  })

  it("aliases assistant message ids without duplicating cards", () => {
    const store = useAiOrchestratedBuildStore.getState()
    store.registerBuild({
      buildId: BUILD_ID,
      threadId: "thread-1",
      assistantMessageId: "temp-1",
    })
    store.aliasAssistantMessageId("temp-1", "msg-1")
    const entry = store.getBuild(BUILD_ID)
    expect(entry?.assistantMessageIds["msg-1"]).toBe(true)
    expect(entry?.assistantMessageIds["temp-1"]).toBeUndefined()
  })
})

describe("orchestrated build terminal helpers", () => {
  it("classifies active and terminal statuses", () => {
    expect(isActiveAiOrchestratedBuildStatus("queued")).toBe(true)
    expect(isActiveAiOrchestratedBuildStatus("running")).toBe(true)
    expect(isTerminalAiOrchestratedBuildStatus("completed")).toBe(true)
    expect(isTerminalAiOrchestratedBuildStatus("partially_completed")).toBe(true)
    expect(isTerminalAiOrchestratedBuildStatus("failed")).toBe(true)
    expect(isTerminalAiOrchestratedBuildStatus("cancelled")).toBe(true)
    expect(isTerminalAiOrchestratedBuildStatus("running")).toBe(false)
  })

  it("maps known unit failure codes to concise copy", () => {
    expect(
      resolveOrchestratedBuildErrorMessage({ code: "component_revision_conflict" }),
    ).toContain("newer edit")
    expect(resolveOrchestratedBuildErrorMessage({ code: "provider_timeout" })).toContain("timed out")
    expect(
      resolveOrchestratedBuildErrorMessage({ code: "user_token_limit_exceeded" }),
    ).toContain("daily AI token limit")
    expect(
      resolveOrchestratedBuildErrorMessage({
        backendMessage: "lease_token=abc reservation_id=xyz",
      }),
    ).not.toMatch(/lease_token|reservation_id/)
  })
})
