import { describe, expect, it } from "vitest"
import {
  buildAiOverviewSummary,
  parseAiOverviewEntities,
  stripMarkdownNoise,
} from "../app/lib/dataforseo-ai-overview"

describe("dataforseo-ai-overview parsers", () => {
  it("parses references into ranked entities", () => {
    const entities = parseAiOverviewEntities({
      type: "ai_overview",
      references: [
        {
          source: "Banco Carregosa",
          domain: "bancocarregosa.com",
          url: "https://www.bancocarregosa.com",
          text: "Private banking in Portugal",
        },
        {
          source: "Banco Carregosa",
          url: "https://www.bancocarregosa.com",
          text: "duplicate should be skipped",
        },
        {
          title: "Another bank",
          url: "https://example.com",
          text: "Snippet",
        },
      ],
    })

    expect(entities).toHaveLength(2)
    expect(entities[0]).toMatchObject({
      position: 1,
      name: "Banco Carregosa",
      url: "https://www.bancocarregosa.com",
    })
    expect(entities[1].name).toBe("Another bank")
  })

  it("strips citation footnotes and bare urls from messy AI Overview text", () => {
    const messy =
      "Bankinter pelas vantagens em conta ordenado.https://www.millenniumbcp.pt/institucional/melhor-banco-investimento-2024 [[1]](https://www.millenniumbcp.pt/institucional/melhor-banco-investimento-2024)[[2]](https://qonto.com/pt/blog/x)Principais Bancos Privados e Vantagens - ActivoBank : Ideal para zero comissões."

    const cleaned = stripMarkdownNoise(messy)
    expect(cleaned).not.toContain("https://")
    expect(cleaned).not.toContain("[[1]]")
    expect(cleaned.toLowerCase()).toContain("bankinter")
    expect(cleaned.toLowerCase()).toContain("activobank")
  })

  it("prefers element text over raw markdown", () => {
    const summary = buildAiOverviewSummary({
      markdown:
        "Raw markdown with [[1]](https://example.com) noise and https://spam.example",
      items: [
        {
          text: "ActivoBank is strong for zero fees.",
        },
        {
          title: "Millennium bcp",
          text: "Known for scale and investment.",
        },
      ],
    })

    expect(summary).toContain("ActivoBank")
    expect(summary).toContain("Millennium")
    expect(summary).not.toContain("https://")
    expect(summary).not.toContain("[[1]]")
  })
})
