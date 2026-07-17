import { describe, expect, it } from "vitest"
import { resolveTaskChannelInitMode } from "../app/lib/task-channel-init"

describe("resolveTaskChannelInitMode", () => {
  it("uses bootstrap mode when bootstrap channels are present", () => {
    const result = resolveTaskChannelInitMode({
      skipInitialTaskChannelsFetch: true,
      bootstrapTaskChannels: [
        {
          channel_id: 11,
          channels: { id: 11, name: "Website" },
        },
      ],
    })

    expect(result.mode).toBe("bootstrap")
    expect(result.channels).toHaveLength(1)
    expect(result.channels[0]?.channel_id).toBe(11)
  })

  it("falls back to query mode when bootstrap channels are missing", () => {
    const result = resolveTaskChannelInitMode({
      skipInitialTaskChannelsFetch: true,
      bootstrapTaskChannels: null,
    })

    expect(result.mode).toBe("query")
    expect(result.channels).toEqual([])
  })

  it("uses query mode when skipInitialTaskChannelsFetch is false", () => {
    const result = resolveTaskChannelInitMode({
      skipInitialTaskChannelsFetch: false,
      bootstrapTaskChannels: [
        {
          channel_id: 11,
          channels: { id: 11, name: "Website" },
        },
      ],
    })

    expect(result.mode).toBe("query")
    expect(result.channels).toEqual([])
  })
})
