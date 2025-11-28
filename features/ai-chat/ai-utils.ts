/**
 * AI Chat Utilities
 * 
 * Centralized utilities for AI chat functionality including:
 * - Thread management for tasks and channels
 * - Sending messages to the AI edge function
 * - Building instruction strings for different contexts
 * - Applying AI-generated content to components
 */

import { getSupabaseBrowser } from "../../lib/supabase-browser"
import type { AiThread, AiMessage } from "./types"

/**
 * Ensure an AI thread exists for a task
 * Note: ai_threads table doesn't have channel_id - threads are per task, not per channel
 * @param taskId - The task ID
 * @param channelId - The channel ID (used for context, not stored in thread)
 * @returns The thread ID
 */
export async function ensureAiThread({
  taskId,
  channelId,
}: {
  taskId: number
  channelId: number
}): Promise<string> {
  const supabase = getSupabaseBrowser()
  
  // 1. Try to fetch existing thread for this task
  const { data, error: fetchError } = await supabase
    .from('ai_threads')
    .select('*')
    .eq('task_id', taskId)
    .eq('scope', 'task')
    .eq('is_deleted', false)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  
  if (fetchError) {
    console.error('Error fetching existing thread:', fetchError)
    throw new Error('Failed to fetch existing thread')
  }
  
  if (data) return data.id
  
  // 2. Create new one
  const { data: created, error: createError } = await supabase
    .from('ai_threads')
    .insert({
      task_id: taskId,
      scope: 'task',
      visibility: 'private',
      is_collaborative: true,
      title: 'Task AI Assistant'
    })
    .select('*')
    .single()
  
  if (createError) {
    console.error('Error creating thread:', createError)
    throw new Error('Failed to create AI thread')
  }
  
  return created.id
}

/**
 * Send a message to the AI edge function
 * @deprecated Use callAiChat from app/lib/ai/chat.ts instead
 * This function is kept for backward compatibility with existing chat UI
 */
export async function sendToAI({
  threadId,
  message,
  activeChannelId,
  attachments = [],
  mode,
  componentId,
  autoRun = false,
}: {
  threadId: string
  message: string
  activeChannelId?: number
  attachments?: any[]
  mode?: "build_component" | "build_briefing"
  componentId?: string | null
  autoRun?: boolean
}): Promise<AiMessage> {
  const supabase = getSupabaseBrowser()
  
  // Get the current session
  const { data: { session } } = await supabase.auth.getSession()
  
  if (!session) {
    throw new Error('No active session')
  }
  
  // Call the edge function with new contract
  const res = await fetch(
    `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/ai-chat`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${session.access_token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        thread_id: threadId,
        message: message || null,
        attachments,
        active_channel_id: activeChannelId ?? null,
        mode: mode ?? null,
        component_id: componentId ?? null,
        auto_run: autoRun,
      }),
    }
  )
  
  if (!res.ok) {
    const errText = await res.text()
    console.error('AI chat error:', errText)
    throw new Error(`AI chat failed: ${errText}`)
  }
  
  const data = await res.json()
  // Return the message from the response
  return data.message as AiMessage
}

/**
 * Build instruction string for component-level generation
 */
export function buildInstructionForComponent({
  component,
  task,
  context,
}: {
  component: {
    title: string
    description?: string | null
    purpose?: string | null
    guidance?: string | null
    suggested_word_count?: number | null
  }
  task: {
    title: string
  }
  context?: {
    projectName?: string
    editorialLine?: string
    briefing?: string
  }
}): string {
  const parts = [
    `Write the component **${component.title}** for the task "${task.title}".`
  ]
  
  if (component.purpose) {
    parts.push(`\nPurpose: ${component.purpose}`)
  }
  
  if (component.description) {
    parts.push(`\nInstructions:\n${component.description}`)
  }
  
  if (component.guidance) {
    parts.push(`\nGuidance:\n${component.guidance}`)
  }
  
  if (component.suggested_word_count) {
    parts.push(`\nTarget word count: ${component.suggested_word_count} words`)
  }
  
  parts.push(
    '\n\nIf useful, reference the previous components already generated in this thread.'
  )
  parts.push('\nReturn only the text for this component.')
  
  return parts.join('')
}

/**
 * Build instruction string for full briefing generation
 */
export function buildInstructionForFullBriefing({
  components,
  task,
  briefingTitle,
  context,
}: {
  components: Array<{
    title: string
    description?: string | null
    position?: number | null
    suggested_word_count?: number | null
  }>
  task: {
    title: string
  }
  briefingTitle?: string
  context?: {
    projectName?: string
    editorialLine?: string
    briefing?: string
  }
}): string {
  const parts = [
    `Generate the full content for the task "${task.title}".`
  ]
  
  if (briefingTitle) {
    parts.push(`\nBriefing type: ${briefingTitle}`)
  }
  
  parts.push('\n\nComponents to produce:')
  
  const sortedComponents = [...components].sort((a, b) => {
    const posA = a.position ?? 999
    const posB = b.position ?? 999
    return posA - posB
  })
  
  sortedComponents.forEach((c) => {
    let line = `- **${c.title}**`
    if (c.description) {
      line += `: ${c.description}`
    }
    if (c.suggested_word_count) {
      line += ` (${c.suggested_word_count} words)`
    }
    parts.push(line)
  })
  
  parts.push(
    '\n\nFollow the position order and avoid repetition across components.'
  )
  parts.push(
    'Return each component clearly separated with headings matching the component titles.'
  )
  
  return parts.join('\n')
}

/**
 * Apply AI-generated content to a component
 * Uses the ai_upsert_component_output RPC function
 */
export async function applyToComponent({
  taskId,
  channelId,
  briefingComponentId,
  contentText,
}: {
  taskId: number
  channelId: number
  briefingComponentId: number
  contentText: string
}): Promise<void> {
  const supabase = getSupabaseBrowser()
  
  const { error } = await supabase.rpc('ai_upsert_component_output', {
    task_id: taskId,
    channel_id: channelId,
    briefing_component_id: briefingComponentId,
    content_text: contentText,
  })
  
  if (error) {
    console.error('Error applying content to component:', error)
    throw new Error(`Failed to apply content: ${error.message}`)
  }
}

/**
 * Extract task information for building context
 */
export async function getTaskInfo(taskId: number): Promise<{
  title: string
  description?: string
  projectName?: string
}> {
  const supabase = getSupabaseBrowser()
  
  const { data, error } = await supabase
    .from('tasks')
    .select(`
      title,
      description,
      projects:project_id (
        title
      )
    `)
    .eq('id', taskId)
    .single()
  
  if (error) {
    console.error('Error fetching task info:', error)
    throw new Error('Failed to fetch task information')
  }
  
  return {
    title: data.title,
    description: data.description,
    projectName: (data.projects as any)?.title,
  }
}

/**
 * Parse AI response and extract component content
 * Handles both single component and multi-component responses
 */
export function parseAIResponse(
  response: string,
  componentTitles: string[]
): Map<string, string> {
  const contentMap = new Map<string, string>()
  
  // If only one component, return the entire response
  if (componentTitles.length === 1) {
    contentMap.set(componentTitles[0], response.trim())
    return contentMap
  }
  
  // Try to split by headings that match component titles
  let remaining = response
  
  for (let i = 0; i < componentTitles.length; i++) {
    const title = componentTitles[i]
    const nextTitle = i < componentTitles.length - 1 ? componentTitles[i + 1] : null
    
    // Look for markdown headings (# Title, ## Title, or **Title**)
    const headingPattern = new RegExp(
      `(?:^|\\n)(?:#{1,3}\\s*\\*\\*${title}\\*\\*|#{1,3}\\s*${title}|\\*\\*${title}\\*\\*)\\s*\\n`,
      'i'
    )
    
    const match = remaining.match(headingPattern)
    if (match) {
      const startIndex = match.index! + match[0].length
      let content: string
      
      if (nextTitle) {
        const nextPattern = new RegExp(
          `(?:^|\\n)(?:#{1,3}\\s*\\*\\*${nextTitle}\\*\\*|#{1,3}\\s*${nextTitle}|\\*\\*${nextTitle}\\*\\*)`,
          'i'
        )
        const nextMatch = remaining.slice(startIndex).match(nextPattern)
        
        if (nextMatch) {
          content = remaining.slice(startIndex, startIndex + nextMatch.index!).trim()
        } else {
          content = remaining.slice(startIndex).trim()
        }
      } else {
        content = remaining.slice(startIndex).trim()
      }
      
      contentMap.set(title, content)
      remaining = remaining.slice(startIndex + content.length)
    }
  }
  
  // If we couldn't parse by titles, return the whole response for the first component
  if (contentMap.size === 0 && componentTitles.length > 0) {
    contentMap.set(componentTitles[0], response.trim())
  }
  
  return contentMap
}

