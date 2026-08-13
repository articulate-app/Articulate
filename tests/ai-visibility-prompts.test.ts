import { describe, expect, it } from "vitest"
import {
  groupAiPromptsByPrompt,
  type AiPromptToolRow,
} from "../app/lib/ai-visibility-prompts"

function row(partial: Partial<AiPromptToolRow>): AiPromptToolRow {
  return {
    project_ai_prompt_id: 1,
    prompt_text: "Best SEO agencies in Lisbon?",
    ai_tool_id: 1,
    ai_tool_name: "ChatGPT",
    brand_position: null,
    run_at: null,
    ...partial,
  }
}

describe("groupAiPromptsByPrompt", () => {
  it("shows one prompt once with every network it runs on", () => {
    const grouped = groupAiPromptsByPrompt([
      row({ ai_tool_id: 2, ai_tool_name: "Gemini", brand_position: 5 }),
      row({ ai_tool_id: 1, ai_tool_name: "ChatGPT", brand_position: 3 }),
    ])

    expect(grouped).toHaveLength(1)
    expect(grouped[0]?.promptText).toBe("Best SEO agencies in Lisbon?")
    expect(grouped[0]?.tools.map((tool) => tool.toolName)).toEqual([
      "ChatGPT",
      "Gemini",
    ])
    expect(grouped[0]?.bestPosition).toBe(3)
  })

  it("keeps distinct prompts apart", () => {
    const grouped = groupAiPromptsByPrompt([
      row({ project_ai_prompt_id: 1 }),
      row({ project_ai_prompt_id: 2, prompt_text: "Best PPC agencies?" }),
    ])
    expect(grouped.map((group) => group.promptId)).toEqual([1, 2])
  })

  it("ignores duplicate rows for the same prompt and tool", () => {
    const grouped = groupAiPromptsByPrompt([
      row({ ai_tool_id: 1, brand_position: 2 }),
      row({ ai_tool_id: 1, brand_position: 9 }),
    ])
    expect(grouped[0]?.tools).toHaveLength(1)
    expect(grouped[0]?.bestPosition).toBe(2)
  })

  it("reports no best position when the brand is never mentioned", () => {
    const grouped = groupAiPromptsByPrompt([
      row({ ai_tool_id: 1, brand_position: null }),
      row({ ai_tool_id: 2, ai_tool_name: "Gemini", brand_position: null }),
    ])
    expect(grouped[0]?.bestPosition).toBeNull()
  })
})
