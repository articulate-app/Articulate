import { describe, expect, it } from "vitest"
import {
  aggregateValidationIssues,
  dedupeWorkUnitFailures,
} from "../features/ai-chat/ai-orchestrated-build-errors"
import { isPlaceholderAiThreadTitle } from "../features/ai-chat/ai-thread-title"

describe("dedupeWorkUnitFailures", () => {
  it("collapses unit + item failures with the same logical code into one card", () => {
    const failures = dedupeWorkUnitFailures({
      buildId: "build-1",
      unitId: "unit-1",
      unitErrorCode: "provider_timeout",
      unitErrorMessage: "The AI provider timed out while working on this task.",
      itemFailures: [
        {
          title: "Introduction",
          error: "The AI provider timed out while working on this task.",
          error_code: "provider_timeout",
        },
      ],
      buildErrorMessage: "The build failed.",
    })
    expect(failures).toHaveLength(1)
    expect(failures[0].key).toBe("build-1:unit-1:provider_timeout")
    expect(failures[0].source).toBe("item")
  })

  it("prefers worker-specific item errors over generic build failure", () => {
    const failures = dedupeWorkUnitFailures({
      buildId: "build-1",
      unitId: "unit-1",
      unitErrorCode: "orchestrated_build_failed",
      unitErrorMessage: "The build failed.",
      itemFailures: [
        {
          title: "FAQ",
          error: "Component revision conflict",
          error_code: "component_revision_conflict",
        },
      ],
    })
    expect(failures).toHaveLength(1)
    expect(failures[0].code).toBe("component_revision_conflict")
    expect(failures[0].source).toBe("item")
  })

  it("uses build as unit key when unitId is missing", () => {
    const failures = dedupeWorkUnitFailures({
      buildId: "build-1",
      unitId: null,
      buildErrorCode: "build_failed",
      buildErrorMessage: "The build failed.",
    })
    expect(failures).toHaveLength(1)
    expect(failures[0].key).toBe("build-1:build:build_failed")
  })

  it("collapses repair + unit + build failures with the same logical code", () => {
    const failures = dedupeWorkUnitFailures({
      buildId: "build-1",
      unitId: "unit-1",
      repairErrorCode: "structure_validation_failed",
      repairErrorMessage: "Structure validation failed",
      unitErrorCode: "structure_validation_failed",
      unitErrorMessage: "Structure validation failed",
      buildErrorCode: "orchestrated_build_failed",
      buildErrorMessage: "The build failed.",
    })
    expect(failures).toHaveLength(1)
    expect(failures[0].key).toBe("build-1:unit-1:structure_validation_failed")
    expect(failures[0].source).toBe("repair")
  })
})

describe("aggregateValidationIssues", () => {
  it("aggregates issue codes with exact counts and named components", () => {
    const issues = [
      { code: "required_component_omitted", component_title: "Intro" },
      { code: "required_component_omitted", component_title: "FAQ" },
      { code: "required_component_omitted", component_title: "CTA" },
      { code: "required_component_omitted", component_title: "Body" },
      { code: "required_component_omitted", component_title: "Title" },
      { code: "required_component_omitted", component_title: "Meta" },
      { code: "already_inactive_redundant_deactivation", component_title: "Old hero" },
    ]
    const groups = aggregateValidationIssues(issues)
    const omitted = groups.find((row) => row.code === "required_component_omitted")
    expect(omitted?.count).toBe(6)
    expect(omitted?.message).toBe("6 required components were omitted")
    expect(omitted?.componentTitles).toHaveLength(6)
    const redundant = groups.find((row) => row.code === "already_inactive_redundant_deactivation")
    expect(redundant?.message).toBe(
      "1 already-inactive component was redundantly marked for deactivation",
    )
  })
})

describe("isPlaceholderAiThreadTitle", () => {
  it("treats empty and New chat as placeholders", () => {
    expect(isPlaceholderAiThreadTitle(null)).toBe(true)
    expect(isPlaceholderAiThreadTitle("")).toBe(true)
    expect(isPlaceholderAiThreadTitle("New chat")).toBe(true)
    expect(isPlaceholderAiThreadTitle("Creating chat...")).toBe(true)
    expect(isPlaceholderAiThreadTitle("Sparkfood ideas")).toBe(false)
  })
})
