import { describe, expect, it } from "vitest"
import { consumeTextStream } from "../app/lib/ai/chat"

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

describe("AI execution-trace stream frames", () => {
  it("never appends __AI_EXECUTION_TRACE__ frames to assistant copy", async () => {
    const textChunks: string[] = []
    const traceEvents: Record<string, unknown>[] = []

    const result = await consumeTextStream(
      makeStreamResponse([
        "Here is the result.\n",
        '__AI_EXECUTION_TRACE__{"type":"execution_trace","sequence":1,"emitted_at":"2026-07-20T10:00:00.000Z","step_id":"resolve","phase":"completed","category":"resolution","text":"Resolved task"}\n',
        "Final answer.",
      ]),
      {
        onTextChunk: (chunk) => textChunks.push(chunk),
        onExecutionTraceEvent: (event) => traceEvents.push(event),
      },
    )

    expect(textChunks.join("")).toBe("Here is the result.\nFinal answer.")
    expect(result.fullText).toBe("Here is the result.\nFinal answer.")
    expect(result.fullText).not.toContain("__AI_EXECUTION_TRACE__")
    expect(result.fullText).not.toContain("Resolved task")
    expect(traceEvents).toHaveLength(1)
    expect(traceEvents[0].step_id).toBe("resolve")
  })
})
