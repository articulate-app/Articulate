import { describe, expect, it } from "vitest"
import { parseProjectComponentChannelPoliciesResponse } from "../app/lib/services/project-component-channel-policies"

describe("project component channel policies", () => {
  it("parses ai_get_project_component_channel_policies_v1 responses", () => {
    const parsed = parseProjectComponentChannelPoliciesResponse({
      ok: true,
      project_id: 111,
      project_component_id: 153,
      channels: [
        {
          channel_id: 11,
          channel_name: "Blog",
          policy: "optional",
          required: false,
          position: null,
        },
        {
          channel_id: 12,
          channel_name: "LinkedIn",
          policy: "required",
          required: true,
          position: 2,
        },
      ],
    })

    expect(parsed?.ok).toBe(true)
    expect(parsed?.project_component_id).toBe(153)
    expect(parsed?.briefing_component_id).toBeNull()
    expect(parsed?.channels).toHaveLength(2)
    expect(parsed?.channels[0]).toMatchObject({
      channel_id: 11,
      channel_name: "Blog",
      policy: "optional",
      required: false,
      position: null,
    })
    expect(parsed?.channels[1]).toMatchObject({
      channel_id: 12,
      required: true,
      position: 2,
    })
  })

  it("parses system-component channel policy responses", () => {
    const parsed = parseProjectComponentChannelPoliciesResponse({
      ok: true,
      project_id: 111,
      project_component_id: null,
      briefing_component_id: 42,
      channels: [
        {
          channel_id: 11,
          channel_name: "Blog",
          policy: "required",
          required: true,
          position: 1,
        },
      ],
    })

    expect(parsed?.briefing_component_id).toBe(42)
    expect(parsed?.project_component_id).toBeNull()
    expect(parsed?.channels).toHaveLength(1)
  })

  it("rejects non-ok payloads", () => {
    expect(
      parseProjectComponentChannelPoliciesResponse({
        ok: false,
        error: "denied",
      }),
    ).toBeNull()
  })
})
