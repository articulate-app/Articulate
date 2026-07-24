import type { AiChatChangePreviewEvent } from "../../app/lib/ai/chat"
import {
  useAiChangePreviewStreamStore,
  type AiChangePreview,
} from "../../app/store/ai-change-preview-stream"
import { useAiOrchestratedBuildStore } from "../../app/store/ai-orchestrated-build-store"
import { useAiRequestPlanStore } from "../../app/store/ai-request-plan-store"
import { discoverOrchestratedBuildFromChangePreview } from "./discover-orchestrated-build"
import { requestPlanAllowsOrchestratedBuildCard } from "./request-plan"

function toStorePreview(event: AiChatChangePreviewEvent): AiChangePreview {
  return {
    type: "ai_change_preview",
    phase: event.phase,
    ok: event.ok ?? null,
    change_id: event.change_id,
    preview_key: event.preview_key ?? null,
    group_id: event.group_id ?? null,
    tool_name: event.tool_name ?? null,
    round: event.round ?? null,
    entity_type: event.entity_type,
    entity_id: event.entity_id ?? null,
    task_id: event.task_id ?? null,
    channel_id: event.channel_id ?? null,
    project_id: event.project_id ?? null,
    component_id: event.component_id ?? null,
    task_component_output_id: event.task_component_output_id ?? null,
    operation: event.operation ?? null,
    title: event.title ?? null,
    summary: event.summary ?? null,
    reason: event.reason ?? null,
    error: event.error ?? null,
    task_count: event.task_count ?? null,
    channel_count: event.channel_count ?? null,
    task_ids: event.task_ids ?? null,
    requires_clarification: event.requires_clarification ?? null,
    no_build_created: event.no_build_created ?? null,
    clarification_reason: event.clarification_reason ?? null,
    preview_items: event.preview_items?.map((item) => ({
      label: item.label,
      count: item.count ?? null,
      values: item.values ?? null,
    })),
    changes: event.changes?.map((change) => ({
      field: change.field,
      label: change.label ?? null,
      before: change.before,
      after: change.after,
    })),
  }
}

/** Dispatch a live `__AI_CHANGE_PREVIEW__` event into the change-preview store. */
export function applyAiChangePreviewEvent(
  event: AiChatChangePreviewEvent,
  assistantMessageId: string | null,
  options?: { threadId?: string | null },
): string {
  const skippedPreflight =
    event.requires_clarification === true || event.no_build_created === true
  const planOperation = assistantMessageId
    ? useAiRequestPlanStore.getState().getBucket(assistantMessageId)?.plan.operation ?? null
    : null
  // plan/apply structure ops must never mount an orchestrated-build ("Queued") card.
  const allowsBuildCard = requestPlanAllowsOrchestratedBuildCard(planOperation)
  const discovered =
    skippedPreflight || !allowsBuildCard
      ? null
      : discoverOrchestratedBuildFromChangePreview(event)
  // Only register a build card when a real build_id is present (never for skipped preflight).
  if (discovered) {
    useAiOrchestratedBuildStore.getState().registerBuild({
      buildId: discovered.buildId,
      threadId: options?.threadId ?? null,
      assistantMessageId,
      title: discovered.title,
      summary: discovered.summary,
      changeSetId: discovered.changeSetId,
      startFailed: discovered.startFailed,
      errorCode: discovered.errorCode,
      errorMessage: discovered.errorMessage,
    })
  }
  return useAiChangePreviewStreamStore.getState().upsertAiChangePreview({
    threadId: options?.threadId ?? null,
    assistantMessageId,
    preview: {
      ...toStorePreview(event),
      ...(skippedPreflight
        ? {
            requires_clarification: true,
            no_build_created: true,
            summary: event.summary?.trim() || "Waiting for input",
          }
        : {}),
    },
  })
}
