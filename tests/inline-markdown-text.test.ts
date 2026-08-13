import { describe, expect, it } from "vitest"
import { parseInlineMarkdownSegments } from "../features/ai-chat/parse-inline-markdown"

describe("parseInlineMarkdownSegments", () => {
  it("renders bold segments without leftover markers", () => {
    expect(
      parseInlineMarkdownSegments("Vou focar só em **novas ideias** e **alimentação**."),
    ).toEqual([
      { type: "text", value: "Vou focar só em " },
      { type: "bold", value: "novas ideias" },
      { type: "text", value: " e " },
      { type: "bold", value: "alimentação" },
      { type: "text", value: "." },
    ])
  })

  it("keeps plain text unchanged", () => {
    expect(parseInlineMarkdownSegments("sem markup")).toEqual([
      { type: "text", value: "sem markup" },
    ])
  })
})
