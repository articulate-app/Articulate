import { describe, expect, it } from "vitest"
import {
  findExistingDestinationCandidate,
  inferDestinationDisplayName,
  normalizeDestinationStartUrl,
} from "../supabase/functions/_shared/publishing/destination-configure"

describe("destination configure helpers", () => {
  it("normalizes bare hosts to https with trailing slash", () => {
    expect(normalizeDestinationStartUrl("account.squarespace.com")).toBe(
      "https://account.squarespace.com/",
    )
    expect(normalizeDestinationStartUrl("https://account.squarespace.com")).toBe(
      "https://account.squarespace.com/",
    )
  })

  it("infers Articulate Squarespace display name", () => {
    expect(
      inferDestinationDisplayName({
        projectName: "Articulate",
        serviceOrPlatform: "Squarespace",
        startUrl: "account.squarespace.com",
      }),
    ).toBe("Articulate Squarespace")
  })

  it("reuses existing destination by host + project", () => {
    const match = findExistingDestinationCandidate(
      [
        {
          id: "a",
          name: "Articulate Squarespace",
          start_url: "https://account.squarespace.com/",
          project_id: 111,
        },
        {
          id: "b",
          name: "Other",
          start_url: "https://example.com/",
          project_id: 111,
        },
      ],
      {
        projectId: 111,
        startUrl: "account.squarespace.com",
        serviceOrPlatform: "Squarespace",
      },
    )
    expect(match?.id).toBe("a")
  })
})
