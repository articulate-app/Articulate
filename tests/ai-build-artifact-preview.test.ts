import { beforeEach, describe, expect, it } from "vitest"
import {
  buildArtifactPreviewKey,
  isArtifactBuildEventType,
  parseBuildArtifactPreviewPayload,
  phaseForArtifactEventType,
  useAiBuildArtifactPreviewStore,
} from "../app/store/ai-build-artifact-preview-store"
import {
  collectAttachmentIdsFromArtifact,
  extractArtifactBlocks,
} from "../app/lib/artifacts/artifact-types"
import { selectedContextTypeForArtifactAnchor } from "../features/artifacts/artifact-selection"

describe("artifact preview store", () => {
  beforeEach(() => {
    useAiBuildArtifactPreviewStore.setState({ previews: {}, suppressedArtifactIds: {} })
  })

  it("keys previews by build_id + unit_id + artifact_id", () => {
    expect(buildArtifactPreviewKey("b1", "u1", "a1")).toBe("b1:u1:a1")
  })

  it("recognizes artifact.* durable event types", () => {
    expect(isArtifactBuildEventType("artifact.preview")).toBe(true)
    expect(isArtifactBuildEventType("artifact.media_item_saved")).toBe(true)
    expect(isArtifactBuildEventType("artifact.version_saved")).toBe(true)
    expect(isArtifactBuildEventType("artifact.context_loaded")).toBe(true)
    expect(isArtifactBuildEventType("artifact.structure_decided")).toBe(true)
    expect(isArtifactBuildEventType("component.saved")).toBe(false)
  })

  it("parses full preview payloads including content_json and asset_data", () => {
    const parsed = parseBuildArtifactPreviewPayload({
      artifact_id: "11111111-1111-4111-8111-111111111111",
      title: "Campaign brief",
      content_text: "Hello",
      before_content_text: "Old hello",
      before_content_json: {
        blocks: [{ id: "body", type: "rich_text", html: "<p>Old hello</p>" }],
      },
      content_json: {
        blocks: [
          { id: "h1", type: "heading", text: "Hello", level: 1 },
          { id: "img", type: "image", attachment_id: "22222222-2222-4222-8222-222222222222" },
        ],
      },
      asset_data: {
        assets: [{ attachment_id: "22222222-2222-4222-8222-222222222222", media_type: "image" }],
      },
      current_version: 2,
    })
    expect(parsed.artifactId).toBe("11111111-1111-4111-8111-111111111111")
    expect(parsed.title).toBe("Campaign brief")
    expect(parsed.contentText).toBe("Hello")
    expect(parsed.beforeContentText).toBe("Old hello")
    expect(extractArtifactBlocks(parsed.beforeContentJson)).toHaveLength(1)
    expect(extractArtifactBlocks(parsed.contentJson)).toHaveLength(2)
    expect(parsed.assetData?.assets?.[0]?.attachment_id).toBe("22222222-2222-4222-8222-222222222222")
    expect(parsed.currentVersion).toBe(2)
  })

  it("keeps beforeContentJson from version_saved across later events", () => {
    const store = useAiBuildArtifactPreviewStore.getState()
    store.upsertFromEvent({
      buildId: "b1",
      unitId: "u1",
      artifactId: "a1",
      sequence: 1,
      eventType: "artifact.started",
      beforeContentText: "Before body",
      title: "Article",
    })
    store.upsertFromEvent({
      buildId: "b1",
      unitId: "u1",
      artifactId: "a1",
      sequence: 2,
      eventType: "artifact.version_saved",
      beforeContentText: "Before body",
      beforeContentJson: {
        blocks: [{ id: "body", type: "rich_text", html: "<h2>Keep</h2><p>Before body</p>" }],
      },
      contentText: "After body",
      contentJson: {
        blocks: [{ id: "body", type: "rich_text", html: "<h2>Keep</h2><p>After body</p>" }],
      },
      currentVersion: 3,
    })
    const entry = Object.values(useAiBuildArtifactPreviewStore.getState().previews)[0]
    expect(entry.phase).toBe("saved")
    expect(entry.beforeContentJson?.blocks?.[0]).toMatchObject({
      html: "<h2>Keep</h2><p>Before body</p>",
    })
  })

  it("keeps beforeContentText across streaming preview updates", () => {
    const store = useAiBuildArtifactPreviewStore.getState()
    store.upsertFromEvent({
      buildId: "b1",
      unitId: "u1",
      artifactId: "a1",
      sequence: 1,
      eventType: "artifact.started",
      contentText: "Before body",
      beforeContentText: "Before body",
      contentJson: {
        blocks: [{ id: "body", type: "rich_text", html: "<p>Before body</p>" }],
      },
      title: "Article",
    })
    store.upsertFromEvent({
      buildId: "b1",
      unitId: "u1",
      artifactId: "a1",
      sequence: 2,
      eventType: "artifact.preview",
      contentText: "After body streaming",
      diffContentText: "After body streaming",
      contentJson: {
        blocks: [{ id: "body", type: "rich_text", html: "<p>After body streaming</p>" }],
      },
    })
    const entry = Object.values(useAiBuildArtifactPreviewStore.getState().previews)[0]
    expect(entry.beforeContentText).toBe("Before body")
    expect(entry.beforeContentJson?.blocks?.[0]).toMatchObject({ html: "<p>Before body</p>" })
    expect(entry.contentText).toBe("After body streaming")
    expect(entry.diffContentText).toBe("After body streaming")
    expect(entry.phase).toBe("preview")
  })

  it("updates the card in place and ignores older sequences", () => {
    const store = useAiBuildArtifactPreviewStore.getState()
    store.upsertFromEvent({
      buildId: "b1",
      unitId: "u1",
      artifactId: "a1",
      sequence: 2,
      eventType: "artifact.preview",
      contentText: "second",
      title: "V2",
    })
    store.upsertFromEvent({
      buildId: "b1",
      unitId: "u1",
      artifactId: "a1",
      sequence: 1,
      eventType: "artifact.preview",
      contentText: "first",
      title: "V1",
    })
    store.upsertFromEvent({
      buildId: "b1",
      unitId: "u1",
      artifactId: "a1",
      sequence: 3,
      eventType: "artifact.version_saved",
      contentText: "final",
      currentVersion: 4,
    })
    const entry = store.getPreview(buildArtifactPreviewKey("b1", "u1", "a1"))
    expect(entry?.contentText).toBe("final")
    expect(entry?.title).toBe("V2")
    expect(entry?.phase).toBe("saved")
    expect(entry?.currentVersion).toBe(4)
    expect(phaseForArtifactEventType("artifact.media_progress")).toBe("media")
  })

  it("does not resurrect a suppressed artifact from later build events", () => {
    const store = useAiBuildArtifactPreviewStore.getState()
    store.upsertFromEvent({
      buildId: "b1",
      unitId: "u1",
      artifactId: "deleted-1",
      sequence: 1,
      eventType: "artifact.version_saved",
      taskId: 13627,
      title: "Gone",
    })
    expect(store.listLiveByArtifactId("deleted-1")?.title).toBe("Gone")

    store.suppressArtifact("deleted-1")
    expect(store.listLiveByArtifactId("deleted-1")).toBeNull()
    expect(store.isArtifactSuppressed("deleted-1")).toBe(true)

    store.upsertFromEvent({
      buildId: "b1",
      unitId: "u1",
      artifactId: "deleted-1",
      sequence: 2,
      eventType: "artifact.version_saved",
      taskId: 13627,
      title: "Resurrected",
    })
    expect(store.listLiveByArtifactId("deleted-1")).toBeNull()
    expect(Object.values(useAiBuildArtifactPreviewStore.getState().previews)).toHaveLength(0)
  })
})

describe("artifact helpers", () => {
  it("collects attachment ids from blocks and asset_data without assuming one file", () => {
    const ids = collectAttachmentIdsFromArtifact({
      content_json: {
        blocks: [
          { type: "paragraph", text: "intro" },
          { type: "image", attachment_id: "img-1" },
          { type: "video", attachment_id: "vid-1" },
          { type: "file", attachment_id: "file-1" },
        ],
      },
      asset_data: {
        assets: [
          { attachment_id: "img-1", media_type: "image" },
          { attachment_id: "gallery-2", media_type: "image" },
        ],
      },
    })
    expect(ids.sort()).toEqual(["file-1", "gallery-2", "img-1", "vid-1"])
  })

  it("maps selection anchors to selected_context_type values", () => {
    expect(selectedContextTypeForArtifactAnchor("text_range")).toBe("artifact_text_selection")
    expect(selectedContextTypeForArtifactAnchor("image_rect")).toBe("artifact_image_rect")
    expect(selectedContextTypeForArtifactAnchor("video_region")).toBe("artifact_video_region")
    expect(selectedContextTypeForArtifactAnchor("document")).toBe("artifact_document")
  })
})
