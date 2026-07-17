/**
 * Stream framing for ai-chat plain-text responses:
 * - `__AI_STATUS__{json}` — transient status / terminal markers (see `consumeTextStream` in `app/lib/ai/chat.ts`)
 * - `__AI_ASSET__{json}` — inline generated assets for immediate rendering
 * - `__AI_COMPONENT_OUTPUT__{json}` — final structured component output payload
 * - `__AI_MESSAGE_OUTPUT__{json}` — final structured assistant message payload
 * - `__AI_ACTION__{json}` / `__AI_PENDING_ACTION__{json}` — structured UI events (`content_saved`, `clarification_request`, etc.)
 * - `__AI_THREAD_TITLE__{json}` — streamed thread title updates (`started`/`delta`/`completed`)
 * - `__AI_REQUEST_PLAN__{json}` — Request Plan V3 execution-plan audit (`type: "request_plan"`)
 *
 * Parsing is incremental inside `consumeTextStream`; use `onAiAction` / status handlers on `ConsumeTextStreamHandlers`.
 */
export type { AiChatStreamAction, AiChatContentSavedAction, AiChatThreadTitleEvent } from "../../app/lib/ai/chat"
export { parseContentSavedAction } from "../../app/lib/ai/chat"
