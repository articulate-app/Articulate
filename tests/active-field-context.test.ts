import { describe, expect, it } from "vitest"
import {
  buildComponentOutputActiveFieldContext,
  buildComponentOutputAiChatPayload,
  buildAiChatSelectionPayload,
  resolveComponentOutputSelectionDiagnostics,
} from "../features/ai-chat/active-field-context"
import { resolveAiChatOutboundContext } from "../features/ai-chat/ai-target-context"

describe("buildComponentOutputActiveFieldContext", () => {
  it("stores structured ids for component output selection", () => {
    const ctx = buildComponentOutputActiveFieldContext({
      taskId: 13131,
      channelId: 11,
      taskComponentId: "comp-uuid",
      taskComponentOutputId: "output-uuid",
      componentTitle: "O que é?",
      entityId: 99,
      instructions: "Write clearly",
      selectionSource: "explicit_click",
    })

    expect(ctx).toMatchObject({
      fieldType: "component_output",
      label: "Component output · O que é?",
      selectedContextType: "component_output",
      taskId: 13131,
      channelId: 11,
      taskComponentId: "comp-uuid",
      componentId: "comp-uuid",
      taskComponentOutputId: "output-uuid",
      componentTitle: "O que é?",
      componentSelectionSource: "explicit_click",
    })
  })
})

describe("buildComponentOutputAiChatPayload", () => {
  it("merges explicit component output context into ai-chat request fields", () => {
    const ctx = buildComponentOutputActiveFieldContext({
      taskId: 13131,
      channelId: 11,
      taskComponentId: "comp-uuid",
      taskComponentOutputId: "output-uuid",
      componentTitle: "O que é?",
      selectionSource: "explicit_click",
    })

    expect(buildComponentOutputAiChatPayload(ctx)).toEqual({
      activeChannelId: 11,
      channelId: 11,
      taskId: 13131,
      mode: "assistant_only",
      componentId: "comp-uuid",
      taskComponentOutputId: "output-uuid",
      selectedContextType: "component_output",
      selectedComponentLabel: "O que é?",
    })
  })

  it("does not send ambient component output context without explicit selection", () => {
    const ctx = buildComponentOutputActiveFieldContext({
      taskId: 13131,
      channelId: 11,
      taskComponentId: "comp-uuid",
      taskComponentOutputId: "output-uuid",
      componentTitle: "Vantagens",
    })

    expect(buildComponentOutputAiChatPayload(ctx)).toBeNull()
  })

  it("does not fall back to host task/channel ids when context ids are missing", () => {
    const ctx = {
      ...buildComponentOutputActiveFieldContext({
        taskId: 13131,
        channelId: 11,
        taskComponentId: "comp-uuid",
        taskComponentOutputId: null,
        componentTitle: "O que é?",
        selectionSource: "component_action",
      }),
      taskId: null,
      channelId: null,
    }

    expect(buildComponentOutputAiChatPayload(ctx)).toMatchObject({
      activeChannelId: null,
      channelId: null,
      taskId: null,
      componentId: "comp-uuid",
    })
  })
})

describe("buildAiChatSelectionPayload", () => {
  it("does not infer task scope from ambient task field context", () => {
    const staleComponentContext = buildComponentOutputActiveFieldContext({
      taskId: 13131,
      channelId: 11,
      taskComponentId: "vantagens-uuid",
      taskComponentOutputId: "output-vantagens",
      componentTitle: "Vantagens",
    })
    const taskLevelContext = {
      fieldType: "task",
      label: "Task",
      taskId: 13131,
      channelId: 11,
      instructions: null,
      componentSelectionSource: null,
    }

    expect(buildAiChatSelectionPayload(taskLevelContext)).toBeNull()
    expect(buildAiChatSelectionPayload(staleComponentContext)).toBeNull()
  })

  it("sends task scope only when contextSource is explicit", () => {
    expect(
      buildAiChatSelectionPayload({
        fieldType: "task",
        label: "Task",
        taskId: 13131,
        channelId: 11,
        contextSource: "user_selected_current_task",
      }),
    ).toMatchObject({
      selectedContextType: "task",
      taskId: 13131,
      channelId: 11,
      componentId: null,
    })
  })

  it("sends component context from a single tagged component ref", () => {
    expect(
      buildAiChatSelectionPayload(
        { fieldType: "task", label: "Task", taskId: 13131, channelId: 11 },
        [
          {
            task_id: 13131,
            channel_id: 11,
            component_id: "intro-uuid",
            component_title: "Intro",
          },
        ],
      ),
    ).toMatchObject({
      componentId: "intro-uuid",
      selectedContextType: "component_output",
      selectedComponentLabel: "Intro",
      taskComponentOutputId: null,
    })
  })
})

describe("resolveComponentOutputSelectionDiagnostics", () => {
  it("reports ambient stale selection without payload component ids", () => {
    const ctx = buildComponentOutputActiveFieldContext({
      taskId: 13131,
      channelId: 11,
      taskComponentId: "comp-uuid",
      taskComponentOutputId: "output-uuid",
      componentTitle: "Vantagens",
    })

    expect(resolveComponentOutputSelectionDiagnostics(ctx)).toMatchObject({
      componentId: null,
      selectedContextType: null,
      sourceOfSelection: "ambient_stale",
    })
  })
})

describe("resolveAiChatOutboundContext", () => {
  it("returns general context while a task is only visible in ambient context", () => {
    expect(
      resolveAiChatOutboundContext({
        messageTags: [],
      }),
    ).toMatchObject({
      taskId: null,
      channelId: null,
      activeChannelId: null,
      componentId: null,
      selectedContextType: "general",
      contextSource: "none",
    })
  })

  it("does not pre-resolve a task pill into a top-level write target", () => {
    expect(
      resolveAiChatOutboundContext({
        messageTags: [
          {
            type: "task",
            id: 13155,
            label: "Blog post",
            source: "mention",
            contextSource: "user_selected_current_task",
            taskId: 13155,
            channelId: 11,
          },
        ],
      }),
    ).toMatchObject({
      taskId: null,
      channelId: null,
      componentId: null,
      selectedContextType: "general",
      contextSource: "none",
    })
  })

  it("flags component-output intent from a component pill without resolving the write target", () => {
    expect(
      resolveAiChatOutboundContext({
        messageTags: [
          {
            type: "task_component",
            id: "intro-uuid",
            label: "Intro",
            source: "mention",
            taskId: 13131,
            channelId: 11,
            componentId: "intro-uuid",
            componentTitle: "Intro",
          },
        ],
      }),
    ).toMatchObject({
      taskId: null,
      channelId: null,
      componentId: null,
      taskComponentOutputId: null,
      selectedContextType: "component_output",
      selectedComponentLabel: "Intro",
      contextSource: "mention",
    })
  })

  it("sends a top-level write target only for an explicit per-component build", () => {
    expect(
      resolveAiChatOutboundContext({
        explicitBuild: {
          componentId: "intro-uuid",
          taskId: 13131,
          channelId: 11,
          componentTitle: "Intro",
        },
      }),
    ).toMatchObject({
      taskId: 13131,
      channelId: 11,
      componentId: "intro-uuid",
      selectedContextType: "component_output",
      contextSource: "component_action",
      mode: "build_component",
    })
  })

  it("does not infer task scope when multiple task pills are present", () => {
    expect(
      resolveAiChatOutboundContext({
        messageTags: [
          { type: "task", id: 1, label: "Task A", source: "mention" },
          { type: "task", id: 2, label: "Task B", source: "mention" },
        ],
      }),
    ).toMatchObject({
      taskId: null,
      selectedContextType: "general",
      contextSource: "none",
    })
  })
})
