import { beforeEach, describe, expect, it } from "vitest"
import {
  CONTEXT_SUMMARY_EXECUTION_TEXT,
  buildContextSummaryExecutionTraceEvent,
  executionTraceEventToStep,
  executionTracesFromMessageContentJson,
  findStepIdForIncomingPreview,
  mapBuildEventToExecutionTraceSteps,
  mergeExecutionTraceStep,
  normalizeExecutionTraceEvent,
  orderExecutionTraceSteps,
  shouldSuppressGenericStatusText,
  statusPayloadToExecutionTraceEvent,
} from "../features/ai-chat/execution-trace"
import { toolResultRowsFromDetails } from "../features/ai-chat/tool-result-display"
import { useAiExecutionTraceStore } from "../app/store/ai-execution-trace-store"
import type { AiOrchestratedBuildEvent } from "../app/lib/ai/ai-orchestrated-build-types"

const TRACE_STARTED = {
  type: "execution_trace",
  sequence: 1,
  emitted_at: "2026-07-20T10:00:00.000Z",
  step_id: "resolve-task",
  phase: "started",
  category: "resolution",
  text: "Resolving task “Plastic alternatives”…",
}

const TRACE_COMPLETED = {
  type: "execution_trace",
  sequence: 2,
  emitted_at: "2026-07-20T10:00:01.000Z",
  step_id: "resolve-task",
  phase: "completed",
  category: "resolution",
  text: "Resolved task “Plastic alternatives” and Blog",
  entities: [
    { type: "task", id: 13430, label: "Plastic alternatives" },
    { type: "channel", id: 11, label: "Blog" },
  ],
}

describe("normalizeExecutionTraceEvent", () => {
  it("normalizes a stream execution-trace payload", () => {
    const event = normalizeExecutionTraceEvent(TRACE_COMPLETED)
    expect(event).not.toBeNull()
    expect(event?.step_id).toBe("resolve-task")
    expect(event?.phase).toBe("completed")
    expect(event?.entities).toHaveLength(2)
  })

  it("rejects payloads that are not execution_trace", () => {
    expect(normalizeExecutionTraceEvent({ type: "request_plan", step_id: "x" })).toBeNull()
  })
})

describe("context summary execution event", () => {
  it("builds a completed planning step for chat history", () => {
    const event = buildContextSummaryExecutionTraceEvent({
      untilMessageId: "msg-fold-1",
      foldedMessages: 12,
      emittedAt: "2026-08-18T12:00:00.000Z",
      sequence: 99,
    })
    expect(event).toMatchObject({
      type: "execution_trace",
      step_id: "context_summary:msg-fold-1",
      phase: "completed",
      category: "planning",
      text: CONTEXT_SUMMARY_EXECUTION_TEXT,
    })
    expect(event.details).toMatchObject({
      source: "thread_context_summary",
      until_message_id: "msg-fold-1",
      folded_messages: 12,
    })
  })

  it("reads persisted traces from message content_json", () => {
    const event = buildContextSummaryExecutionTraceEvent({
      untilMessageId: "msg-fold-2",
      emittedAt: "2026-08-18T12:00:00.000Z",
      sequence: 7,
    })
    expect(executionTracesFromMessageContentJson({
      output_kind: "text",
      execution_traces: [event],
    })).toEqual([event])
    expect(executionTracesFromMessageContentJson({
      execution_trace: event,
    })).toEqual([event])
    expect(executionTracesFromMessageContentJson({ tool_results: [] })).toEqual([])
  })
})

describe("mergeExecutionTraceStep", () => {
  it("replaces the same step_id instead of duplicating", () => {
    const started = executionTraceEventToStep(normalizeExecutionTraceEvent(TRACE_STARTED)!)
    const completed = executionTraceEventToStep(normalizeExecutionTraceEvent(TRACE_COMPLETED)!)
    const merged = mergeExecutionTraceStep(started, completed)
    expect(merged.phase).toBe("completed")
    expect(merged.text).toContain("Resolved task")
    // Keep first-seen sequence so completed tools stay stacked in start order.
    expect(merged.sequence).toBe(1)
    expect(merged.emittedAt).toBe(TRACE_STARTED.emitted_at)
  })

  it("preserves attached preview keys across phase updates", () => {
    const started = {
      ...executionTraceEventToStep(normalizeExecutionTraceEvent(TRACE_STARTED)!),
      previewKeys: ["change-1"],
      editStreamKeys: ["edit-1"],
    }
    const completed = executionTraceEventToStep(normalizeExecutionTraceEvent(TRACE_COMPLETED)!)
    const merged = mergeExecutionTraceStep(started, completed)
    expect(merged.previewKeys).toEqual(["change-1"])
    expect(merged.editStreamKeys).toEqual(["edit-1"])
  })
})

describe("statusPayloadToExecutionTraceEvent", () => {
  it("maps tool_started / tool_finished into one mergeable step", () => {
    const started = statusPayloadToExecutionTraceEvent({
      sequence: 10,
      emitted_at: "2026-07-30T15:08:52.451Z",
      type: "tool_started",
      phase: "started",
      round: 0,
      tool_name: "list_visible_projects",
      text: "Using list_visible_projects…",
    })
    expect(started?.step_id).toBe("tool:0:list_visible_projects")
    expect(started?.phase).toBe("started")
    expect(started?.category).toBe("discovery")
    expect(started?.text).toContain("Looking up projects")

    const finished = statusPayloadToExecutionTraceEvent({
      sequence: 11,
      emitted_at: "2026-07-30T15:08:53.352Z",
      type: "tool_finished",
      phase: "completed",
      round: 0,
      tool_name: "list_visible_projects",
      ok: true,
      text: "Finished list_visible_projects.",
    })
    expect(finished?.step_id).toBe("tool:0:list_visible_projects")
    expect(finished?.phase).toBe("completed")

    const merged = mergeExecutionTraceStep(
      executionTraceEventToStep(started!),
      executionTraceEventToStep(finished!),
    )
    expect(merged.phase).toBe("completed")
    expect(merged.text).toContain("Finished looking up projects")
  })

  it("keeps collapsed tool text short and stores result_summary in details", () => {
    const finished = statusPayloadToExecutionTraceEvent({
      sequence: 12,
      type: "tool_finished",
      phase: "completed",
      round: 0,
      tool_name: "ai_list_task_artifacts",
      ok: true,
      text: "Finished ai_list_task_artifacts.",
      result_summary: "Listed artifacts — none found.",
      data_summary: { count: 0, items: [] },
      entities: [],
    })
    expect(finished?.text).toBe("Finished listing task documents.")
    expect(finished?.details?.result_summary).toBe("Listed artifacts — none found.")
    expect(finished?.details?.data_summary).toEqual({ count: 0, items: [] })
  })

  it("keeps parallel tool calls as distinct stacked steps", () => {
    const first = statusPayloadToExecutionTraceEvent({
      sequence: 1,
      type: "tool_started",
      phase: "started",
      round: 0,
      tool_name: "ai_read_artifact",
      tool_call_id: "call_a",
      tool_index: 0,
    })
    const second = statusPayloadToExecutionTraceEvent({
      sequence: 2,
      type: "tool_started",
      phase: "started",
      round: 0,
      tool_name: "ai_read_artifact",
      tool_call_id: "call_b",
      tool_index: 1,
    })
    expect(first?.step_id).toBe("tool:0:call_a")
    expect(second?.step_id).toBe("tool:0:call_b")
    expect(first?.step_id).not.toBe(second?.step_id)
  })

  it("ignores generic status payloads", () => {
    expect(
      statusPayloadToExecutionTraceEvent({
        type: "status",
        phase: "started",
        text: "Reviewing the request and current context…",
      }),
    ).toBeNull()
  })
})

describe("shouldSuppressGenericStatusText", () => {
  it("hides Looking something up when timeline steps exist", () => {
    expect(
      shouldSuppressGenericStatusText({
        statusText: "Looking something up…",
        hasExecutionTraceSteps: true,
      }),
    ).toBe(true)
  })

  it("keeps generic status when there are no timeline steps", () => {
    expect(
      shouldSuppressGenericStatusText({
        statusText: "Looking something up…",
        hasExecutionTraceSteps: false,
      }),
    ).toBe(false)
  })
})

describe("mapBuildEventToExecutionTraceSteps", () => {
  it("maps discovery_snapshot generation_context into a loaded-facts line", () => {
    const event: AiOrchestratedBuildEvent = {
      sequence: 4,
      event_type: "work_unit.discovery_snapshot",
      phase: "completed",
      unit_id: "unit-1",
      payload: {
        generation_context: {
          target_audience: "Procurement teams",
          primary_keyword: "plastic alternatives",
          internal_link_candidates: 12,
        },
      },
    }
    const steps = mapBuildEventToExecutionTraceSteps(event)
    expect(steps[0]?.phase).toBe("completed")
    expect(steps[0]?.text).toMatch(/Loaded target audience and primary keyword/)
  })

  it("maps website_index and repair events", () => {
    const started = mapBuildEventToExecutionTraceSteps({
      sequence: 1,
      event_type: "work_unit.website_index_started",
      phase: "started",
      unit_id: "unit-1",
      payload: {},
    })
    expect(started[0]?.stepId).toBe("unit-1:website_index")
    expect(started[0]?.phase).toBe("started")

    const empty = mapBuildEventToExecutionTraceSteps({
      sequence: 2,
      event_type: "work_unit.website_index_empty",
      phase: "completed",
      unit_id: "unit-1",
      payload: { discovered_count: 0 },
    })
    expect(empty[0]?.phase).toBe("warning")
    expect(empty[0]?.text).toContain("No grounded internal-link catalogue was available")

    const scheduled = mapBuildEventToExecutionTraceSteps({
      sequence: 2.5,
      event_type: "work_unit.website_index_scheduled",
      phase: "started",
      unit_id: "unit-1",
      payload: {},
    })
    expect(scheduled[0]?.phase).toBe("warning")
    expect(scheduled[0]?.text).toContain("background website refresh was scheduled")

    const zeroCompleted = mapBuildEventToExecutionTraceSteps({
      sequence: 3,
      event_type: "work_unit.website_index_completed",
      phase: "completed",
      unit_id: "unit-1",
      payload: { discovered_count: 0, enriched_count: 0 },
    })
    expect(zeroCompleted[0]?.phase).toBe("warning")
    expect(zeroCompleted[0]?.text).not.toMatch(/pages discovered/)

    const finished = mapBuildEventToExecutionTraceSteps({
      sequence: 4,
      event_type: "work_unit.repair_finished",
      phase: "completed",
      unit_id: "unit-1",
      payload: { succeeded: true },
    })
    expect(finished[0]?.phase).toBe("completed")
  })

  it("renders only concise decision summaries without raw reasoning", () => {
    const event: AiOrchestratedBuildEvent = {
      sequence: 5,
      event_type: "work_unit.discovery_snapshot",
      phase: "completed",
      unit_id: "unit-1",
      payload: {
        decisions: [
          {
            candidate_title: "Introduction",
            outcome: "reuse",
            reason: "Exact title match",
            private_reasoning: "should never surface",
          },
        ],
      },
    }
    const steps = mapBuildEventToExecutionTraceSteps(event)
    const decision = steps.find((step) => step.stepId.includes(":decision:"))
    expect(decision?.text).toContain("Introduction")
    expect(decision?.text).toContain("Reused existing section")
    expect(decision?.text).not.toContain("Exact title match")
    expect(decision?.text).not.toContain("should never surface")
  })

  it("maps required_structure_prepared into prepared / created / reactivated steps", () => {
    const steps = mapBuildEventToExecutionTraceSteps({
      sequence: 6,
      event_type: "work_unit.required_structure_prepared",
      phase: "completed",
      unit_id: "unit-1",
      payload: {
        channel_label: "Blog",
        prepared_count: 5,
        actions: [
          { action: "create_from_system", title: "Title" },
          { action: "create_from_system", title: "Meta description" },
          { action: "reactivate_existing", title: "Intro" },
          { action: "reactivate_existing", title: "FAQ" },
          { action: "reactivate_existing", title: "Conclusão" },
        ],
      },
    })
    expect(steps.map((step) => step.text)).toEqual([
      "Prepared 5 policy-required components",
      "Created 2 · Reactivated 3",
    ])
  })

  it("identifies active and inactive components without labeling current as selected", () => {
    const steps = mapBuildEventToExecutionTraceSteps({
      sequence: 7,
      event_type: "work_unit.discovery_snapshot",
      phase: "completed",
      unit_id: "unit-1",
      payload: {
        selected_component_ids: [],
        current_components: [{ title: "Title" }, { title: "Intro" }],
        inactive_components: [{ title: "Old FAQ" }],
      },
    })
    const identified = steps.find((step) => step.stepId.endsWith(":discovery:components"))
    expect(identified?.text).toBe(
      "Found 2 active components and 1 inactive component available for reuse.",
    )
    expect(identified?.text).not.toMatch(/selected/i)
  })

  it("maps component_decisions into concise summaries without raw reasoning", () => {
    const steps = mapBuildEventToExecutionTraceSteps({
      sequence: 8,
      event_type: "work_unit.component_decisions",
      phase: "completed",
      unit_id: "unit-1",
      payload: {
        decisions: [
          {
            title: "Intro",
            outcome: "reactivate_existing",
            reason: "Exact title match",
            private_reasoning: "should never surface",
          },
          {
            title: "Body",
            outcome: "create_from_library",
            source: "reusable",
            reason: "Guidance pack",
          },
          {
            title: "Old FAQ",
            outcome: "leave_inactive",
          },
          {
            title: "Title",
            outcome: "replace_existing",
          },
        ],
      },
    })
    expect(steps.map((step) => step.text)).toEqual([
      "Reactivated existing section — Intro",
      "Created task-specific section from reusable guidance — Body",
      "Left inactive section unused — Old FAQ",
      "Replaced existing required component — Title",
    ])
    expect(steps.every((step) => !step.text.includes("should never surface"))).toBe(true)
  })

  it("collapses failed repair and unit.failed onto the same step_id", () => {
    const repair = mapBuildEventToExecutionTraceSteps({
      sequence: 8,
      event_type: "work_unit.repair_finished",
      phase: "failed",
      unit_id: "unit-1",
      payload: { succeeded: false, error_message: "Structure validation failed" },
    })
    const failed = mapBuildEventToExecutionTraceSteps({
      sequence: 9,
      event_type: "work_unit.failed",
      phase: "failed",
      unit_id: "unit-1",
      payload: { error_message: "Work unit failed" },
    })
    expect(repair[0]?.stepId).toBe("unit-1:failed")
    expect(failed[0]?.stepId).toBe("unit-1:failed")
  })

  it("suppresses routine artifact lifecycle chatter from the timeline", () => {
    expect(
      mapBuildEventToExecutionTraceSteps({
        sequence: 2,
        event_type: "artifact.plan_ready",
        phase: "completed",
        unit_id: "unit-a",
        payload: {
          planned_artifacts: [
            {
              artifact_id: "art-1",
              title: "High density cork",
              artifact_type: "article",
              channel_name: "Blog",
              metadata: { reason: "one coherent channel deliverable" },
            },
          ],
        },
      }),
    ).toEqual([])

    expect(
      mapBuildEventToExecutionTraceSteps({
        sequence: 3,
        event_type: "artifact.started",
        phase: "started",
        unit_id: "unit-a",
        payload: { artifact_id: "art-1", title: "High density cork" },
      }),
    ).toEqual([])

    expect(
      mapBuildEventToExecutionTraceSteps({
        sequence: 4,
        event_type: "artifact.context_loaded",
        phase: "completed",
        unit_id: "unit-a",
        payload: {
          artifact_id: "art-1",
          audience: "Architects",
          primary_keyword: "cork flooring",
          mandatory_role_count: 2,
          internal_link_candidate_count: 5,
        },
      }),
    ).toEqual([])

    expect(
      mapBuildEventToExecutionTraceSteps({
        sequence: 5,
        event_type: "artifact.structure_decided",
        phase: "completed",
        unit_id: "unit-a",
        payload: {
          artifact_id: "art-1",
          section_titles: ["Intro", "Benefits"],
          verified_internal_link_count: 3,
        },
      }),
    ).toEqual([])

    expect(
      mapBuildEventToExecutionTraceSteps({
        sequence: 7,
        event_type: "artifact.preview",
        phase: "completed",
        unit_id: "unit-a",
        payload: { artifact_id: "art-1", title: "High density cork" },
      }),
    ).toEqual([])

    expect(
      mapBuildEventToExecutionTraceSteps({
        sequence: 8,
        event_type: "artifact.version_saved",
        phase: "completed",
        unit_id: "unit-a",
        payload: { artifact_id: "art-1", title: "High density cork" },
      }),
    ).toEqual([])
  })

  it("still surfaces artifact.failed in the timeline", () => {
    const failed = mapBuildEventToExecutionTraceSteps({
      sequence: 6,
      event_type: "artifact.failed",
      phase: "failed",
      unit_id: "unit-a",
      payload: {
        artifact_id: "art-1",
        title: "High density cork",
        error_code: "generation_timeout",
        error_message: "Timed out",
        retry_state: "will_retry",
      },
    })
    expect(failed[0]?.phase).toBe("failed")
    expect(failed[0]?.text).toContain("generation_timeout")
    expect(failed[0]?.text).toContain("will retry")
    expect(failed[0]?.stepId).toBe("unit-a:artifact:started:art-1")
  })
})

describe("useAiExecutionTraceStore", () => {
  beforeEach(() => {
    useAiExecutionTraceStore.setState({ buckets: {} })
  })

  it("dedupes build events by build_id + sequence", () => {
    const store = useAiExecutionTraceStore.getState()
    const event = {
      sequence: 1,
      event_type: "artifact.failed",
      phase: "failed",
      unit_id: "u1",
      payload: {
        artifact_id: "a1",
        title: "Doc",
        error_code: "generation_timeout",
        error_message: "Timed out",
      },
    }
    store.upsertBuildEvents({
      assistantMessageId: "msg-1",
      buildId: "build-1",
      events: [event],
    })
    store.upsertBuildEvents({
      assistantMessageId: "msg-1",
      buildId: "build-1",
      events: [event],
    })
    expect(store.getOrderedSteps("msg-1")).toHaveLength(1)
  })

  it("upserts by step_id and aliases temp → persisted message ids", () => {
    const store = useAiExecutionTraceStore.getState()
    store.upsertFromStreamEvent({
      threadId: "thread-1",
      assistantMessageId: "temp-1",
      payload: TRACE_STARTED,
    })
    store.upsertFromStreamEvent({
      threadId: "thread-1",
      assistantMessageId: "temp-1",
      payload: TRACE_COMPLETED,
    })
    const steps = store.getOrderedSteps("temp-1")
    expect(steps).toHaveLength(1)
    expect(steps[0].phase).toBe("completed")

    store.aliasAssistantMessageId("temp-1", "msg-real")
    expect(useAiExecutionTraceStore.getState().buckets["temp-1"]).toBeUndefined()
    expect(useAiExecutionTraceStore.getState().hasSteps("msg-real")).toBe(true)
    expect(useAiExecutionTraceStore.getState().getOrderedSteps("msg-real")[0].text).toContain(
      "Resolved task",
    )
  })

  it("attaches previews to the active generation step", () => {
    const store = useAiExecutionTraceStore.getState()
    store.upsertFromStreamEvent({
      threadId: "thread-1",
      assistantMessageId: "temp-1",
      payload: {
        type: "execution_trace",
        sequence: 3,
        emitted_at: "2026-07-20T10:00:02.000Z",
        step_id: "gen-1",
        phase: "started",
        category: "generation",
        text: "Generating “What Makes a Good Plastic Alternative?”…",
      },
    })
    store.attachPreviewToActiveStep({
      assistantMessageId: "temp-1",
      editStreamKey: "1:11:comp-1",
    })
    const steps = store.getOrderedSteps("temp-1")
    expect(steps[0].editStreamKeys).toEqual(["1:11:comp-1"])
    expect(findStepIdForIncomingPreview(steps)).toBe("gen-1")
  })

  it("orders steps by sequence", () => {
    const store = useAiExecutionTraceStore.getState()
    store.upsertFromStreamEvent({
      threadId: "t",
      assistantMessageId: "a",
      payload: { ...TRACE_COMPLETED, sequence: 10, step_id: "b" },
    })
    store.upsertFromStreamEvent({
      threadId: "t",
      assistantMessageId: "a",
      payload: { ...TRACE_STARTED, sequence: 1, step_id: "a" },
    })
    const ordered = orderExecutionTraceSteps(
      useAiExecutionTraceStore.getState().buckets.a.stepsById,
    )
    expect(ordered.map((step) => step.stepId)).toEqual(["a", "b"])
  })
})

describe("toolResultRowsFromDetails", () => {
  it("extracts publishing destinations for the expandable tool panel", () => {
    const rows = toolResultRowsFromDetails({
      data_summary: {
        count: 2,
        destinations: [
          { id: "d1", name: "Dimas blog", start_url: "https://dimas-silva.pt/blog" },
          { id: "d2", name: "Articulate site", start_url: "https://example.com" },
        ],
      },
    })
    expect(rows).toEqual([
      { id: "d1", label: "Dimas blog", meta: "https://dimas-silva.pt/blog" },
      { id: "d2", label: "Articulate site", meta: "https://example.com" },
    ])
  })
})
