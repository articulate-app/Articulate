import { afterEach, describe, expect, it, vi } from "vitest"
import {
  isArtifactBuildExecutor,
  isLegacyComponentBuildEventType,
  logArtifactBuildLegacyComponentRegression,
} from "../features/ai-chat/artifact-build-legacy-guard"
import {
  isArtifactCardContentEventType,
} from "../app/store/ai-build-artifact-preview-store"
import { useAiOrchestratedBuildStore } from "../app/store/ai-orchestrated-build-store"

describe("artifact build legacy guard", () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it("recognizes artifact_build_executor", () => {
    expect(isArtifactBuildExecutor("artifact_build_executor")).toBe(true)
    expect(isArtifactBuildExecutor("component_patch_executor")).toBe(false)
  })

  it("flags legacy component events", () => {
    expect(isLegacyComponentBuildEventType("work_unit.required_structure_prepared")).toBe(true)
    expect(isLegacyComponentBuildEventType("work_unit.component_decisions")).toBe(true)
    expect(isLegacyComponentBuildEventType("component.saved")).toBe(true)
    expect(isLegacyComponentBuildEventType("work_unit.repair_started")).toBe(true)
    expect(isLegacyComponentBuildEventType("artifact.preview")).toBe(false)
    expect(isLegacyComponentBuildEventType("artifact.plan_ready")).toBe(false)
  })

  it("logs clearly when artifact_build_executor emits legacy component events", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {})
    logArtifactBuildLegacyComponentRegression({
      buildId: "b1",
      eventType: "work_unit.component_decisions",
      sequence: 4,
      executor: "artifact_build_executor",
      unitId: "u1",
    })
    expect(spy).toHaveBeenCalledOnce()
    expect(String(spy.mock.calls[0]?.[0])).toContain("artifact_build_executor regression")
    expect(String(spy.mock.calls[0]?.[0])).toContain("work_unit.component_decisions")
  })

  it("does not log for non-artifact executors", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {})
    logArtifactBuildLegacyComponentRegression({
      buildId: "b1",
      eventType: "component.saved",
      sequence: 4,
      executor: "component_patch_executor",
    })
    expect(spy).not.toHaveBeenCalled()
  })
})

describe("artifact card content events", () => {
  it("reserves cards for preview / version_saved / media / failed only", () => {
    expect(isArtifactCardContentEventType("artifact.preview")).toBe(true)
    expect(isArtifactCardContentEventType("artifact.version_saved")).toBe(true)
    expect(isArtifactCardContentEventType("artifact.media_progress")).toBe(true)
    expect(isArtifactCardContentEventType("artifact.failed")).toBe(true)
    expect(isArtifactCardContentEventType("artifact.plan_ready")).toBe(false)
    expect(isArtifactCardContentEventType("artifact.started")).toBe(false)
    expect(isArtifactCardContentEventType("artifact.context_loaded")).toBe(false)
    expect(isArtifactCardContentEventType("artifact.structure_decided")).toBe(false)
  })
})

describe("orchestrated build thread independence", () => {
  it("keeps active builds when clearing inactive builds for another thread", () => {
    useAiOrchestratedBuildStore.setState({ builds: {} })
    const store = useAiOrchestratedBuildStore.getState()
    store.registerBuild({
      buildId: "11111111-1111-4111-8111-111111111111",
      threadId: "thread-a",
      assistantMessageId: "msg-a",
    })
    store.registerBuild({
      buildId: "22222222-2222-4222-8222-222222222222",
      threadId: "thread-b",
      assistantMessageId: "msg-b",
    })
    store.applySnapshot({
      buildId: "11111111-1111-4111-8111-111111111111",
      snapshot: {
        ok: true,
        build: {
          id: "11111111-1111-4111-8111-111111111111",
          status: "running",
          total_units: 1,
          queued_units: 0,
          running_units: 1,
          succeeded_units: 0,
          failed_units: 0,
          last_event_sequence: 1,
        },
        units: [],
        events: [],
        next_sequence: 1,
      },
    })
    store.applySnapshot({
      buildId: "22222222-2222-4222-8222-222222222222",
      snapshot: {
        ok: true,
        build: {
          id: "22222222-2222-4222-8222-222222222222",
          status: "completed",
          total_units: 1,
          queued_units: 0,
          running_units: 0,
          succeeded_units: 1,
          failed_units: 0,
          last_event_sequence: 2,
        },
        units: [],
        events: [],
        next_sequence: 2,
      },
    })

    useAiOrchestratedBuildStore.getState().clearInactiveBuildsExceptThread("thread-b")
    const builds = useAiOrchestratedBuildStore.getState().builds
    // Active build from thread-a is preserved; completed build from thread-b kept as current thread.
    expect(builds["11111111-1111-4111-8111-111111111111"]).toBeTruthy()
    expect(builds["22222222-2222-4222-8222-222222222222"]).toBeTruthy()

    useAiOrchestratedBuildStore.getState().clearInactiveBuildsExceptThread("thread-a")
    const after = useAiOrchestratedBuildStore.getState().builds
    // Completed build from thread-b dropped; active from thread-a kept.
    expect(after["11111111-1111-4111-8111-111111111111"]).toBeTruthy()
    expect(after["22222222-2222-4222-8222-222222222222"]).toBeUndefined()
  })
})
