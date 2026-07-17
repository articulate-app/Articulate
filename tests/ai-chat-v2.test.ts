import { describe, it, expect, beforeEach } from "vitest"
import { readFileSync } from "node:fs"
import {
  buildAiChatV2RequestFields,
  buildAiRunTargets,
  buildAiChatV2Scope,
  buildRunTargetProgressKey,
  resolveFactualLegacySendContext,
} from "../features/ai-chat/build-ai-run-targets"
import { resolveAiChatOutboundContext } from "../features/ai-chat/ai-target-context"
import {
  reduceRunTerminalState,
  shouldUseLegacyStreamCompletion,
  terminalStateFromV2Event,
} from "../features/ai-chat/ai-run-terminal"
import {
  extractRunIdFromResponse,
  isRequestIdReusedError,
  reconcileRunStatusToTerminal,
} from "../features/ai-chat/ai-chat-run-api"
import { parseAiChatV2RunEvent } from "../app/lib/ai/parse-ai-run-events"
import {
  formatCompactTokenCount,
  formatExactTokenCount,
  isTokenLimitExceededCode,
  isTokenLimitWouldExceedCode,
  isUsageSendBlocked,
  parseAiChatErrorPayload,
  pickStricterUsageScope,
  resolveRunFailureMessage,
  shouldOfferRunFailureReconcile,
  shouldOfferRunFailureRetry,
} from "../features/ai-chat/ai-chat-usage"
import { createAiChatStatusSequenceGate } from "../app/lib/ai/ai-chat-status-sequence"
import {
  createAiChatRunDiagnosticsTracker,
  logAiChatRunDiagnostics,
} from "../features/ai-chat/ai-chat-run-diagnostics"
import { parseAiChatUsageSnapshot } from "../app/lib/ai/ai-chat-usage-parse"
import { ambiguousTargetToClarification } from "../features/ai-chat/parse-ai-run-events"
import {
  resolvePreviewRegistryKey,
  shouldSuppressGenericPreviewForGroup,
} from "../features/ai-chat/ai-preview-registry"
import { resolveAiChangePreviewKey } from "../app/store/ai-change-preview-stream"
import { useAiRunProgressStore, targetProgressFromV2Event } from "../app/store/ai-run-progress-store"
import { useComponentEditStreamStore } from "../app/store/component-edit-stream"
import type { AiContextTag } from "../features/ai-chat/composer-inline-editor"

const COMPONENT_UUID = "635c0ae7-9d47-432c-8768-8f30d415376a"
const OUTPUT_UUID = "e92627a5-d0d5-49e1-b5b1-2bd940126f41"

const ORDINARY_MESSAGES = [
  "Can you summarize this?",
  "Podes atualizar isto?",
  "Peux-tu expliquer cela?",
  "Kannst du das verbessern?",
  "¿Puedes revisar esto?",
  "これを更新してください",
]

function buildOrdinaryV2Request(messageTags: AiContextTag[] = []) {
  return buildAiChatV2RequestFields({
    clientRequestId: "req-ordinary",
    messageTags,
    visibleTaskId: 42,
    visibleChannelId: 11,
  })
}

describe("AI Chat protocol V2 intent correction", () => {
  describe("no frontend semantic intent", () => {
    it("omits intent_hint for ordinary messages across languages", () => {
      for (const _message of ORDINARY_MESSAGES) {
        const fields = buildOrdinaryV2Request()
        expect(fields.intent_hint).toBeUndefined()
      }
    })

    it("does not change targets or legacy mode based on indirect wording", () => {
      const outbound = resolveAiChatOutboundContext({ messageTags: [] })
      const readLike = resolveFactualLegacySendContext({
        outboundContext: outbound,
        visibleTaskId: 42,
        visibleChannelId: 11,
      })
      const writeLike = resolveFactualLegacySendContext({
        outboundContext: outbound,
        visibleTaskId: 42,
        visibleChannelId: 11,
      })
      expect(readLike).toEqual(writeLike)
      expect(readLike.componentId).toBeNull()
      expect(outbound.mode).toBeNull()
    })

    it("never grants write authority on targets regardless of phrasing", () => {
      const targets = buildAiRunTargets({
        messageTags: [{ type: "task", id: 1, label: "Task", source: "mention" }],
        visibleTaskId: 42,
      })
      expect(targets.every((target) => target.allow_write === false)).toBe(true)
    })

    it("contains no message-wording intent inference helpers", () => {
      const files = [
        "features/ai-chat/build-ai-run-targets.ts",
        "features/ai-chat/Composer.tsx",
        "features/ai-chat/send-conversation-ai-chat.ts",
        "features/ai-chat/ChatWindow.tsx",
        "app/lib/ai/chat.ts",
      ]
      const forbidden = [
        "resolveAiChatIntentHint",
        "isWriteIntent",
        "WRITE_INTENTS",
        "allowWriteForIntent",
        "fastConversationLiteCandidate",
        "selectedComponentEditStreamingCandidate",
      ]
      for (const file of files) {
        const text = readFileSync(file, "utf8")
        for (const token of forbidden) {
          expect(text.includes(token), `${file} must not reference ${token}`).toBe(false)
        }
      }
    })
  })

  describe("factual target collection", () => {
    it("maps several tagged targets without collapsing them", () => {
      const tags: AiContextTag[] = [
        { type: "task", id: 1, label: "Task A", source: "mention" },
        { type: "task", id: 2, label: "Task B", source: "mention" },
        { type: "project", id: 10, label: "Project X", source: "mention" },
        {
          type: "task_component",
          id: COMPONENT_UUID,
          label: "Intro",
          source: "mention",
          taskId: 1,
          channelId: 11,
          componentId: COMPONENT_UUID,
          componentTitle: "Intro",
        },
      ]
      const targets = buildAiRunTargets({ messageTags: tags, visibleTaskId: 99 })
      expect(targets.filter((t) => t.target_kind === "task").length).toBeGreaterThanOrEqual(2)
      expect(targets.filter((t) => t.target_kind === "project")).toHaveLength(1)
      expect(targets.filter((t) => t.target_kind === "component")).toHaveLength(1)
    })

    it("sends visible selected component identities even without tags", () => {
      const fields = buildAiChatV2RequestFields({
        clientRequestId: "req-visible-component",
        activeFieldContext: {
          fieldType: "component_output",
          label: "Intro",
          taskId: 1,
          channelId: 11,
          taskComponentId: COMPONENT_UUID,
          componentId: COMPONENT_UUID,
          taskComponentOutputId: OUTPUT_UUID,
          outputUpdatedAt: "2026-07-13T12:00:00.000Z",
          selectedContextType: "component_output",
          componentSelectionSource: "explicit_click",
        },
        outputRevision: "2026-07-13T12:00:00.000Z",
      })
      expect(fields.scope.component_id).toBe(COMPONENT_UUID)
      expect(fields.scope.task_component_output_id).toBe(OUTPUT_UUID)
      expect(fields.scope.output_revision).toBe("2026-07-13T12:00:00.000Z")
      expect(fields.targets.some((t) => t.target_kind === "component" && t.component_id === COMPONENT_UUID)).toBe(
        true,
      )
    })

    it("allows a visible task with no selected channel or component", () => {
      const fields = buildAiChatV2RequestFields({
        clientRequestId: "req-task-only",
        visibleTaskId: 55,
      })
      expect(fields.targets.some((t) => t.target_kind === "task" && t.task_id === 55)).toBe(true)
      expect(fields.scope.task_id).toBe(55)
      expect(fields.scope.component_id).toBeNull()
    })

    it("keeps untagged names only in the original message", () => {
      const message = "Update Task Rubber alternatives introduction"
      const fields = buildAiChatV2RequestFields({
        clientRequestId: "req-2",
        messageTags: [],
      })
      expect(fields.targets).toEqual([])
      expect(message).toBe("Update Task Rubber alternatives introduction")
    })

    it("keeps selected component and other explicit targets while omitting conflicting ambient", () => {
      const targets = buildAiRunTargets({
        messageTags: [{ type: "task", id: 99, label: "Other task", source: "mention" }],
        activeFieldContext: {
          fieldType: "component_output",
          label: "Intro",
          taskId: 1,
          channelId: 11,
          taskComponentId: COMPONENT_UUID,
          componentId: COMPONENT_UUID,
          componentTitle: "Intro",
          selectedContextType: "component_output",
          componentSelectionSource: "explicit_click",
        },
        ambientContext: { center_task_id: 500, active_channel_id: 22 },
      })
      expect(targets.some((t) => t.target_kind === "component" && t.component_id === COMPONENT_UUID)).toBe(true)
      expect(targets.some((t) => t.task_id === 99)).toBe(true)
      expect(
        targets.some((t) => t.source === "ambient" && t.target_kind === "task" && t.task_id === 500),
      ).toBe(false)
    })

    it("adds thread context as read-only targets", () => {
      const targets = buildAiRunTargets({
        messageTags: [{ type: "task", id: 5, label: "Explicit", source: "mention" }],
        threadScope: { project_id: 10, task_id: 20, channel_id: 3 },
      })
      const threadTargets = targets.filter((t) => t.source === "thread_read")
      expect(threadTargets.length).toBeGreaterThan(0)
      expect(threadTargets.every((t) => t.allow_write === false)).toBe(true)
    })

    it("keeps project descendants false unless explicitly project-wide in structured UI", () => {
      const scoped = buildAiRunTargets({
        messageTags: [{ type: "project", id: 10, label: "Project", source: "mention" }],
      })
      const bulk = buildAiRunTargets({
        messageTags: [{ type: "project", id: 10, label: "Project", source: "mention" }],
        isProjectWideOperation: true,
      })
      expect(scoped.find((t) => t.target_kind === "project")?.allow_descendants).toBe(false)
      expect(bulk.find((t) => t.target_kind === "project")?.allow_descendants).toBe(true)
    })

    it("uses the same factual target shape for read-like and write-like requests", () => {
      const baseArgs = {
        messageTags: [{ type: "task", id: 7, label: "Task", source: "mention" }] as AiContextTag[],
        visibleTaskId: 7,
        visibleChannelId: 11,
        activeFieldContext: {
          fieldType: "component_output",
          label: "Intro",
          taskId: 7,
          channelId: 11,
          taskComponentId: COMPONENT_UUID,
          componentId: COMPONENT_UUID,
          selectedContextType: "component_output" as const,
        },
      }
      const first = buildAiRunTargets(baseArgs)
      const second = buildAiRunTargets(baseArgs)
      expect(first).toEqual(second)
    })
  })

  describe("scope precedence", () => {
    it("prefers selected component over ambient and tagged scope", () => {
      const targets = buildAiRunTargets({
        activeFieldContext: {
          fieldType: "component_output",
          label: "Intro",
          taskId: 1,
          channelId: 11,
          taskComponentId: COMPONENT_UUID,
          componentId: COMPONENT_UUID,
          selectedContextType: "component_output",
          componentSelectionSource: "explicit_click",
        },
        messageTags: [{ type: "task", id: 2, label: "Tagged", source: "mention" }],
        ambientContext: { center_task_id: 3, active_channel_id: 4 },
      })
      const scope = buildAiChatV2Scope({
        targets,
        ambientContext: { center_task_id: 3, active_channel_id: 4 },
      })
      expect(scope.component_id).toBe(COMPONENT_UUID)
      expect(scope.source).toBe("explicit_click")
    })
  })

  describe("run id capture", () => {
    it("reads X-AI-Run-Id before consuming the stream body", () => {
      const response = new Response("body", {
        headers: { "X-AI-Run-Id": "run-123" },
      })
      expect(extractRunIdFromResponse(response)).toBe("run-123")
    })
  })

  describe("run terminal reducer", () => {
    it("allows exactly one terminal state to win", () => {
      const first = reduceRunTerminalState(null, {
        kind: "completed",
        run_id: "run-1",
        message_id: "msg-1",
      })
      const second = reduceRunTerminalState(first, {
        kind: "failed",
        run_id: "run-1",
        code: "late_failure",
      })
      expect(first.kind).toBe("completed")
      expect(second).toBe(first)
    })

    it("maps V2 terminal events", () => {
      expect(
        terminalStateFromV2Event({
          type: "message.completed",
          run_id: "run-1",
          message_id: "msg-1",
        }).kind,
      ).toBe("completed")
      expect(
        terminalStateFromV2Event({
          type: "run.cancelled",
          run_id: "run-1",
        }).kind,
      ).toBe("cancelled")
    })

    it("uses legacy completion only when no run id exists", () => {
      expect(shouldUseLegacyStreamCompletion({ runId: null, terminal: null })).toBe(true)
      expect(
        shouldUseLegacyStreamCompletion({
          runId: "run-1",
          terminal: { kind: "completed", run_id: "run-1", message_id: "m1" },
        }),
      ).toBe(false)
    })
  })

  describe("multi-target progress", () => {
    beforeEach(() => {
      useAiRunProgressStore.getState().clearAll()
    })

    it("does not overwrite per-target status entries", () => {
      const store = useAiRunProgressStore.getState()
      store.upsertTargetProgress(
        targetProgressFromV2Event({
          type: "target.progress",
          run_id: "run-1",
          target_kind: "task",
          task_id: 1,
          label: "Task A",
          status: "active",
          detail: "Reading Task A…",
        }),
      )
      store.upsertTargetProgress(
        targetProgressFromV2Event({
          type: "target.progress",
          run_id: "run-1",
          target_kind: "task",
          task_id: 2,
          label: "Task B",
          status: "active",
          detail: "Reading Task B…",
        }),
      )
      const entries = store.getEntriesForRun("run-1")
      expect(entries).toHaveLength(2)
      expect(new Set(entries.map((entry) => entry.key)).size).toBe(2)
      expect(buildRunTargetProgressKey({ run_id: "run-1", task_id: 1, target_kind: "task" })).not.toBe(
        buildRunTargetProgressKey({ run_id: "run-1", task_id: 2, target_kind: "task" }),
      )
    })
  })

  describe("reconciliation and cancellation", () => {
    it("maps reconcile statuses to terminal kinds", () => {
      expect(reconcileRunStatusToTerminal("completed")).toBe("completed")
      expect(reconcileRunStatusToTerminal("failed")).toBe("failed")
      expect(reconcileRunStatusToTerminal("cancelled")).toBe("cancelled")
      expect(reconcileRunStatusToTerminal("interrupted")).toBe("interrupted")
      expect(reconcileRunStatusToTerminal("running")).toBeNull()
    })

    it("detects request_id_reused without auto retry", () => {
      expect(isRequestIdReusedError(409, '{"code":"request_id_reused"}')).toBe(true)
      expect(isRequestIdReusedError(500, "request_id_reused")).toBe(false)
    })
  })

  describe("ambiguous target confirmation", () => {
    it("parses ambiguous target candidates into clarification UI", () => {
      const event = parseAiChatV2RunEvent({
        type: "ambiguous_target_confirmation_required",
        run_id: "run-1",
        question: "Which task did you mean?",
        candidates: [
          { id: "t1", label: "Task One" },
          { id: "t2", label: "Task Two" },
        ],
      })
      expect(event?.type).toBe("ambiguous_target_confirmation_required")
      if (!event || event.type !== "ambiguous_target_confirmation_required") return
      const clarification = ambiguousTargetToClarification({ event, assistantMessageId: "temp-1" })
      expect(clarification.options).toHaveLength(2)
      expect(clarification.question).toContain("Which task")
    })
  })

  describe("preview registry", () => {
    it("uses one registry key for preview phases in a group", () => {
      const groupId = "component-output:abc"
      expect(
        resolvePreviewRegistryKey({
          group_id: groupId,
          preview_key: "preview-1",
          fallbackKey: "fallback",
        }),
      ).toBe(groupId)
      expect(
        resolveAiChangePreviewKey({
          change_id: "change-1",
          preview_key: "preview-1",
          group_id: groupId,
          entity_type: "component",
          entity_id: "1",
          tool_name: "tool",
        }),
      ).toBe(groupId)
    })

    it("suppresses generic preview when component preview owns the group", () => {
      expect(
        shouldSuppressGenericPreviewForGroup({
          group_id: "component-output:abc",
          hasComponentPreviewForGroup: true,
        }),
      ).toBe(true)
      expect(
        shouldSuppressGenericPreviewForGroup({
          group_id: "component-output:abc",
          hasComponentPreviewForGroup: false,
        }),
      ).toBe(false)
    })
  })

  describe("revision conflict", () => {
    beforeEach(() => {
      useComponentEditStreamStore.setState({ streams: {} })
    })

    it("preserves preview and flags revision conflict without overwriting", () => {
      const key = useComponentEditStreamStore.getState().upsertFromPreviewEvent({
        threadId: "thread-1",
        taskId: 1,
        channelId: 11,
        componentId: COMPONENT_UUID,
        componentTitle: "Intro",
        phase: "completed",
        contentText: "Generated preview",
        assistantTempId: "temp-1",
      })
      useComponentEditStreamStore.getState().upsertFromPreviewEvent({
        threadId: "thread-1",
        taskId: 1,
        channelId: 11,
        componentId: COMPONENT_UUID,
        componentTitle: "Intro",
        phase: "failed",
        errorMessage: "component_revision_conflict: human edit won",
        contentText: "Generated preview",
        assistantTempId: "temp-1",
      })
      const stream = useComponentEditStreamStore.getState().getStream(key)
      expect(stream?.contentText).toBe("Generated preview")
      expect(stream?.revisionConflict).toBe(true)
    })
  })

  describe("legacy behavior", () => {
    it("retains legacy stream completion when no run id is present", () => {
      expect(shouldUseLegacyStreamCompletion({ runId: null, terminal: null })).toBe(true)
    })
  })

  describe("status sequence dedupe", () => {
    it("ignores duplicate and out-of-order status sequences", () => {
      const gate = createAiChatStatusSequenceGate()
      expect(
        gate.shouldProcessStatusPayload({
          type: "target.progress",
          sequence: 1,
          run_id: "run-1",
        }),
      ).toBe(true)
      expect(
        gate.shouldProcessStatusPayload({
          type: "target.progress",
          sequence: 1,
          run_id: "run-1",
        }),
      ).toBe(false)
      expect(
        gate.shouldProcessStatusPayload({
          type: "target.progress",
          sequence: 3,
          run_id: "run-1",
        }),
      ).toBe(true)
      expect(
        gate.shouldProcessStatusPayload({
          type: "target.progress",
          sequence: 2,
          run_id: "run-1",
        }),
      ).toBe(false)
      expect(gate.highestSequence()).toBe(3)
    })

    it("still processes legacy status payloads without sequence", () => {
      const gate = createAiChatStatusSequenceGate()
      expect(gate.shouldProcessStatusPayload({ type: "done" })).toBe(true)
      expect(gate.shouldProcessStatusPayload({ text: "Working…" })).toBe(true)
    })
  })

  describe("run diagnostics", () => {
    it("records first-seen client timestamps", () => {
      const tracker = createAiChatRunDiagnosticsTracker()
      tracker.markRequestSent()
      tracker.markResponseHeaders("run-1", "ai;dur=12")
      tracker.markFirstStatusEvent()
      tracker.markFirstVisibleModelText()
      tracker.markFirstPreviewEvent()
      tracker.markFirstSavedPreview()
      tracker.markTerminalEvent()
      const snapshot = tracker.snapshot()
      expect(snapshot.runId).toBe("run-1")
      expect(snapshot.serverTiming).toBe("ai;dur=12")
      expect(snapshot.firstStatusEventAt).not.toBeNull()
      expect(snapshot.firstVisibleModelTextAt).not.toBeNull()
      expect(snapshot.firstPreviewEventAt).not.toBeNull()
      expect(snapshot.firstSavedPreviewAt).not.toBeNull()
      expect(snapshot.terminalEventAt).not.toBeNull()
      expect(() => logAiChatRunDiagnostics(snapshot)).not.toThrow()
    })
  })

  describe("canonical target deduplication and scope fixes", () => {
    it("collapses repeated task, channel, and component identities while keeping output separate", () => {
      const targets = buildAiRunTargets({
        activeFieldContext: {
          fieldType: "component_output",
          label: "Intro",
          taskId: 13143,
          channelId: 11,
          taskComponentId: COMPONENT_UUID,
          componentId: COMPONENT_UUID,
          taskComponentOutputId: OUTPUT_UUID,
          selectedContextType: "component_output",
          componentSelectionSource: "explicit_click",
        },
        visibleTaskId: 13143,
        visibleChannelId: 11,
        messageTags: [
          {
            type: "task_component",
            id: COMPONENT_UUID,
            label: "Intro",
            source: "mention",
            taskId: 13143,
            channelId: 11,
            componentId: COMPONENT_UUID,
            taskComponentOutputId: OUTPUT_UUID,
            componentTitle: "Intro",
          },
        ],
        ambientContext: { center_task_id: 13143, active_channel_id: 11 },
      })

      expect(targets.filter((t) => t.target_kind === "task" && t.task_id === 13143)).toHaveLength(1)
      expect(targets.filter((t) => t.target_kind === "channel" && t.channel_id === 11)).toHaveLength(1)
      expect(
        targets.filter((t) => t.target_kind === "component" && t.component_id === COMPONENT_UUID),
      ).toHaveLength(1)
      expect(
        targets.filter((t) => t.target_kind === "output" && t.output_id === OUTPUT_UUID),
      ).toHaveLength(1)

      const taskTarget = targets.find((t) => t.target_kind === "task" && t.task_id === 13143)
      const componentTarget = targets.find(
        (t) => t.target_kind === "component" && t.component_id === COMPONENT_UUID,
      )
      expect(taskTarget?.source).toBe("explicit_tag")
      expect(componentTarget?.source).toBe("explicit_tag")
    })

    it("omits channel targets and scope fields when task identity is unknown", () => {
      const targets = buildAiRunTargets({
        visibleChannelId: 11,
      })
      expect(targets.some((t) => t.target_kind === "channel")).toBe(false)

      const scope = buildAiChatV2Scope({
        targets,
        visibleChannelId: 11,
      })
      expect(scope.channel_id).toBeNull()
      expect(scope.task_id).toBeNull()
    })

    it("omits thread channel targets when thread task is missing", () => {
      const targets = buildAiRunTargets({
        threadScope: { channel_id: 11 },
      })
      expect(targets.some((t) => t.target_kind === "channel")).toBe(false)
    })
  })
})

describe("parseAiChatV2RunEvent", () => {
  it("parses message.completed terminal events", () => {
    const event = parseAiChatV2RunEvent({
      type: "message.completed",
      run_id: "run-1",
      message_id: "msg-1",
    })
    expect(event).toEqual({
      type: "message.completed",
      run_id: "run-1",
      message_id: "msg-1",
      usage: undefined,
    })
  })

  it("merges zero-token usage from message.completed", () => {
    const event = parseAiChatV2RunEvent({
      type: "message.completed",
      run_id: "run-1",
      message_id: "msg-1",
      usage: {
        user: {
          used_tokens: 0,
          reserved_tokens: 0,
          projected_tokens: 0,
          limit_tokens: 20000,
          remaining_tokens: 20000,
          percent_used: 0,
          projected_percent: 0,
          warning_percent: 80,
          warning: false,
          projected_warning: false,
          maxed_out: false,
          projected_maxed_out: false,
          resets_at: null,
          timezone: "UTC",
        },
        team: {
          used_tokens: 0,
          reserved_tokens: 0,
          projected_tokens: 0,
          limit_tokens: 50000,
          remaining_tokens: 50000,
          percent_used: 0,
          projected_percent: 0,
          warning_percent: 80,
          warning: false,
          projected_warning: false,
          maxed_out: false,
          projected_maxed_out: false,
          resets_at: null,
          timezone: "UTC",
        },
      },
    })
    expect(event?.type).toBe("message.completed")
    if (!event || event.type !== "message.completed") return
    expect(event.usage?.user.used_tokens).toBe(0)
    expect(event.usage?.team.used_tokens).toBe(0)
  })

  it("parses run.interrupted terminal events", () => {
    const event = parseAiChatV2RunEvent({
      type: "run.interrupted",
      run_id: "run-1",
      code: "user_token_limit_exceeded",
      message: "Limit reached",
    })
    expect(event?.type).toBe("run.interrupted")
    if (!event || event.type !== "run.interrupted") return
    expect(event.code).toBe("user_token_limit_exceeded")
    expect(
      terminalStateFromV2Event(event).kind,
    ).toBe("interrupted")
  })
})

describe("AI Chat usage and terminal failures", () => {
  const sampleUsage = {
    user: {
      used_tokens: 18000,
      reserved_tokens: 0,
      projected_tokens: 18000,
      limit_tokens: 20000,
      remaining_tokens: 2000,
      percent_used: 90,
      projected_percent: 90,
      warning_percent: 80,
      warning: true,
      projected_warning: true,
      maxed_out: false,
      projected_maxed_out: false,
      resets_at: "2026-07-15T00:00:00.000Z",
      timezone: "Europe/Lisbon",
    },
    team: {
      used_tokens: 12000,
      reserved_tokens: 0,
      projected_tokens: 12000,
      limit_tokens: 50000,
      remaining_tokens: 38000,
      percent_used: 24,
      projected_percent: 24,
      warning_percent: 80,
      warning: false,
      projected_warning: false,
      maxed_out: false,
      projected_maxed_out: false,
      resets_at: "2026-07-15T00:00:00.000Z",
      timezone: "Europe/Lisbon",
    },
  }

  it("picks the stricter usage scope by percent used", () => {
    const usage = parseAiChatUsageSnapshot(sampleUsage)
    const strictest = pickStricterUsageScope(usage)
    expect(strictest?.key).toBe("user")
    expect(strictest?.scope.percent_used).toBe(90)
  })

  it("blocks sends only when maxed_out is true", () => {
    const usage = parseAiChatUsageSnapshot(sampleUsage)
    expect(isUsageSendBlocked(usage)).toBe(false)
    const maxed = parseAiChatUsageSnapshot({
      ...sampleUsage,
      user: { ...sampleUsage.user, maxed_out: true },
    })
    expect(isUsageSendBlocked(maxed)).toBe(true)
  })

  it("maps known failure codes to explicit copy", () => {
    expect(resolveRunFailureMessage({ code: "user_token_limit_exceeded" })).toContain(
      "reached your daily AI token limit",
    )
    expect(resolveRunFailureMessage({ code: "team_token_limit_exceeded" })).toContain(
      "team has reached",
    )
    expect(resolveRunFailureMessage({ code: "user_token_limit_would_be_exceeded" })).toContain(
      "would exceed your remaining",
    )
    expect(resolveRunFailureMessage({ code: "component_edit_plan_invalid" })).toContain(
      "No changes were saved",
    )
    expect(resolveRunFailureMessage({ code: "external_source_unavailable" })).toContain(
      "No changes were saved",
    )
    expect(resolveRunFailureMessage({ code: "component_busy" })).toContain(
      "being updated",
    )
    expect(resolveRunFailureMessage({ code: "component_save_timeout" })).toContain(
      "Saving took too long",
    )
    expect(resolveRunFailureMessage({ code: "deadline_exceeded" })).toContain(
      "timed out",
    )
    expect(shouldOfferRunFailureRetry("component_busy")).toBe(true)
    expect(shouldOfferRunFailureReconcile("deadline_exceeded")).toBe(true)
    expect(resolveRunFailureMessage({ code: "unknown_backend_code", backendMessage: "Backend said no" })).toBe(
      "Backend said no",
    )
    expect(resolveRunFailureMessage({ code: "mystery" })).toContain("mystery")
  })

  it("parses HTTP error payloads with usage", () => {
    const parsed = parseAiChatErrorPayload(
      JSON.stringify({
        code: "team_token_limit_exceeded",
        message: "Team limit reached",
        usage: sampleUsage,
      }),
    )
    expect(parsed.code).toBe("team_token_limit_exceeded")
    expect(parsed.usage?.user.used_tokens).toBe(18000)
    expect(isTokenLimitExceededCode(parsed.code)).toBe(true)
    expect(isTokenLimitWouldExceedCode("user_token_limit_would_be_exceeded")).toBe(true)
  })

  it("formats token counts compactly and exactly", () => {
    expect(formatCompactTokenCount(12438)).toBe("12.4k")
    expect(formatExactTokenCount(12438)).toBe("12,438")
  })
})
