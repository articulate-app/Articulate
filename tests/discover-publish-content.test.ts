import { describe, expect, it } from "vitest"
import { discoverPublishContentFromMessageContentJson } from "../features/ai-chat/discover-publish-content"

describe("discoverPublishContentFromMessageContentJson", () => {
  it("reads publishing preview fields from persisted data_summary", () => {
    const found = discoverPublishContentFromMessageContentJson({
      tool_results: [
        {
          ok: true,
          name: "configure_publishing_destination",
          error: null,
          data_summary: {
            destination_id: "1f88526b-814f-416f-916f-3e47e8a28b4e",
            destination_name: "Dimas Lovable",
            status: "connecting",
            live_view_url: "https://live.browser-use.com/?wss=example",
            connect_run_id: "run-123",
            show_browser_preview: true,
            needs_authentication: true,
          },
        },
      ],
    })
    expect(found).toHaveLength(1)
    expect(found[0]?.destinationId).toBe("1f88526b-814f-416f-916f-3e47e8a28b4e")
    expect(found[0]?.liveViewUrl).toContain("live.browser-use.com")
    expect(found[0]?.showBrowserPreview).toBe(true)
    expect(found[0]?.publicationRunId).toContain("connect:")
  })
})
