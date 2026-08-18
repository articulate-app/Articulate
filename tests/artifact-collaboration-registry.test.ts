import { afterEach, describe, expect, it } from "vitest"
import { shouldUseArtifactCollaboration } from "../app/lib/collaboration/feature-flag"
import {
  acquireArtifactCollabSession,
  peekArtifactCollabSession,
  releaseArtifactCollabSession,
  resetArtifactCollabRegistryForTests,
} from "../app/lib/collaboration/provider-registry"

describe("artifact collaboration provider registry", () => {
  afterEach(() => {
    resetArtifactCollabRegistryForTests()
  })

  it("reuses one Y.Doc when two views mount the same artifact", () => {
    const first = acquireArtifactCollabSession({
      artifactId: "2f1c6b7a-3c4d-4e5f-a678-90abcedf1234",
    })
    const second = acquireArtifactCollabSession({
      artifactId: "2f1c6b7a-3c4d-4e5f-a678-90abcedf1234",
    })

    expect(second.document).toBe(first.document)
    expect(second.provider).toBe(first.provider)
    expect(peekArtifactCollabSession(first.artifactId)?.refs).toBe(2)
  })

  it("does not destroy the session when only one of two views unmounts", () => {
    const artifactId = "2f1c6b7a-3c4d-4e5f-a678-90abcedf1234"
    const created: string[] = []
    const destroyed: string[] = []
    const createProvider = () => {
      created.push("provider")
      return {
        destroy: () => {
          destroyed.push("provider")
        },
      }
    }

    acquireArtifactCollabSession({ artifactId, createProvider })
    acquireArtifactCollabSession({ artifactId, createProvider })

    expect(created).toHaveLength(1)
    expect(releaseArtifactCollabSession(artifactId)).toBe(false)
    expect(peekArtifactCollabSession(artifactId)?.refs).toBe(1)
    expect(destroyed).toHaveLength(0)
    firstViewStillWorks(artifactId)
    expect(releaseArtifactCollabSession(artifactId)).toBe(true)
    expect(peekArtifactCollabSession(artifactId)).toBeNull()
    expect(destroyed).toHaveLength(1)
  })
})

function firstViewStillWorks(artifactId: string) {
  const session = peekArtifactCollabSession(artifactId)
  expect(session).not.toBeNull()
  session?.document.getText("shared").insert(0, "still-alive")
  expect(session?.document.getText("shared").toString()).toBe("still-alive")
}

describe("artifact collaboration feature gate", () => {
  it("keeps the snapshot editor unless a TipTap-compatible editor is explicitly enabled", () => {
    expect(shouldUseArtifactCollaboration({})).toBe(false)
    expect(shouldUseArtifactCollaboration({
      collabEnabled: true,
    })).toBe(true)
    expect(shouldUseArtifactCollaboration({
      contentJson: { blocks: [{ type: "image" }] },
      collabEnabled: true,
    })).toBe(false)
    expect(shouldUseArtifactCollaboration({
      contentFormat: "html_email",
      envEnabled: true,
    })).toBe(false)
    expect(shouldUseArtifactCollaboration({
      metadata: { editor_kind: "rich_text" },
      envEnabled: true,
    })).toBe(true)
  })
})
