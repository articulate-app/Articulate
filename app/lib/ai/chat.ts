/**
 * AI Chat Utility
 * Helper functions for calling the ai-chat Edge Function
 */

import { createClientComponentClient } from "@supabase/auth-helpers-nextjs"

export interface AiChatRequest {
  thread_id: string
  message?: string | null
  attachments?: {
    file_name: string
    file_path: string
    mime_type?: string | null
    size?: number | null
  }[]
  active_channel_id?: number | null
  mode?: "build_component" | "build_briefing" | string | null
  component_id?: string | null
  auto_run?: boolean
}

export interface AiChatResponse {
  message: {
    id: string
    thread_id: string
    role: "assistant"
    content: string
    content_json: any | null
    // ... usage + pricing metadata
  }
}

/**
 * Call the ai-chat Edge Function
 * For all interactive UI uses, autoRun should be false (default)
 */
export async function callAiChat(opts: {
  supabase: ReturnType<typeof createClientComponentClient>
  threadId: string
  message?: string | null
  activeChannelId?: number | null
  mode?: "build_component" | "build_briefing"
  componentId?: string | null
  autoRun?: boolean
  attachments?: AiChatRequest['attachments']
}): Promise<AiChatResponse> {
  const {
    supabase,
    threadId,
    message = "",
    activeChannelId = null,
    mode,
    componentId,
    autoRun = false,
    attachments = [],
  } = opts

  const { data, error } = await supabase.functions.invoke("ai-chat", {
    body: {
      thread_id: threadId,
      message,
      active_channel_id: activeChannelId,
      mode,
      component_id: componentId,
      auto_run: autoRun,
      attachments,
    },
  })

  if (error) {
    console.error("AI chat error:", error)
    throw error
  }

  return data as AiChatResponse
}

