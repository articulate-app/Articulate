import { describe, expect, it } from "vitest"
import {
  formatStructureActionLabel,
  reduceBuildComponentAudits,
  reduceWorkUnitComponentAudit,
} from "../features/ai-chat/orchestrated-build-audit"
import type { AiOrchestratedBuildEvent } from "../app/lib/ai/ai-orchestrated-build-types"

const UNIT_ID = "e92627a5-d0d5-49e1-b5b1-2bd940126f41"

function eventsBySequence(
  events: AiOrchestratedBuildEvent[],
): Record<number, AiOrchestratedBuildEvent> {
  const out: Record<number, AiOrchestratedBuildEvent> = {}
  for (const event of events) out[event.sequence] = event
  return out
}

describe("orchestrated build component audit", () => {
  it("reduces discovery, decisions, and repair events into an audit trail", () => {
    const events = eventsBySequence([
      {
        sequence: 1,
        event_type: "work_unit.discovery_started",
        phase: "running",
        unit_id: UNIT_ID,
        payload: {},
      },
      {
        sequence: 2,
        event_type: "work_unit.discovery_snapshot",
        phase: "running",
        unit_id: UNIT_ID,
        payload: {
          discovery_order: ["current", "library", "reusable"],
          required_components: [
            {
              title: "Title",
              source: "system",
              position: 1,
              provenance: "system_default",
            },
            {
              title: "Intro",
              source: "project",
              position: 3,
              provenance: "project_override",
            },
          ],
          current_components: [
            { title: "Intro", has_content: true, component_id: "c1" },
            { title: "FAQ", has_content: false },
          ],
          reusable_groups: [
            { label: "Blog pack", count: 2, titles: ["Hero", "CTA"] },
          ],
        },
      },
      {
        sequence: 3,
        event_type: "work_unit.component_decisions",
        phase: "running",
        unit_id: UNIT_ID,
        payload: {
          decisions: [
            {
              title: "Intro",
              source: "current",
              outcome: "reuse",
              reason: "Already matches brief",
            },
          ],
          final_structure: [
            {
              action: "replace_existing",
              title: "Intro",
              component_id: "c1",
              position: 3,
            },
            {
              action: "create_from_system",
              title: "Title",
              position: 1,
            },
            {
              action: "create_custom",
              title: "Body",
              position: 4,
            },
          ],
        },
      },
      {
        sequence: 4,
        event_type: "work_unit.repair_started",
        phase: "running",
        unit_id: UNIT_ID,
        payload: { validation_issues: ["Missing CTA"] },
      },
      {
        sequence: 5,
        event_type: "work_unit.repair_finished",
        phase: "running",
        unit_id: UNIT_ID,
        payload: { succeeded: true, remaining_issues: [] },
      },
      {
        sequence: 6,
        event_type: "work_unit.components_reordered",
        phase: "running",
        unit_id: UNIT_ID,
        payload: {
          order: [
            { title: "Title", position: 1, component_id: "t1" },
            { title: "Intro", position: 2, component_id: "c1" },
            { title: "Body", position: 3, component_id: "b1" },
          ],
        },
      },
    ])

    const audit = reduceWorkUnitComponentAudit(UNIT_ID, events)
    expect(audit.hasAnyTrace).toBe(true)
    expect(audit.discoveryStarted).toBe(true)
    expect(audit.discoveryOrder).toEqual(["current", "library", "reusable"])
    expect(audit.requiredComponents).toHaveLength(2)
    expect(audit.requiredComponents[0]?.provenance).toBe("system_default")
    expect(audit.currentComponents[0]?.hasContent).toBe(true)
    expect(audit.selectedComponents).toHaveLength(0)
    expect(audit.currentComponents).toHaveLength(2)
    expect(audit.reusableGroups[0]?.titles).toEqual(["Hero", "CTA"])
    expect(audit.decisions[0]?.reason).toContain("matches brief")
    expect(audit.finalStructure).toHaveLength(3)
    expect(audit.finalStructure[0]?.action).toBe("replace_existing")
    expect(formatStructureActionLabel("reactivate_existing")).toBe("Reused and reactivated")
    expect(formatStructureActionLabel("create_from_system")).toBe("Created")
    expect(audit.finalStructure[0]?.position).toBe(3)
    expect(audit.persistedOrder.map((row) => row.title)).toEqual([
      "Title",
      "Intro",
      "Body",
    ])
    expect(audit.repair?.succeeded).toBe(true)
    expect(audit.repair?.validationIssues).toEqual(["Missing CTA"])
  })

  it("keeps selected and inactive components in separate discovery sections", () => {
    const events = eventsBySequence([
      {
        sequence: 1,
        event_type: "work_unit.discovery_snapshot",
        phase: "running",
        unit_id: UNIT_ID,
        payload: {
          selected_components: [
            { title: "Title", has_content: true, component_id: "sel-1" },
          ],
          inactive_components: [
            { title: "Old FAQ", has_content: false, component_id: "inact-1" },
          ],
        },
      },
      {
        sequence: 2,
        event_type: "work_unit.required_structure_prepared",
        phase: "completed",
        unit_id: UNIT_ID,
        payload: {
          actions: [
            { action: "reactivate_existing", title: "Old FAQ", component_id: "inact-1" },
            { action: "create_from_system", title: "Meta description" },
          ],
        },
      },
    ])

    const audit = reduceWorkUnitComponentAudit(UNIT_ID, events)
    expect(audit.selectedComponents.map((row) => row.title)).toEqual(["Title"])
    expect(audit.inactiveComponents.map((row) => row.title)).toEqual(["Old FAQ"])
    expect(audit.inactiveComponents[0]?.title).not.toBe(audit.selectedComponents[0]?.title)
    expect(formatStructureActionLabel(audit.finalStructure[0]?.action)).toBe(
      "Reused and reactivated",
    )
    expect(formatStructureActionLabel(audit.finalStructure[1]?.action)).toBe("Created")
  })

  it("dedupes by sequence and scopes audits per unit_id", () => {
    const otherUnit = "a1111111-1111-4111-8111-111111111111"
    const events = eventsBySequence([
      {
        sequence: 1,
        event_type: "work_unit.discovery_started",
        phase: "running",
        unit_id: UNIT_ID,
        payload: {},
      },
      {
        sequence: 1,
        event_type: "work_unit.discovery_started",
        phase: "running",
        unit_id: UNIT_ID,
        payload: { note: "duplicate sequence overwrite" },
      },
      {
        sequence: 2,
        event_type: "work_unit.component_decisions",
        phase: "running",
        unit_id: otherUnit,
        payload: {
          decisions: [{ title: "Other", outcome: "create", reason: "New" }],
        },
      },
    ])

    const audits = reduceBuildComponentAudits(events)
    expect(Object.keys(audits)).toHaveLength(2)
    expect(audits[UNIT_ID]?.discoveryStarted).toBe(true)
    expect(audits[otherUnit]?.decisions).toHaveLength(1)
    expect(audits[UNIT_ID]?.decisions).toHaveLength(0)
  })
})
