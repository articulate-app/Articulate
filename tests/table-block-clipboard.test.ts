import { describe, expect, it } from "vitest"
import { tableBlockToClipboardText } from "../features/ai-chat/text-to-output-blocks"

describe("tableBlockToClipboardText", () => {
  it("formats a markdown table for clipboard", () => {
    expect(
      tableBlockToClipboardText(
        ["Criteria", "Cork"],
        [
          ["Best for", "Comfort"],
          ["Role", "Absorption"],
        ],
      ),
    ).toBe(
      [
        "| Criteria | Cork |",
        "| --- | --- |",
        "| Best for | Comfort |",
        "| Role | Absorption |",
      ].join("\n"),
    )
  })

  it("escapes pipes in cells", () => {
    expect(tableBlockToClipboardText(["A|B"], [["1|2"]])).toBe(
      ["| A\\|B |", "| --- |", "| 1\\|2 |"].join("\n"),
    )
  })
})
