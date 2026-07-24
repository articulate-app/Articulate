/**
 * Detect legacy component-path build events that must not appear as the expected
 * result of an `artifact_build_executor` request.
 */

import { ARTIFACT_BUILD_EXECUTOR } from "../../app/lib/ai/ai-orchestrated-build-types"

const LEGACY_COMPONENT_EVENT_SUFFIXES = [
  "required_structure_prepared",
  "component_decisions",
  "component.saved",
  "component_saved",
  "repair_started",
  "repair_finished",
  "components_reordered",
] as const

export function isLegacyComponentBuildEventType(eventType: string): boolean {
  const normalized = eventType.trim().toLowerCase()
  if (!normalized) return false
  if (normalized.startsWith("artifact.")) return false
  return LEGACY_COMPONENT_EVENT_SUFFIXES.some(
    (suffix) =>
      normalized === suffix
      || normalized === `work_unit.${suffix}`
      || normalized.endsWith(`.${suffix}`)
      || normalized.includes(suffix),
  )
}

export function isArtifactBuildExecutor(executor: string | null | undefined): boolean {
  return (executor ?? "").trim() === ARTIFACT_BUILD_EXECUTOR
}

/**
 * Log a clear regression signal when an artifact-first build emits legacy
 * component structure / save events.
 */
export function logArtifactBuildLegacyComponentRegression(args: {
  buildId: string
  eventType: string
  sequence: number
  executor?: string | null
  unitId?: string | null
}): void {
  if (!isArtifactBuildExecutor(args.executor)) return
  if (!isLegacyComponentBuildEventType(args.eventType)) return
  console.error(
    `[artifact_build_executor regression] build ${args.buildId}`
    + ` received legacy component event "${args.eventType}"`
    + ` at sequence ${args.sequence}`
    + (args.unitId ? ` (unit ${args.unitId})` : "")
    + ". Artifact builds must emit artifact.* events, not component structure/save events.",
  )
}
