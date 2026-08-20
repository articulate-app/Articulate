import { describe, expect, it } from "vitest"
import {
  buildTemplateWorkspaceId,
  parseTemplateWorkspaceId,
} from "../app/lib/template-selection-url"
import { buildLinkDesignTemplate } from "../app/lib/project-brand-kit"

describe("template-selection-url", () => {
  it("keeps project-owned template ids", () => {
    expect(buildTemplateWorkspaceId(42, "tpl-1")).toBe("42:tpl-1")
    expect(parseTemplateWorkspaceId("42:tpl-1")).toEqual({
      projectId: 42,
      templateId: "tpl-1",
    })
  })

  it("uses a personal prefix when there is no project yet", () => {
    expect(buildTemplateWorkspaceId(null, "abc")).toBe("u:abc")
    expect(parseTemplateWorkspaceId("u:abc")).toEqual({
      projectId: null,
      templateId: "abc",
    })
    expect(parseTemplateWorkspaceId("0:abc")).toBeNull()
  })
})

describe("buildLinkDesignTemplate", () => {
  it("stores a URL as a link asset", () => {
    const template = buildLinkDesignTemplate({
      url: "https://example.com/layout",
      title: "Homepage",
    })
    expect(template.title).toBe("Homepage")
    expect(template.assets[0]?.media_type).toBe("url")
    expect(template.assets[0]?.url).toBe("https://example.com/layout")
  })
})
