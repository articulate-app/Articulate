import { describe, expect, it, vi } from "vitest"
import { consumeTextStream, type AiChatThreadTitleEvent } from "../app/lib/ai/chat"

function makeStreamResponse(chunks: string[]): Response {
  const encoder = new TextEncoder()
  let index = 0
  const stream = new ReadableStream<Uint8Array>({
    pull(controller) {
      if (index >= chunks.length) {
        controller.close()
        return
      }
      controller.enqueue(encoder.encode(chunks[index]))
      index += 1
    },
  })
  return new Response(stream, {
    headers: { "content-type": "text/plain; charset=utf-8" },
  })
}

describe("AI thread title stream frames", () => {
  it("strips __AI_THREAD_TITLE__ frames from assistant text and emits title events", async () => {
    const titleEvents: AiChatThreadTitleEvent[] = []
    const textChunks: string[] = []

    const result = await consumeTextStream(
      makeStreamResponse([
        'Hello ',
        '__AI_THREAD_TITLE__{"type":"thread_title","phase":"started"}\n',
        'world',
        '__AI_THREAD_TITLE__{"type":"thread_title","phase":"delta","delta":"Sparkfood "}\n',
        '!',
        '__AI_THREAD_TITLE__{"type":"thread_title","phase":"completed","title":"Sparkfood content ideas"}\n',
      ]),
      {
        onTextChunk: (chunk) => textChunks.push(chunk),
        onThreadTitleEvent: (event) => titleEvents.push(event),
      },
    )

    expect(textChunks.join("")).toBe("Hello world!")
    expect(result.fullText).toBe("Hello world!")
    expect(result.fullText).not.toContain("__AI_THREAD_TITLE__")
    expect(result.fullText).not.toContain("Sparkfood content ideas")
    expect(titleEvents).toEqual([
      { type: "thread_title", phase: "started" },
      { type: "thread_title", phase: "delta", delta: "Sparkfood " },
      { type: "thread_title", phase: "completed", title: "Sparkfood content ideas" },
    ])
  })

  it("preserves completed title:null without inventing a title", async () => {
    const titleEvents: AiChatThreadTitleEvent[] = []
    const onThreadTitleEvent = vi.fn((event: AiChatThreadTitleEvent) => {
      titleEvents.push(event)
    })

    await consumeTextStream(
      makeStreamResponse([
        'Answer text',
        '__AI_THREAD_TITLE__{"type":"thread_title","phase":"completed","title":null}\n',
      ]),
      {
        onTextChunk: () => undefined,
        onThreadTitleEvent,
      },
    )

    expect(titleEvents).toEqual([{ type: "thread_title", phase: "completed", title: null }])
  })
})
