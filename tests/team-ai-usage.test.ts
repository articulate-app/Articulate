import {
  addDaysToDateString,
  bucketStartToDateString,
  eachDateStringInclusive,
  fillTeamAiUsageSeries,
  formatAiUsageStageLabel,
  parseTeamAiUsageResponse,
  parseUserAiUsageResponse,
} from "../app/lib/services/team-ai-usage"

describe("team AI usage helpers", () => {
  it("fills missing daily buckets with zeros", () => {
    const filled = fillTeamAiUsageSeries(
      [
        {
          bucket_start: "2026-07-02",
          prompt_tokens: 100,
          completion_tokens: 40,
          cached_prompt_tokens: 10,
          total_tokens: 140,
          call_count: 2,
        },
      ],
      "2026-07-01",
      "2026-07-03",
      "UTC",
    )

    expect(filled).toHaveLength(3)
    expect(filled[0]).toMatchObject({
      bucket_start: "2026-07-01",
      prompt_tokens: 0,
      completion_tokens: 0,
      call_count: 0,
    })
    expect(filled[1]?.prompt_tokens).toBe(100)
    expect(filled[2]?.bucket_start).toBe("2026-07-03")
  })

  it("parses RPC payload and formats stage labels", () => {
    const parsed = parseTeamAiUsageResponse({
      team_id: 22,
      timezone: "Europe/Lisbon",
      date_from: "2026-07-01",
      date_to: "2026-07-20",
      summary: {
        prompt_tokens: 10,
        completion_tokens: 5,
        cached_prompt_tokens: 2,
        total_tokens: 15,
        call_count: 3,
        limit_tokens: null,
        remaining_tokens: null,
        percent_used: null,
        period_start: null,
        resets_at: null,
      },
      series: [],
      by_model: [{ provider: "openai", model: "gpt-5", total_tokens: 15, call_count: 3 }],
      by_stage: [{ stage: "assistant_stream", total_tokens: 12, call_count: 2 }],
      top_users: [{ user_id: 1, user_name: "Ivo", total_tokens: 15, call_count: 3 }],
    })

    expect(parsed.summary.limit_tokens).toBeNull()
    expect(parsed.by_model[0]?.model).toBe("gpt-5")
    expect(formatAiUsageStageLabel("assistant_stream")).toBe("Assistant stream")
    expect(formatAiUsageStageLabel("build_worker")).toBe("Build worker")
  })

  it("parses user usage by_project breakdown", () => {
    const parsed = parseUserAiUsageResponse({
      user_id: 7,
      team_id: 22,
      can_manage: true,
      timezone: "UTC",
      date_from: "2026-07-01",
      date_to: "2026-07-20",
      summary: {
        prompt_tokens: 10,
        completion_tokens: 5,
        cached_prompt_tokens: 0,
        total_tokens: 15,
        call_count: 2,
        limit_tokens: 1000,
        remaining_tokens: 985,
        percent_used: 1.5,
        period_start: "2026-07-20T00:00:00Z",
        resets_at: "2026-07-21T00:00:00Z",
      },
      series: [],
      by_model: [],
      by_project: [
        { project_id: 9, project_title: "Alpha", total_tokens: 12, call_count: 1 },
        { project_id: null, project_title: "No project", total_tokens: 3, call_count: 1 },
      ],
    })

    expect(parsed.by_project).toHaveLength(2)
    expect(parsed.by_project[0]?.project_title).toBe("Alpha")
    expect(parsed.by_project[1]?.project_id).toBeNull()
  })

  it("walks inclusive date strings without local drift", () => {
    expect(addDaysToDateString("2026-07-01", 1)).toBe("2026-07-02")
    expect(eachDateStringInclusive("2026-07-01", "2026-07-03")).toEqual([
      "2026-07-01",
      "2026-07-02",
      "2026-07-03",
    ])
    expect(bucketStartToDateString("2026-07-02T00:00:00+01:00", "Europe/Lisbon")).toBe("2026-07-02")
  })
})
