import { describe, expect, it } from "vitest"
import { consumeTextStream } from "../app/lib/ai/chat"

function makeStreamResponse(chunks: string[], contentType: string): Response {
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
    headers: { "content-type": contentType },
  })
}

describe("AI chat stream content-type handling", () => {
  it("streams __AI_*__ + plain deltas even when mislabeled as event-stream", async () => {
    const textChunks: string[] = []
    const statusTexts: string[] = []

    const result = await consumeTextStream(
      makeStreamResponse(
        [
          '__AI_STATUS__{"type":"status","phase":"started","text":"Thinking…"}\n',
          "Como ",
          "conseguir ",
          "bacon ",
          "crocante",
          '__AI_MESSAGE_OUTPUT__{"type":"message_output","phase":"completed","content_text":"Como conseguir bacon crocante","message_id":"msg-1"}\n',
        ],
        "text/event-stream; charset=utf-8",
      ),
      {
        onTextChunk: (chunk) => textChunks.push(chunk),
        onStatusText: (statusText) => {
          if (statusText) statusTexts.push(statusText)
        },
        onMessageOutputEvent: () => undefined,
      },
    )

    expect(textChunks.join("")).toBe("Como conseguir bacon crocante")
    expect(result.fullText).toBe("Como conseguir bacon crocante")
    expect(statusTexts[0]).toBe("Thinking…")
  })
})
