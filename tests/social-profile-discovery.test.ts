import { describe, expect, it } from "vitest"
import {
  discoverSocialProfilesFromHtml,
  extractSocialProfileCandidates,
  socialProfileCandidateFromUrl,
} from "../app/lib/social-profile-discovery"

describe("socialProfileCandidateFromUrl", () => {
  it("canonicalizes profile links per network", () => {
    expect(socialProfileCandidateFromUrl("https://www.linkedin.com/company/sparkfood/")).toEqual({
      network: "linkedin",
      profileUrl: "https://www.linkedin.com/company/sparkfood",
    })
    expect(socialProfileCandidateFromUrl("https://pt.linkedin.com/company/sparkfood/about")).toEqual({
      network: "linkedin",
      profileUrl: "https://www.linkedin.com/company/sparkfood",
    })
    expect(socialProfileCandidateFromUrl("https://www.instagram.com/sparkfood/?hl=pt")).toEqual({
      network: "instagram",
      profileUrl: "https://www.instagram.com/sparkfood",
    })
    expect(socialProfileCandidateFromUrl("https://twitter.com/sparkfood")).toEqual({
      network: "x",
      profileUrl: "https://x.com/sparkfood",
    })
    expect(socialProfileCandidateFromUrl("https://www.tiktok.com/@sparkfood")).toEqual({
      network: "tiktok",
      profileUrl: "https://www.tiktok.com/@sparkfood",
    })
    expect(socialProfileCandidateFromUrl("https://www.youtube.com/channel/UC123")).toEqual({
      network: "youtube",
      profileUrl: "https://www.youtube.com/channel/UC123",
    })
  })

  it("resolves a post link back to its owning profile when the handle is in the path", () => {
    expect(socialProfileCandidateFromUrl("https://www.tiktok.com/@sparkfood/video/12345")).toEqual({
      network: "tiktok",
      profileUrl: "https://www.tiktok.com/@sparkfood",
    })
  })

  it("rejects share widgets, post permalinks and utility pages", () => {
    const rejected = [
      "https://www.facebook.com/sharer/sharer.php?u=https://sparkfood.pt",
      "https://twitter.com/intent/tweet?url=https://sparkfood.pt",
      "https://www.linkedin.com/sharing/share-offsite/?url=https://sparkfood.pt",
      "https://www.instagram.com/p/Cabcdef/",
      "https://www.youtube.com/watch?v=abc123",
      "https://sparkfood.pt/about",
      "mailto:hello@sparkfood.pt",
    ]
    for (const url of rejected) {
      expect(socialProfileCandidateFromUrl(url), url).toBeNull()
    }
  })
})

describe("extractSocialProfileCandidates", () => {
  it("keeps one profile per network, preferring the most linked one", () => {
    const candidates = extractSocialProfileCandidates([
      "https://www.instagram.com/sparkfood/",
      "https://www.instagram.com/sparkfood_jobs/",
      "https://www.instagram.com/sparkfood/",
      "https://www.linkedin.com/company/sparkfood",
      "https://www.facebook.com/sharer/sharer.php?u=x",
    ])

    expect(candidates).toEqual([
      { network: "linkedin", profileUrl: "https://www.linkedin.com/company/sparkfood" },
      { network: "instagram", profileUrl: "https://www.instagram.com/sparkfood" },
    ])
  })
})

describe("discoverSocialProfilesFromHtml", () => {
  it("reads anchors and JSON-LD sameAs entries", () => {
    const html = `
      <html><body>
        <a href="/contact">Contact</a>
        <a href="https://www.linkedin.com/company/sparkfood/">LinkedIn</a>
        <a href="//www.instagram.com/sparkfood">Instagram</a>
        <script type="application/ld+json">
          {"@type":"Organization","sameAs":["https:\\/\\/www.tiktok.com\\/@sparkfood"]}
        </script>
      </body></html>
    `

    expect(discoverSocialProfilesFromHtml(html, "https://sparkfood.pt")).toEqual([
      { network: "linkedin", profileUrl: "https://www.linkedin.com/company/sparkfood" },
      { network: "instagram", profileUrl: "https://www.instagram.com/sparkfood" },
      { network: "tiktok", profileUrl: "https://www.tiktok.com/@sparkfood" },
    ])
  })
})
