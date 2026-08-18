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
      token: "jwt",
      websocketUrl: "ws://localhost:1234",
    })
    const second = acquireArtifactCollabSession({
      artifactId: "2f1c6b7a-3c4d-4e5f-a678-90abcedf1234",
      token: "jwt",
      websocketUrl: "ws://localhost:1234",
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

    acquireArtifactCollabSession({
      artifactId,
      token: "jwt",
      websocketUrl: "ws://localhost:1234",
      createProvider,
    })
    acquireArtifactCollabSession({
      artifactId,
      token: "jwt",
      websocketUrl: "ws://localhost:1234",
      createProvider,
    })

    expect(created).toHaveLength(1)
    expect(releaseArtifactCollabSession(artifactId)).toBe(false)
    expect(peekArtifactCollabSession(artifactId)?.refs).toBe(1)
    expect(destroyed).toHaveLength(0)
    expect(releaseArtifactCollabSession(artifactId)).toBe(true)
    expect(peekArtifactCollabSession(artifactId)).toBeNull()
    expect(destroyed).toHaveLength(1)
  })
})

describe("artifact collaboration feature gate", () => {
  it("keeps the snapshot editor unless a rich-text artifact is explicitly enabled", () => {
    expect(shouldUseArtifactCollaboration({ artifactType: "document" })).toBe(false)
    expect(shouldUseArtifactCollaboration({
      artifactType: "document",
      collabEnabled: true,
    })).toBe(true)
    expect(shouldUseArtifactCollaboration({
      artifactType: "image",
      collabEnabled: true,
    })).toBe(false)
    expect(shouldUseArtifactCollaboration({
      artifactType: "document",
      contentFormat: "html_email",
      envEnabled: true,
    })).toBe(false)
  })
})
