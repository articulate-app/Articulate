import { describe, expect, it } from "vitest"
import { parseClarificationRequestAction } from "../app/lib/ai/chat"
import {
  aliasClarificationMessageIdInContentJson,
  buildClarificationDedupeKey,
  buildClarificationResponsePayload,
  buildClarificationUserMessageContentJson,
  clarificationActionToRequest,
  clarificationHasExplicitComponentContext,
  findClarificationAnswerForRequest,
  idsFromClarificationOption,
  parseClarificationFromMessageContentJson,
  parseClarificationOption,
  parseClarificationRequestRecord,
  reduceClarificationRequest,
  resolveActiveClarificationFromMessages,
  resolveClarificationDisplayForMessage,
  resolveClarificationUserDisplayMessage,
  serializeClarificationRequestPayload,
  valuesFromSelectedClarificationOptions,
} from "../features/ai-chat/ai-clarification"
import { resolveUserMessageDisplayContent } from "../features/ai-chat/resolve-user-message-display-content"

describe("ai clarification parsing", () => {
  it("parses target-scope clarification actions without component context", () => {
    const action = parseClarificationRequestAction({
      type: "clarification_request",
      phase: "clarification",
      question: "Which component should I shorten?",
      options: [
        { id: "task_a_intro", label: "Task A / Intro" },
        { id: "task_b_faq", label: "Task B / FAQ" },
      ],
      allow_free_text: true,
      target_scope: "component",
    })

    expect(action).not.toBeNull()
    expect(action?.question).toContain("Which component")
    expect(action?.options).toHaveLength(2)
    expect(action?.component_id).toBeNull()
    expect(action?.allow_free_text).toBe(true)
  })

  it("parses stream clarification actions with component context", () => {
    const action = parseClarificationRequestAction({
      type: "clarification_request",
      phase: "clarification",
      question: "Rewrite the whole component or only the introduction?",
      options: [
        { id: "rewrite_whole_component", label: "Rewrite whole component" },
        { id: "adjust_introduction_only", label: "Adjust introduction only" },
      ],
      task_id: 13155,
      channel_id: 11,
      component_id: "comp-1",
      task_component_output_id: "output-1",
      selected_component_label: "Como escolher",
      allow_free_text: false,
    })

    expect(action).not.toBeNull()
    expect(action?.question).toContain("Rewrite the whole component")
    expect(action?.options).toHaveLength(2)
    expect(action?.allow_free_text).toBe(false)
  })

  it("parses request_plan_id from stream clarification actions and pending_request", () => {
    const direct = parseClarificationRequestAction({
      type: "clarification_request",
      question: "Which structure?",
      options: [{ id: "broad_seo_article", label: "Broad SEO article" }],
      request_plan_id: "plan-abc",
    })
    expect(direct?.request_plan_id).toBe("plan-abc")

    const nested = parseClarificationRequestAction({
      type: "clarification_request",
      question: "Which structure?",
      options: [{ id: "broad_seo_article", label: "Broad SEO article" }],
      pending_request: { request_plan_id: "plan-from-pending", text: "Apply blog structure" },
    })
    expect(nested?.request_plan_id).toBe("plan-from-pending")
  })

  it("hydrates clarification requests from persisted assistant content_json", () => {
    const request = parseClarificationFromMessageContentJson(
      {
        clarification_request: {
          type: "clarification_request",
          question: "How should I edit this component?",
          options: [{ id: "other", label: "Other" }],
          allow_free_text: true,
          task_id: 10,
          channel_id: 2,
          component_id: "comp-2",
        },
      },
      { assistantMessageId: "assistant-1" },
    )

    expect(request?.assistantMessageId).toBe("assistant-1")
    expect(request?.context?.component_id).toBe("comp-2")
    expect(request?.allow_free_text).toBe(true)
    expect(request?.id).toBe("assistant-1")
  })

  it("hydrates message_output.clarification_request payloads", () => {
    const request = parseClarificationRequestRecord({
      message_output: {
        clarification_request: {
          type: "clarification_request",
          question: "Which task did you mean?",
          options: [{ id: "t1", label: "Task One" }],
          allow_free_text: true,
        },
      },
    }, { assistantMessageId: "assistant-2", runId: "run-1" })

    expect(request?.question).toContain("Which task")
    expect(request?.id).toBe("assistant-2")
  })

  it("resolves the active clarification from the latest assistant message", () => {
    const active = resolveActiveClarificationFromMessages([
      {
        id: "user-1",
        thread_id: "t1",
        role: "user",
        content: "Improve intro",
        created_at: "2026-01-01T00:00:00Z",
      },
      {
        id: "assistant-1",
        thread_id: "t1",
        role: "assistant",
        content: "",
        content_json: {
          clarification_request: {
            question: "Rewrite whole component or intro only?",
            options: [{ id: "whole", label: "Whole component" }],
            allow_free_text: true,
          },
        },
        created_at: "2026-01-01T00:00:01Z",
      },
    ])

    expect(active?.question).toContain("Rewrite whole component")
    expect(active?.assistantMessageId).toBe("assistant-1")
  })

  it("dedupes clarifications by message id (not question)", () => {
    expect(
      buildClarificationDedupeKey({
        assistantMessageId: "assistant-1",
        question: "Which target?",
      }),
    ).toBe("assistant-1")
    expect(
      buildClarificationDedupeKey({
        runId: "run-1",
        question: "Which target?",
      }),
    ).toBe("run-1")
  })

  it("builds clarification_response with option ids, opaque values, and request_plan_id", () => {
    const clarificationResponse = buildClarificationResponsePayload({
      clarificationMessageId: "assistant-1",
      requestPlanId: "plan-111",
      selectedOptionIds: ["blog", "linkedin"],
      selectedOptions: [
        {
          id: "blog",
          label: "Blog",
          value: { channel_id: 11 },
          entity_ref: { channel_id: 11, entity_type: "channel" },
        },
        {
          id: "linkedin",
          label: "LinkedIn",
          value: { channel_id: 12 },
          entity_ref: { channel_id: 12, entity_type: "channel" },
        },
      ],
      freeText: null,
    })
    expect(
      buildClarificationUserMessageContentJson({
        clarificationResponse,
        displayMessage: "Blog, LinkedIn",
      }),
    ).toEqual({
      clarification_response: {
        clarification_message_id: "assistant-1",
        request_plan_id: "plan-111",
        selected_option: "blog",
        selected_options: ["blog", "linkedin"],
        free_text: null,
        value: [{ channel_id: 11 }, { channel_id: 12 }],
        entity_ref: [
          { channel_id: 11, entity_type: "channel" },
          { channel_id: 12, entity_type: "channel" },
        ],
      },
      display_message: "Blog, LinkedIn",
    })
    expect(clarificationResponse).not.toHaveProperty("task_id")
    expect(clarificationResponse).not.toHaveProperty("channel_id")
    expect(clarificationResponse).not.toHaveProperty("component_id")
  })

  it("parses request_plan_id from clarification_request payloads", () => {
    const request = parseClarificationRequestRecord(
      {
        type: "clarification_request",
        question: "Which channel?",
        options: [{ id: "blog", label: "Blog", value: { channel_id: 11 } }],
        request_plan_id: "plan-222",
        allow_free_text: true,
      },
      { assistantMessageId: "assistant-plan" },
    )
    expect(request?.request_plan_id).toBe("plan-222")
  })

  it("never derives entity ids from option labels", () => {
    const option = parseClarificationOption({
      id: "label-looks-like-id",
      label: "Task 99 / Channel 3 / Component XYZ",
    })
    expect(idsFromClarificationOption(option)).toEqual({
      task_id: null,
      channel_id: null,
      component_id: null,
      task_component_output_id: null,
    })
  })

  it("serializes clarification payloads for persistence", () => {
    const request = clarificationActionToRequest({
      type: "clarification_request",
      question: "Choose one",
      options: [{ id: "a", label: "A" }],
      allow_free_text: true,
      target_scope: "component",
    }, { assistantMessageId: "assistant-3" })

    expect(clarificationHasExplicitComponentContext(request)).toBe(false)
    expect(serializeClarificationRequestPayload(request)).toEqual({
      type: "clarification_request",
      question: "Choose one",
      options: [{ id: "a", label: "A" }],
      allow_free_text: true,
      target_scope: "component",
    })
  })

  it("treats allow_free_text as opt-in", () => {
    const request = parseClarificationRequestRecord({
      type: "clarification_request",
      phase: "clarification",
      question: "Which component should I edit?",
      options: [{ id: "a", label: "Intro" }],
      target_scope: "component",
    })
    expect(request?.allow_free_text).toBe(false)
    expect(clarificationHasExplicitComponentContext(request!)).toBe(false)
  })

  it("merges legacy component_options into generic options with entity_ref", () => {
    const request = parseClarificationRequestRecord(
      {
        type: "clarification_request",
        question: "Which component should I improve?",
        options: [
          {
            id: "opt-1",
            label: "Intro",
            kind: "component",
            task_id: 10,
            channel_id: 2,
            component_id: "comp-1",
            task_component_output_id: "out-1",
          },
        ],
        component_options: [
          {
            id: "opt-2",
            label: "FAQ",
            kind: "component",
            task_id: 10,
            channel_id: 3,
            component_id: "comp-2",
            task_component_output_id: "out-2",
          },
        ],
        allow_multiple: true,
        min_selections: 1,
        max_selections: 2,
        allow_free_text: true,
      },
      { assistantMessageId: "assistant-comp" },
    )

    expect(request?.id).toBe("assistant-comp")
    expect(request?.options).toHaveLength(2)
    expect(request?.allow_multiple).toBe(true)
    expect(request?.min_selections).toBe(1)
    expect(request?.max_selections).toBe(2)
    expect(request?.options[0]?.entity_ref?.component_id).toBe("comp-1")
    expect(request?.options[1]?.entity_ref?.channel_id).toBe(3)
  })

  it("does not rehydrate answered clarifications after a structured response", () => {
    const active = resolveActiveClarificationFromMessages([
      {
        id: "assistant-1",
        thread_id: "t1",
        role: "assistant",
        content: "",
        content_json: {
          clarification_request: {
            question: "Which component?",
            options: [{ id: "a", label: "A" }],
            allow_free_text: true,
          },
        },
        created_at: "2026-01-01T00:00:01Z",
      },
      {
        id: "user-2",
        thread_id: "t1",
        role: "user",
        content: "A",
        content_json: {
          clarification_response: {
            clarification_message_id: "assistant-1",
            selected_option: "a",
          },
        },
        created_at: "2026-01-01T00:00:02Z",
      },
    ])
    expect(active).toBeNull()
  })

  it("merges stream + message_output clarifications by message_id without duplication", () => {
    const fromStream = parseClarificationRequestRecord(
      {
        type: "clarification_request",
        question: "Pick a style",
        options: [{ id: "concise", label: "Concise", value: "concise" }],
        allow_multiple: false,
      },
      { assistantMessageId: "temp-1", runId: "run-9" },
    )
    const fromOutput = parseClarificationRequestRecord(
      {
        type: "clarification_request",
        question: "Pick a style",
        options: [
          { id: "concise", label: "Concise", value: "concise" },
          { id: "detailed", label: "Detailed", value: "detailed" },
        ],
        allow_multiple: true,
        max_selections: 2,
      },
      { assistantMessageId: "assistant-9", runId: "run-9" },
    )
    const merged = reduceClarificationRequest(fromStream, fromOutput!)
    expect(merged.id).toBe("assistant-9")
    expect(merged.options).toHaveLength(2)
    expect(merged.allow_multiple).toBe(true)
    expect(merged.max_selections).toBe(2)
  })

  it("preserves answered clarification display for history", () => {
    const messages = [
      {
        id: "assistant-1",
        thread_id: "t1",
        role: "assistant" as const,
        content: "",
        content_json: {
          clarification_request: {
            question: "Which channels?",
            options: [
              { id: "blog", label: "Blog", value: 11 },
              { id: "linkedin", label: "LinkedIn", value: 12 },
            ],
            allow_multiple: true,
          },
        },
        created_at: "2026-01-01T00:00:01Z",
      },
      {
        id: "user-2",
        thread_id: "t1",
        role: "user" as const,
        content: "Blog, LinkedIn",
        content_json: {
          clarification_response: {
            clarification_message_id: "assistant-1",
            selected_options: ["blog", "linkedin"],
            value: [11, 12],
          },
        },
        created_at: "2026-01-01T00:00:02Z",
      },
    ]
    const display = resolveClarificationDisplayForMessage(messages, 0)
    expect(display?.answered).toBe(true)
    expect(display?.answer?.selectedOptionIds).toEqual(["blog", "linkedin"])
    expect(display?.request.question).toContain("channels")
  })

  it("merges clarifications that share a request_plan_id", () => {
    const first = parseClarificationRequestRecord(
      {
        type: "clarification_request",
        question: "Which structure?",
        options: [{ id: "a", label: "A" }],
        request_plan_id: "plan-shared",
      },
      { assistantMessageId: "assistant-old" },
    )!
    const second = parseClarificationRequestRecord(
      {
        type: "clarification_request",
        question: "Confirm structure scope?",
        options: [
          { id: "broad_seo_article", label: "Broad SEO article" },
          { id: "narrow_guide", label: "Narrow guide" },
        ],
        request_plan_id: "plan-shared",
      },
      { assistantMessageId: "assistant-new" },
    )!
    const merged = reduceClarificationRequest(first, second)
    expect(merged.request_plan_id).toBe("plan-shared")
    expect(merged.assistantMessageId).toBe("assistant-new")
    expect(merged.question).toContain("Confirm structure")
    expect(merged.options.map((option) => option.id)).toEqual([
      "broad_seo_article",
      "narrow_guide",
    ])
  })

  it("restores answered state by clarification_message_id after temp→persisted alias", () => {
    const request = parseClarificationRequestRecord(
      {
        type: "clarification_request",
        question: "Which structure?",
        options: [{ id: "broad_seo_article", label: "Broad SEO article" }],
        request_plan_id: "plan-1",
      },
      { assistantMessageId: "assistant-persisted" },
    )!
    const contentJson = aliasClarificationMessageIdInContentJson(
      {
        display_message: "Broad SEO article",
        clarification_response: {
          clarification_message_id: "temp-assistant",
          selected_option: "broad_seo_article",
          selected_options: ["broad_seo_article"],
          free_text: null,
        },
      },
      "temp-assistant",
      "assistant-persisted",
    )
    const messages = [
      {
        id: "assistant-persisted",
        thread_id: "t1",
        role: "assistant" as const,
        content: "",
        content_json: {
          clarification_request: serializeClarificationRequestPayload(request),
        },
        created_at: "2026-01-01T00:00:01Z",
      },
      {
        id: "user-2",
        thread_id: "t1",
        role: "user" as const,
        content: "Broad SEO article",
        content_json: contentJson,
        created_at: "2026-01-01T00:00:02Z",
      },
    ]
    const answer = findClarificationAnswerForRequest(messages, request, {
      afterMessageIndex: 0,
      assistantMessage: messages[0],
    })
    expect(answer?.selectedOptionIds).toEqual(["broad_seo_article"])
    expect(resolveClarificationDisplayForMessage(messages, 0)?.answered).toBe(true)
  })

  it("renders clarification user bubbles from display_message, not option ids", () => {
    expect(
      resolveUserMessageDisplayContent("broad_seo_article", {
        display_message: "Broad SEO article",
        clarification_response: {
          clarification_message_id: "assistant-1",
          selected_option: "broad_seo_article",
          selected_options: ["broad_seo_article"],
        },
      }),
    ).toBe("Broad SEO article")

    expect(
      resolveClarificationUserDisplayMessage({
        content: "broad_seo_article",
        contentJson: {
          clarification_response: {
            clarification_message_id: "assistant-1",
            selected_options: ["broad_seo_article", "narrow_guide"],
            free_text: null,
          },
        },
        optionLabelById: new Map([
          ["broad_seo_article", "Broad SEO article"],
          ["narrow_guide", "Narrow guide"],
        ]),
      }),
    ).toBe("Broad SEO article, Narrow guide")

    expect(
      resolveClarificationUserDisplayMessage({
        content: "",
        contentJson: {
          clarification_response: {
            clarification_message_id: "assistant-1",
            selected_options: [],
            free_text: "Custom brief",
          },
        },
      }),
    ).toBe("Custom brief")
  })

  it("returns opaque selected values without deriving intent", () => {
    const options = [
      parseClarificationOption({ id: "a", label: "A", value: { mode: "real" } })!,
      parseClarificationOption({ id: "b", label: "B", value: { mode: "dummy" } })!,
    ]
    expect(valuesFromSelectedClarificationOptions(options)).toEqual([
      { mode: "real" },
      { mode: "dummy" },
    ])
    expect(valuesFromSelectedClarificationOptions([options[0]!])).toEqual({ mode: "real" })
  })
})
