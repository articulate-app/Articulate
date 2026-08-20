import { describe, expect, it } from "vitest"
import {
  softenAssistantMarkdownProse,
  splitPackedHeadingBodies,
  splitPackedMarkdownHeadings,
  stripLeakedCjkInLatinProse,
} from "../features/ai-chat/assistant-markdown-prose"
import {
  isAssistantDraftDocument,
  splitAssistantDraftDocument,
  titleFromDraftDocument,
} from "../features/ai-chat/assistant-draft-output"

describe("splitPackedMarkdownHeadings", () => {
  it("breaks a glued ATX heading onto its own line", () => {
    const out = splitPackedMarkdownHeadings(
      "pensar com calma. ### Destacar o que os outros estão a ganhar Mostrar capturas",
    )
    expect(out).toContain("pensar com calma.\n\n### Destacar o que os outros")
  })
})

describe("splitPackedHeadingBodies", () => {
  it("keeps a short H3 title and moves the glued paragraph out", () => {
    const out = splitPackedHeadingBodies(
      '### Destacar o que os outros estão a ganhar Mostrar capturas de ecrã com lucros, testemunhos de pessoas que "mudaram de vida" e capturas de carteiras digitais enche o feed de prova social.',
    )
    expect(out).toContain("### Destacar o que os outros estão a ganhar\n\nMostrar capturas")
    expect(out).not.toMatch(/^### Destacar.+\nMostrar/m)
  })

  it("leaves a heading-only title intact", () => {
    expect(splitPackedHeadingBodies("### Destacar o que os outros estão a ganhar")).toBe(
      "### Destacar o que os outros estão a ganhar",
    )
  })
})

describe("stripLeakedCjkInLatinProse", () => {
  it("removes isolated CJK leaked into Portuguese", () => {
    expect(stripLeakedCjkInLatinProse("ilusão de成功率 infalível")).toBe(
      "ilusão de infalível",
    )
  })

  it("keeps CJK-only text", () => {
    expect(stripLeakedCjkInLatinProse("成功率")).toBe("成功率")
  })
})

describe("softenAssistantMarkdownProse", () => {
  it("applies heading split and CJK cleanup together", () => {
    const out = softenAssistantMarkdownProse(
      "Esta curadoria cria a ilusão de成功率 infalível. ### Recorrer ao apelo",
    )
    expect(out).toContain("ilusão de infalível.")
    expect(out).toContain("\n\n### Recorrer ao apelo")
  })
})

describe("isAssistantDraftDocument", () => {
  it("treats a long headed article as a document card", () => {
    const text = [
      "## Técnicas usadas por finfluencers a que deves estar atento",
      "",
      "Nem tudo o que parece boa oportunidade financeira é mesmo. ".repeat(4),
      "",
      "### Criar um sentido de urgência artificial",
      "",
      "Mensagens como só hoje servem para comprimir o tempo de decisão. ".repeat(3),
    ].join("\n")
    expect(isAssistantDraftDocument(text)).toBe(true)
    expect(titleFromDraftDocument(text)).toBe(
      "Técnicas usadas por finfluencers a que deves estar atento",
    )
  })

  it("leaves short chat replies in the bubble", () => {
    expect(isAssistantDraftDocument("Aqui vai um resumo curto.")).toBe(false)
  })
})

describe("splitAssistantDraftDocument", () => {
  it("keeps setup chatter and a follow-up offer outside the document body", () => {
    const markdown = [
      "Aqui vai uma secção pronta a usar, com estrutura H2",
      "intro curta",
      "subtítulos H3 (uma técnica por bloco). Mantive a acentuação correta em português.",
      "",
      "## Técnicas usadas por finfluencers a que deves estar atento",
      "",
      "Nem tudo o que parece boa oportunidade financeira é mesmo. ".repeat(4),
      "",
      "### Criar um sentido de urgência artificial",
      "",
      "Mensagens como só hoje servem para comprimir o tempo de decisão. ".repeat(3),
      "",
      "Como bónus prático, se quiseres, posso adaptar esta lista para pt-BR ou reduzir para 5–6 técnicas mais marcantes para o artigo ficar mais curto. Diz só como preferes.",
    ].join("\n")

    const parts = splitAssistantDraftDocument(markdown)
    expect(parts.intro).toContain("Aqui vai uma secção pronta a usar")
    expect(parts.intro).toContain("Mantive a acentuação correta em português")
    expect(parts.body).toContain("## Técnicas usadas por finfluencers")
    expect(parts.body).toContain("### Criar um sentido de urgência")
    expect(parts.body).not.toContain("Aqui vai uma secção")
    expect(parts.body).not.toContain("Como bónus")
    expect(parts.outro).toContain("Como bónus prático")
    expect(parts.outro).toContain("Diz só como preferes")
    expect(titleFromDraftDocument(parts.body)).toBe(
      "Técnicas usadas por finfluencers a que deves estar atento",
    )
  })

  it("splits intro when the first heading is packed onto the previous sentence", () => {
    const markdown = [
      "Aqui vai uma secção pronta a usar, com estrutura H2. Mantive a acentuação correta em português. ### Destacar o que os outros estão a ganhar",
      "",
      "Mostrar capturas reais do resultado. ".repeat(8),
      "",
      "Como bónus prático, se quiseres, posso adaptar esta lista.",
    ].join("\n")
    const parts = splitAssistantDraftDocument(markdown)
    expect(parts.intro).toContain("Aqui vai uma secção pronta a usar")
    expect(parts.body.startsWith("### Destacar o que os outros estão a ganhar")).toBe(true)
    expect(parts.body).not.toContain("Aqui vai uma secção")
    expect(parts.outro).toContain("Como bónus prático")
  })

  it("leaves a headed article without chatter intact", () => {
    const markdown = [
      "## Técnicas usadas por finfluencers a que deves estar atento",
      "",
      "Nem tudo o que parece boa oportunidade financeira é mesmo.",
    ].join("\n")
    expect(splitAssistantDraftDocument(markdown)).toEqual({
      intro: "",
      body: markdown,
      outro: "",
    })
  })
})
