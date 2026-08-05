import { describe, expect, it } from "vitest"
import {
  buildPostDedupeKey,
  extractFacebookUsername,
  isCompetitorSocialNetwork,
  normalizeHttpUrl,
  normalizeProfileUrl,
} from "../app/lib/competitor-social"

describe("competitor-social helpers", () => {
  it("recognizes supported networks", () => {
    expect(isCompetitorSocialNetwork("linkedin")).toBe(true)
    expect(isCompetitorSocialNetwork("x")).toBe(true)
    expect(isCompetitorSocialNetwork("myspace")).toBe(false)
  })

  it("normalizes URLs and strips tracking params", () => {
    expect(
      normalizeHttpUrl(
        "https://www.linkedin.com/in/example/?utm_source=share&trk=public_profile",
      ),
    ).toBe("https://linkedin.com/in/example")
  })

  it("normalizes LinkedIn person and company profile URLs", () => {
    expect(
      normalizeProfileUrl("linkedin", "linkedin.com/in/satyanadella/"),
    ).toBe("https://www.linkedin.com/in/satyanadella")
    expect(
      normalizeProfileUrl("linkedin", "https://www.linkedin.com/company/microsoft"),
    ).toBe("https://www.linkedin.com/company/microsoft")
    expect(normalizeProfileUrl("linkedin", "https://example.com/in/x")).toBeNull()
  })

  it("normalizes X and Instagram profile URLs", () => {
    expect(normalizeProfileUrl("x", "https://twitter.com/elonmusk")).toBe(
      "https://x.com/elonmusk",
    )
    expect(normalizeProfileUrl("instagram", "https://www.instagram.com/nasa/")).toBe(
      "https://www.instagram.com/nasa",
    )
  })

  it("builds stable post dedupe keys", () => {
    expect(
      buildPostDedupeKey({
        externalPostId: "7483357365145165824",
        postUrl: "https://www.linkedin.com/posts/example",
      }),
    ).toBe("id:7483357365145165824")

    expect(
      buildPostDedupeKey({
        externalPostId: null,
        postUrl: "https://www.linkedin.com/posts/example/?utm_source=share",
      }),
    ).toBe("url:https://linkedin.com/posts/example")
  })

  it("extracts Facebook page usernames from profile URLs", () => {
    expect(extractFacebookUsername("https://www.facebook.com/NASA")).toBe("NASA")
    expect(extractFacebookUsername("https://www.facebook.com/profile.php?id=123")).toBe(
      "123",
    )
  })
})

describe("linkedin post normalization (fixture)", () => {
  it("maps Bright Data LinkedIn discover fields into the internal shape", () => {
    const raw = {
      url: "https://www.linkedin.com/posts/example_activity-7483357365145165824-Fjeg",
      id: "7483357365145165824",
      post_text: "Hello world",
      date_posted: "2026-03-17T10:30:06.724Z",
      images: ["https://cdn.example.com/img.jpg"],
      num_likes: 12,
      num_comments: 3,
      num_shares: 1,
      user_followers: 412,
      post_type: "original",
      headline: "Example Co",
    }

    const externalPostId =
      typeof raw.id === "string" || typeof raw.id === "number"
        ? String(raw.id)
        : null
    const dedupe = buildPostDedupeKey({
      externalPostId,
      postUrl: raw.url,
    })

    expect(externalPostId).toBe("7483357365145165824")
    expect(dedupe).toBe("id:7483357365145165824")
    expect(raw.num_likes).toBe(12)
    expect(raw.images[0]).toContain("cdn.example.com")
  })
})
