import { describe, expect, it } from "vitest"
import {
  buildClarificationDedupeKey,
  buildClarificationResponsePayload,
  buildClarificationUserMessageContentJson,
  idsFromClarificationOption,
  parseClarificationFromMessageContentJson,
  parseClarificationOption,
} from "../features/ai-chat/ai-clarification"

describe("briefing-independent clarification continuation", () => {
  it("upserts clarification cards by message_id only", () => {
    expect(
      buildClarificationDedupeKey({
        assistantMessageId: "msg-1",
        question: "Which component?",
      }),
    ).toBe("msg-1")
    expect(
      buildClarificationDedupeKey({
        assistantMessageId: "msg-1",
        question: "Different wording",
      }),
    ).toBe("msg-1")
  })

  it("rehydrates clarification from persisted assistant content_json after message.completed shape", () => {
    const request = parseClarificationFromMessageContentJson(
      {
        blocks: [{ type: "text", text: "Need a target." }],
        clarification_request: {
          type: "clarification_request",
          question: "Which component should I edit?",
          options: [
            {
              id: "opt-intro",
              label: "Intro",
              entity_ref: { task_id: 1, channel_id: 2, component_id: "comp-1" },
            },
            {
              id: "opt-faq",
              label: "FAQ",
              entity_ref: { task_id: 1, channel_id: 2, component_id: "comp-2" },
            },
          ],
          allow_free_text: true,
        },
      },
      { assistantMessageId: "assistant-persisted" },
    )
    expect(request?.id).toBe("assistant-persisted")
    expect(request?.options.map((o) => o.id)).toEqual(["opt-intro", "opt-faq"])
    expect(request?.options[0]?.entity_ref?.component_id).toBe("comp-1")
  })

  it("keeps entity_ref parseable but does not put entity ids into clarification_response", () => {
    const option = parseClarificationOption({
      id: "opt-1",
      label: "Looks like Task 99",
      entity_ref: {
        task_id: 42,
        channel_id: 11,
        component_id: "comp-uuid",
        task_component_output_id: "out-uuid",
      },
    })
    const ids = idsFromClarificationOption(option)
    expect(ids).toEqual({
      task_id: 42,
      channel_id: 11,
      component_id: "comp-uuid",
      task_component_output_id: "out-uuid",
    })
    const clarificationResponse = buildClarificationResponsePayload({
      clarificationMessageId: "assistant-9",
      selectedOptionIds: ["opt-1"],
      freeText: null,
    })
    const contentJson = buildClarificationUserMessageContentJson({
      clarificationResponse,
      displayMessage: "Looks like Task 99",
    })
    expect(contentJson).toEqual({
      clarification_response: {
        clarification_message_id: "assistant-9",
        selected_option: "opt-1",
        selected_options: ["opt-1"],
        free_text: null,
      },
      display_message: "Looks like Task 99",
    })
  })
})
