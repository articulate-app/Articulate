import { describe, expect, it } from "vitest"
import { parseProjectAiUsageResponse } from "../app/lib/services/project-ai-usage"

describe("project AI usage helpers", () => {
  it("parses RPC payload with accounted tokens and breakdowns", () => {
    const parsed = parseProjectAiUsageResponse({
      project_id: 42,
      timezone: "Europe/Lisbon",
      date_from: "2026-07-01",
      date_to: "2026-07-20",
      summary: {
        accounted_tokens: 150,
        prompt_tokens: 100,
        completion_tokens: 40,
        cached_prompt_tokens: 10,
        estimated_tokens: 10,
        call_count: 5,
        estimated_call_count: 1,
        user_count: 2,
      },
      series: [
        {
          bucket_start: "2026-07-01",
          accounted_tokens: 150,
          prompt_tokens: 100,
          completion_tokens: 40,
          cached_prompt_tokens: 10,
          estimated_tokens: 10,
          call_count: 5,
        },
      ],
      by_model: [{ provider: "openai", model: "gpt-5", accounted_tokens: 140, call_count: 4 }],
      by_stage: [{ stage: "thread_title", accounted_tokens: 10, call_count: 1 }],
      by_user: [{ user_id: 7, accounted_tokens: 150, call_count: 5 }],
    })

    expect(parsed.project_id).toBe(42)
    expect(parsed.summary.accounted_tokens).toBe(150)
    expect(parsed.summary.estimated_call_count).toBe(1)
    expect(parsed.series[0]?.estimated_tokens).toBe(10)
    expect(parsed.by_model[0]?.model).toBe("gpt-5")
    expect(parsed.by_user[0]?.user_id).toBe(7)
    expect(parsed.by_stage[0]?.stage).toBe("thread_title")
  })

  it("tolerates missing nested fields", () => {
    const parsed = parseProjectAiUsageResponse({ project_id: 1 })
    expect(parsed.summary.call_count).toBe(0)
    expect(parsed.series).toEqual([])
    expect(parsed.by_model).toEqual([])
    expect(parsed.by_stage).toEqual([])
    expect(parsed.by_user).toEqual([])
  })
})
