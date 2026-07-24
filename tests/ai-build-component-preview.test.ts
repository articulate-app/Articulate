import { beforeEach, describe, expect, it } from "vitest"
import {
  buildComponentPreviewKey,
  useAiBuildComponentPreviewStore,
} from "../app/store/ai-build-component-preview-store"
import {
  loadPersistedBuildAfterSequence,
  persistBuildAfterSequence,
  clearPersistedBuildAfterSequence,
} from "../features/ai-chat/orchestrated-build-sequence-persist"

describe("ai-build-component-preview-store", () => {
  beforeEach(() => {
    useAiBuildComponentPreviewStore.setState({ previews: {} })
  })

  it("keys by build + unit + component and ignores older sequences", () => {
    const store = useAiBuildComponentPreviewStore.getState()
    const key = store.upsertPreview({
      buildId: "build-1",
      unitId: "unit-1",
      componentId: "comp-1",
      sequence: 4,
      title: "Intro",
      contentText: "First draft",
      taskId: 10,
      channelId: 2,
    })
    expect(key).toBe(buildComponentPreviewKey("build-1", "unit-1", "comp-1"))

    store.upsertPreview({
      buildId: "build-1",
      unitId: "unit-1",
      componentId: "comp-1",
      sequence: 3,
      contentText: "Stale",
    })
    expect(store.getPreview(key)?.contentText).toBe("First draft")

    store.upsertPreview({
      buildId: "build-1",
      unitId: "unit-1",
      componentId: "comp-1",
      sequence: 5,
      contentText: "Updated draft",
    })
    expect(store.getPreview(key)?.contentText).toBe("Updated draft")
    expect(store.getPreview(key)?.phase).toBe("preview")
  })

  it("replaces the live preview in place on component.saved", () => {
    const store = useAiBuildComponentPreviewStore.getState()
    const key = store.upsertPreview({
      buildId: "build-1",
      unitId: "unit-1",
      componentId: "comp-1",
      sequence: 4,
      contentText: "Draft",
    })
    store.markSaved({
      buildId: "build-1",
      unitId: "unit-1",
      componentId: "comp-1",
      sequence: 6,
      contentText: "Saved body",
    })
    expect(store.getPreview(key)?.phase).toBe("saved")
    expect(store.getPreview(key)?.contentText).toBe("Saved body")
  })
})

describe("orchestrated-build-sequence-persist", () => {
  beforeEach(() => {
    clearPersistedBuildAfterSequence("build-persist-1")
  })

  it("persists and loads after_sequence per build", () => {
    persistBuildAfterSequence("build-persist-1", 12)
    expect(loadPersistedBuildAfterSequence("build-persist-1")).toBe(12)
    persistBuildAfterSequence("build-persist-1", 15)
    expect(loadPersistedBuildAfterSequence("build-persist-1")).toBe(15)
  })
})
