import { describe, expect, it } from "vitest"
import {
  buildCompetitorSocialEntity,
  buildOwnedSocialEntity,
  computePublicInteractions,
  competitorEntityId,
  ownedEntityId,
  parseSocialEntityId,
} from "../app/lib/project-social"

describe("project-social owned identity", () => {
  it("builds owned entity from the project, never from competitors", () => {
    const owned = buildOwnedSocialEntity({
      projectId: 42,
      projectName: "JCDecaux",
    })
    expect(owned).toEqual({
      id: "owned:42",
      name: "JCDecaux",
      entityType: "owned",
      isOwned: true,
    })
    expect(owned.id).not.toContain("competitor")
  })

  it("falls back to Our brand when project name is blank", () => {
    expect(
      buildOwnedSocialEntity({ projectId: 7, projectName: "  " }).name,
    ).toBe("Our brand")
  })

  it("keeps competitor entities separate and never owned", () => {
    const competitor = buildCompetitorSocialEntity({
      competitorId: 9,
      name: "MOP",
    })
    expect(competitor).toEqual({
      id: "competitor:9",
      name: "MOP",
      entityType: "competitor",
      isOwned: false,
    })
    expect(competitor.id).not.toEqual(ownedEntityId(9))
  })

  it("parses entity ids without inventing ownership", () => {
    expect(parseSocialEntityId(ownedEntityId(3))).toEqual({
      entityType: "owned",
      projectId: 3,
    })
    expect(parseSocialEntityId(competitorEntityId(11))).toEqual({
      entityType: "competitor",
      competitorId: 11,
    })
    expect(parseSocialEntityId("random")).toBeNull()
  })
})

describe("computePublicInteractions", () => {
  it("sums reactions + comments + shares and ignores nulls", () => {
    expect(
      computePublicInteractions({
        reactionsCount: 10,
        commentsCount: 2,
        sharesCount: 1,
      }),
    ).toBe(13)

    expect(
      computePublicInteractions({
        reactionsCount: 10,
        commentsCount: null,
        sharesCount: 1,
      }),
    ).toBe(11)

    expect(
      computePublicInteractions({
        reactionsCount: null,
        commentsCount: null,
        sharesCount: null,
      }),
    ).toBeNull()
  })
})
