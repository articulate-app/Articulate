import { describe, expect, it } from "vitest"
import {
  buildClosePublishingPaneParams,
  buildOpenPublishingPaneParams,
  isPublishingPaneOpen,
  setPublicationRunIdInParams,
} from "../app/components/tasks/publishing-pane-url"

describe("publishing-pane-url", () => {
  it("opens publishing in the right pane without using taskAiOpen as state", () => {
    const current = new URLSearchParams(
      "layout=middle,right&rightView=ai&taskAiOpen=true&centerArtifactId=art-1",
    )
    const next = buildOpenPublishingPaneParams(current, {
      artifactId: "art-1",
      publicationRunId: null,
    })
    expect(isPublishingPaneOpen(next)).toBe(true)
    expect(next.get("rightView")).toBe("browser")
    expect(next.get("centerArtifactId")).toBe("art-1")
    expect(next.get("publicationRunId")).toBeNull()
    expect(next.get("layout")?.includes("right")).toBe(true)
  })

  it("stores publicationRunId and clears it on close", () => {
    const opened = buildOpenPublishingPaneParams(new URLSearchParams("layout=left,middle"), {
      artifactId: "art-2",
    })
    const withRun = setPublicationRunIdInParams(opened, "run-123")
    expect(withRun.get("publicationRunId")).toBe("run-123")
    expect(withRun.get("rightView")).toBe("browser")

    const closed = buildClosePublishingPaneParams(withRun)
    expect(closed.get("publicationRunId")).toBeNull()
    expect(closed.get("rightView")).toBe("details")
  })

  it("treats legacy rightView=publishing as browser open", () => {
    expect(isPublishingPaneOpen(new URLSearchParams("rightView=publishing"))).toBe(true)
  })

  it("expands solo-right layout when opening browser so artifact + Live View stay visible", () => {
    const current = new URLSearchParams(
      "layout=right&rightView=ai&taskAiOpen=true&aiFocus=true&centerArtifactId=art-1",
    )
    const next = buildOpenPublishingPaneParams(current, {
      artifactId: "art-1",
      browserTabId: "pub-art-1",
      keepAiOpen: true,
    })
    expect(next.get("rightView")).toBe("browser")
    expect(next.get("layout")).toBe("middle,right")
    expect(next.get("aiFocus")).toBeNull()
    expect(next.get("taskAiOpen")).toBe("true")
    expect(next.get("browserTabId")).toBe("pub-art-1")
  })
})
