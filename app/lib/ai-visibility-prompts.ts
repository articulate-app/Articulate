/**
 * AI visibility rows arrive as one row per (prompt, tool) pair, so the same
 * prompt tracked on ChatGPT and Gemini shows up twice. Group them so a prompt
 * is presented once with the networks it runs on.
 */

export type AiPromptToolRow = {
  project_ai_prompt_id: number
  prompt_text: string
  ai_tool_id: number
  ai_tool_name: string
  brand_position: number | null
  run_at: string | null
}

export type AiPromptToolResult = {
  toolId: number
  toolName: string
  brandPosition: number | null
  runAt: string | null
}

export type GroupedAiPrompt = {
  promptId: number
  promptText: string
  tools: AiPromptToolResult[]
  /** Best (lowest) position across tools, or null when never mentioned. */
  bestPosition: number | null
}

export function groupAiPromptsByPrompt<T extends AiPromptToolRow>(
  rows: T[],
): GroupedAiPrompt[] {
  const groups = new Map<number, GroupedAiPrompt>()

  for (const row of rows) {
    const existing = groups.get(row.project_ai_prompt_id)
    const tool: AiPromptToolResult = {
      toolId: row.ai_tool_id,
      toolName: row.ai_tool_name,
      brandPosition: row.brand_position,
      runAt: row.run_at,
    }
    if (!existing) {
      groups.set(row.project_ai_prompt_id, {
        promptId: row.project_ai_prompt_id,
        promptText: row.prompt_text,
        tools: [tool],
        bestPosition: tool.brandPosition,
      })
      continue
    }
    if (existing.tools.some((entry) => entry.toolId === tool.toolId)) continue
    existing.tools.push(tool)
    if (
      tool.brandPosition != null &&
      (existing.bestPosition == null || tool.brandPosition < existing.bestPosition)
    ) {
      existing.bestPosition = tool.brandPosition
    }
  }

  return [...groups.values()].map((group) => ({
    ...group,
    tools: [...group.tools].sort((a, b) => a.toolName.localeCompare(b.toolName)),
  }))
}
