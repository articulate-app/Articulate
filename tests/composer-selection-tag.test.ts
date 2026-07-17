import { describe, expect, it } from "vitest"
import {
  buildComposerSelectionTag,
  buildComposerSelectionTags,
} from "../features/ai-chat/composer-selection-tag"

describe("buildComposerSelectionTag", () => {
  it("does not auto-create task selection tag for generic task context", () => {
    const tag = buildComposerSelectionTag({
      fieldType: "task",
      label: "Task",
      entityId: null,
      componentId: null,
      instructions: null,
    })
    expect(tag).toBeNull()
  })

  it("creates selection tag when an explicit binding is provided", () => {
    const tag = buildComposerSelectionTag({
      fieldType: "project",
      label: "Project",
      entityId: 42,
      componentId: null,
      instructions: null,
    })
    expect(tag).toMatchObject({
      type: "project",
      id: 42,
      label: "Project",
      source: "selection",
    })
  })

  it("creates task_component selection tag when component output context includes ids", () => {
    const tag = buildComposerSelectionTag({
      fieldType: "component_output",
      label: "Component output · O que é?",
      selectedContextType: "component_output",
      taskId: 13131,
      channelId: 11,
      taskComponentId: "comp-uuid",
      componentId: "comp-uuid",
      componentTitle: "O que é?",
      taskTitle: "Flexible materials",
      channelName: "Blog",
      componentSelectionSource: "explicit_click",
    })
    expect(tag).toMatchObject({
      type: "task_component",
      id: "comp-uuid",
      source: "selection",
      taskId: 13131,
      channelId: 11,
      componentId: "comp-uuid",
      componentTitle: "O que é?",
      taskTitle: "Flexible materials",
      channelName: "Blog",
    })
  })

  it("does not create task_component tag for ambient component output context", () => {
    const tag = buildComposerSelectionTag({
      fieldType: "component_output",
      label: "Component output · Vantagens",
      selectedContextType: "component_output",
      taskId: 13131,
      channelId: 11,
      taskComponentId: "comp-uuid",
      componentId: "comp-uuid",
      componentTitle: "Vantagens",
    })
    expect(tag).toBeNull()
  })

  it("buildComposerSelectionTags emits separate task, channel, and component chips", () => {
    const tags = buildComposerSelectionTags({
      fieldType: "component_output",
      label: "Component output · Pros and limitations of rubber",
      selectedContextType: "component_output",
      taskId: 13423,
      channelId: 11,
      taskComponentId: "635c0ae7-9d47-432c-8768-8f30d415376a",
      componentId: "635c0ae7-9d47-432c-8768-8f30d415376a",
      componentTitle: "Pros and limitations of rubber",
      taskTitle: "Rubber alternatives: where cork composites replace synthetic elastomers",
      channelName: "Blog",
      componentSelectionSource: "explicit_click",
    })
    expect(tags).toHaveLength(3)
    expect(tags[0]).toMatchObject({ type: "task", id: 13423, source: "selection" })
    expect(tags[1]).toMatchObject({ type: "channel", id: 11, channelId: 11, source: "selection" })
    expect(tags[2]).toMatchObject({
      type: "task_component",
      id: "635c0ae7-9d47-432c-8768-8f30d415376a",
      source: "selection",
    })
  })
})
