import { beforeEach, describe, expect, it } from "vitest"
import {
  collectCandidatesConsidered,
  countResolvedTargets,
  countUnresolvedChoices,
  mergeRequestPlan,
  normalizeRequestPlan,
  normalizeRequestPlanStreamEvent,
  parseRequestPlanFromMessage,
  requestPlanOperationLabel,
  requestPlanStatusLabel,
} from "../features/ai-chat/request-plan"
import { useAiRequestPlanStore } from "../app/store/ai-request-plan-store"

const PLAN_PAYLOAD = {
  plan_id: "plan-111",
  plan_version: 3,
  operation: "edit_component",
  executor: "component_patch_executor",
  status: "waiting_for_input",
  request_text: "Shorten the intro on Blog",
  mutation_targets: {
    task_id: 13430,
    channel_id: 11,
    component_id: "comp-1",
  },
  context_refs: {
    ambient_task_id: 13430,
    ambient_channel_id: 11,
  },
  arguments: {
    edit_kind: "shorten",
  },
  missing_inputs: [{ field: "component_ids", allow_multiple: true }],
  resolved_inputs: {},
  decision_audit: {
    interpretation: {
      operation: "edit_component",
      target_scope: "component",
      edit_kind: "shorten",
      summary: "Shorten the selected component content.",
    },
    resolutions: [
      {
        entity_type: "component",
        matches: [
          {
            reference: "intro",
            candidate_id: "comp-1",
            candidate_label: "Intro",
            reason: "Closest matching component title.",
            confidence: "high",
          },
        ],
        unresolved: [],
        candidates_considered: [
          { id: "comp-1", label: "Intro", selected: true },
          { id: "comp-2", label: "FAQ", selected: false },
        ],
      },
    ],
  },
  result_summary: null,
  verification: null,
}

describe("normalizeRequestPlan", () => {
  it("normalizes a public plan snapshot", () => {
    const plan = normalizeRequestPlan(PLAN_PAYLOAD)
    expect(plan).not.toBeNull()
    expect(plan?.planId).toBe("plan-111")
    expect(plan?.operation).toBe("edit_component")
    expect(plan?.status).toBe("waiting_for_input")
    expect(plan?.decisionAudit?.interpretation?.summary).toContain("Shorten")
    expect(plan?.decisionAudit?.resolutions).toHaveLength(1)
    expect(plan?.decisionAudit?.resolutions[0].matches[0].candidateLabel).toBe("Intro")
    expect(plan?.missingInputs[0].field).toBe("component_ids")
  })

  it("normalizes stream envelopes with nested plan", () => {
    const event = normalizeRequestPlanStreamEvent({
      type: "request_plan",
      phase: "executing",
      plan: { ...PLAN_PAYLOAD, status: "executing" },
    })
    expect(event?.type).toBe("request_plan")
    expect(event?.phase).toBe("executing")
    expect(event?.plan.status).toBe("executing")
    expect(event?.plan.planId).toBe("plan-111")
  })

  it("rejects payloads without plan_id", () => {
    expect(normalizeRequestPlan({ type: "request_plan", operation: "edit_component" })).toBeNull()
  })
})

describe("mergeRequestPlan", () => {
  it("merges later fields for the same plan_id", () => {
    const first = normalizeRequestPlan(PLAN_PAYLOAD)!
    const second = normalizeRequestPlan({
      ...PLAN_PAYLOAD,
      status: "completed",
      missing_inputs: [],
      result_summary: { updated_components: 1 },
    })!
    const merged = mergeRequestPlan(first, second)
    expect(merged.status).toBe("completed")
    expect(merged.missingInputs).toEqual([])
    expect(merged.resultSummary).toEqual({ updated_components: 1 })
    expect(merged.requestText).toBe("Shorten the intro on Blog")
  })

  it("replaces when plan_id differs", () => {
    const first = normalizeRequestPlan(PLAN_PAYLOAD)!
    const second = normalizeRequestPlan({ ...PLAN_PAYLOAD, plan_id: "plan-222", status: "ready" })!
    expect(mergeRequestPlan(first, second).planId).toBe("plan-222")
  })
})

describe("request plan display helpers", () => {
  it("maps backend statuses and operations to UI labels", () => {
    expect(requestPlanStatusLabel("planning")).toBe("Resolving request")
    expect(requestPlanStatusLabel("waiting_for_input")).toBe("Needs your input")
    expect(requestPlanStatusLabel("ready")).toBe("Ready to run")
    expect(requestPlanStatusLabel("executing")).toBe("Applying changes")
    expect(requestPlanStatusLabel("completed")).toBe("Completed")
    expect(requestPlanStatusLabel("partially_completed")).toBe("Partially completed")
    expect(requestPlanStatusLabel("failed")).toBe("Failed")
    expect(requestPlanStatusLabel("cancelled")).toBe("Cancelled")
    expect(requestPlanStatusLabel("expired")).toBe("Expired")
    expect(requestPlanOperationLabel("build_task_content")).toBe("Build task content")
  })

  it("counts resolved targets, unresolved choices, and candidates", () => {
    const plan = normalizeRequestPlan(PLAN_PAYLOAD)!
    expect(countResolvedTargets(plan)).toBeGreaterThanOrEqual(1)
    expect(countUnresolvedChoices(plan)).toBe(1)
    const candidates = collectCandidatesConsidered(plan)
    expect(candidates).toHaveLength(2)
    expect(candidates.find((row) => row.id === "comp-1")?.selected).toBe(true)
    expect(candidates.find((row) => row.id === "comp-2")?.selected).toBe(false)
  })
})

describe("parseRequestPlanFromMessage", () => {
  it("reads content_json.request_plan", () => {
    const plan = parseRequestPlanFromMessage({ request_plan: PLAN_PAYLOAD })
    expect(plan?.planId).toBe("plan-111")
    expect(plan?.status).toBe("waiting_for_input")
  })
})

describe("useAiRequestPlanStore", () => {
  beforeEach(() => {
    useAiRequestPlanStore.setState({ buckets: {} })
  })

  it("upserts stream events, aliases temp ids, and preserves live over persisted", () => {
    useAiRequestPlanStore.getState().upsertFromStreamEvent({
      threadId: "thread-1",
      assistantMessageId: "temp-1",
      payload: {
        type: "request_plan",
        phase: "planning",
        plan: PLAN_PAYLOAD,
      },
    })
    expect(useAiRequestPlanStore.getState().buckets["temp-1"]?.plan.status).toBe("waiting_for_input")

    useAiRequestPlanStore.getState().upsertFromStreamEvent({
      threadId: "thread-1",
      assistantMessageId: "temp-1",
      payload: {
        type: "request_plan",
        phase: "completed",
        plan: { ...PLAN_PAYLOAD, status: "completed", result_summary: { updated_components: 1 } },
      },
    })
    expect(useAiRequestPlanStore.getState().buckets["temp-1"]?.plan.status).toBe("completed")

    useAiRequestPlanStore.getState().aliasAssistantMessageId("temp-1", "assistant-1")
    expect(useAiRequestPlanStore.getState().buckets["temp-1"]).toBeUndefined()
    expect(useAiRequestPlanStore.getState().buckets["assistant-1"]?.plan.resultSummary).toEqual({
      updated_components: 1,
    })

    useAiRequestPlanStore.getState().setPlanForMessage({
      threadId: "thread-1",
      assistantMessageId: "assistant-1",
      plan: normalizeRequestPlan({ ...PLAN_PAYLOAD, status: "planning" }),
    })
    expect(useAiRequestPlanStore.getState().buckets["assistant-1"]?.plan.status).toBe("completed")
  })
})
