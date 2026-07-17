import { beforeEach, describe, expect, it } from "vitest"
import {
  groupPlanActions,
  librarySourceDisplayLabel,
  normalizeComponentLibraryTrace,
  normalizeComponentPlanTrace,
  parseComponentTracesFromMessage,
  planSourceDisplayLabel,
} from "../features/ai-chat/component-plan-trace"
import { useComponentPlanTraceStore } from "../app/store/component-plan-trace-store"

const LIBRARY_PAYLOAD = {
  type: "component_library_trace",
  phase: "completed",
  ok: true,
  task_id: 13430,
  channel_id: 11,
  scope_note: "Recent task components are from other tasks in the same project.",
  sources: [
    {
      source: "current_task_channel",
      label: "Current task × channel components",
      count: 9,
      sample_titles: ["Intro", "FAQ", "Conclusion"],
      used_for: "Starting structure and writable current components",
    },
    {
      source: "recent_project_tasks",
      label: "Recent task components",
      count: 7,
    },
  ],
}

const PLAN_PAYLOAD = {
  type: "component_plan_trace",
  phase: "completed",
  ok: true,
  task_id: 13430,
  channel_id: 11,
  mode: "replace_selected_structure",
  decision: "Component structure was reviewed and a plan was applied.",
  action_counts: {
    kept_or_selected: 4,
    updated: 2,
    added_existing_component: 2,
    created_or_adapted_custom: 1,
    excluded_or_unselected: 3,
  },
  actions: [
    {
      action: "add_custom",
      bucket: "created_or_adapted_custom",
      source: "recent_project_tasks",
      component_title: "Comparison: cork vs other lightweight materials",
      reason: "Useful comparison pattern from recent project content.",
    },
    {
      action: "exclude",
      bucket: "excluded_or_unselected",
      source: "project_library",
      component_title: "Quanto custa?",
    },
  ],
}

describe("normalizeComponentLibraryTrace", () => {
  it("normalizes sources and metadata", () => {
    const trace = normalizeComponentLibraryTrace(LIBRARY_PAYLOAD)
    expect(trace).not.toBeNull()
    expect(trace?.taskId).toBe(13430)
    expect(trace?.channelId).toBe(11)
    expect(trace?.sources).toHaveLength(2)
    expect(trace?.sources[0].sampleTitles).toEqual(["Intro", "FAQ", "Conclusion"])
  })

  it("rejects payloads with no sources", () => {
    expect(normalizeComponentLibraryTrace({ type: "component_library_trace", sources: [] })).toBeNull()
  })

  it("forces 'from this project' wording for recent components", () => {
    const trace = normalizeComponentLibraryTrace(LIBRARY_PAYLOAD)!
    expect(librarySourceDisplayLabel(trace.sources[1])).toBe("Recent components from this project")
    expect(librarySourceDisplayLabel(trace.sources[0])).toBe("Current task × channel components")
  })
})

describe("normalizeComponentPlanTrace", () => {
  it("normalizes action counts and actions", () => {
    const trace = normalizeComponentPlanTrace(PLAN_PAYLOAD)
    expect(trace).not.toBeNull()
    expect(trace?.actionCounts.kept_or_selected).toBe(4)
    expect(trace?.actions).toHaveLength(2)
  })

  it("hides missing reasons rather than inventing them", () => {
    const trace = normalizeComponentPlanTrace(PLAN_PAYLOAD)!
    const excluded = trace.actions.find((a) => a.bucket === "excluded_or_unselected")
    expect(excluded?.reason).toBeNull()
  })

  it("groups actions into added/excluded buckets", () => {
    const trace = normalizeComponentPlanTrace(PLAN_PAYLOAD)!
    const groups = groupPlanActions(trace.actions)
    const added = groups.find((g) => g.heading === "Added")
    const excluded = groups.find((g) => g.heading === "Excluded")
    expect(added?.tone).toBe("added")
    expect(excluded?.tone).toBe("removed")
    expect(added?.actions[0].componentTitle).toContain("Comparison")
  })

  it("maps plan action sources to friendly labels", () => {
    expect(planSourceDisplayLabel("recent_project_tasks")).toBe("recent project tasks")
    expect(planSourceDisplayLabel("project_library")).toBe("project library")
    expect(planSourceDisplayLabel(null)).toBeNull()
  })
})

describe("parseComponentTracesFromMessage", () => {
  it("reads persisted traces from message content_json", () => {
    const { libraryTrace, planTrace } = parseComponentTracesFromMessage({
      component_library_trace: LIBRARY_PAYLOAD,
      component_plan_trace: PLAN_PAYLOAD,
    })
    expect(libraryTrace?.sources).toHaveLength(2)
    expect(planTrace?.actions).toHaveLength(2)
  })

  it("returns nulls for unrelated content_json", () => {
    const { libraryTrace, planTrace } = parseComponentTracesFromMessage({ foo: "bar" })
    expect(libraryTrace).toBeNull()
    expect(planTrace).toBeNull()
  })
})

describe("useComponentPlanTraceStore", () => {
  beforeEach(() => {
    useComponentPlanTraceStore.setState({ buckets: {} })
  })

  it("stores streamed traces under a provisional id and migrates to the persisted id", () => {
    const store = useComponentPlanTraceStore.getState()
    store.upsertLibraryTrace({ threadId: "thread-1", assistantMessageId: "temp-1", payload: LIBRARY_PAYLOAD })
    store.upsertPlanTrace({ threadId: "thread-1", assistantMessageId: "temp-1", payload: PLAN_PAYLOAD })

    expect(useComponentPlanTraceStore.getState().getBucket("temp-1")?.libraryTrace).not.toBeNull()

    useComponentPlanTraceStore.getState().aliasAssistantMessageId("temp-1", "msg-real")

    expect(useComponentPlanTraceStore.getState().getBucket("temp-1")).toBeNull()
    const migrated = useComponentPlanTraceStore.getState().getBucket("msg-real")
    expect(migrated?.libraryTrace?.sources).toHaveLength(2)
    expect(migrated?.planTrace?.actions).toHaveLength(2)
  })

  it("clears buckets from other threads but keeps provisional streaming buckets", () => {
    const store = useComponentPlanTraceStore.getState()
    store.upsertLibraryTrace({ threadId: "thread-1", assistantMessageId: "m-1", payload: LIBRARY_PAYLOAD })
    store.upsertLibraryTrace({ threadId: "thread-2", assistantMessageId: "m-2", payload: LIBRARY_PAYLOAD })
    store.setTracesForMessage({
      threadId: null,
      assistantMessageId: "provisional",
      libraryTrace: normalizeComponentLibraryTrace(LIBRARY_PAYLOAD),
    })

    useComponentPlanTraceStore.getState().clearBucketsExceptThread("thread-1")

    const buckets = useComponentPlanTraceStore.getState().buckets
    expect(buckets["m-1"]).toBeDefined()
    expect(buckets["m-2"]).toBeUndefined()
    expect(buckets["provisional"]).toBeDefined()
  })
})
