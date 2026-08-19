import { describe, expect, it } from "vitest"
import {
  buildAssistantContentJsonFromMarkdown,
  formatAssistantBlocksForDisplay,
  formatAssistantContentForDisplay,
  formatUserMessageForDisplay,
  groupAssistantBlocksForRender,
  markdownFromAssistantBlocks,
} from "../features/ai-chat/ai-chat-message-format"

describe("formatUserMessageForDisplay", () => {
  it("preserves internal newlines for pre-wrap rendering", () => {
    expect(formatUserMessageForDisplay("line 1\n\nline 2")).toBe("line 1\n\nline 2")
  })

  it("normalizes Windows line endings", () => {
    expect(formatUserMessageForDisplay("a\r\nb")).toBe("a\nb")
  })
})

describe("formatAssistantContentForDisplay", () => {
  it("splits double newlines into separate paragraphs", () => {
    const html = formatAssistantContentForDisplay("Here's a brief overview:\n\nIntro: details")
    expect(html).toContain("<p>")
    expect(html.match(/<p>/g)?.length ?? 0).toBeGreaterThanOrEqual(2)
  })

  it("renders markdown links with anchor tags", () => {
    const html = formatAssistantContentForDisplay("See [Example](https://example.com) for more.")
    expect(html).toContain('<a href="https://example.com"')
  })

  it("linkifies bare app://ai-build URLs into clickable entity chips", () => {
    const buildId = "f07777e0-f36a-49ca-b069-2b4d3fe100d6"
    const html = formatAssistantContentForDisplay(
      `Podes acompanhar aqui: app://ai-build/${buildId}`,
      { appLinkLabels: { [`app://ai-build/${buildId}`]: "Cork material" } },
    )
    expect(html).toContain(`href="app://ai-build/${buildId}"`)
    expect(html).toContain("ai-msg-entity-chip")
    expect(html).toContain("Cork material")
    expect(html).not.toMatch(new RegExp(`>\\s*app://ai-build/${buildId}\\s*<`))
  })

  it("keeps existing markdown artifact links clickable as chips", () => {
    const artifactId = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee"
    const html = formatAssistantContentForDisplay(
      `Open [Water-resistant guide](app://artifact/${artifactId})`,
    )
    expect(html).toContain(`href="app://artifact/${artifactId}"`)
    expect(html).toContain("ai-msg-entity-chip")
    expect(html).toContain("Water-resistant guide")
  })

  it("renders artifact markdown links without list bullets", () => {
    const artifactId = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee"
    const html = formatAssistantContentForDisplay(
      `- [Water-resistant guide](app://artifact/${artifactId})`,
    )
    expect(html).toContain(`href="app://artifact/${artifactId}"`)
    expect(html).toContain("ai-msg-entity-chip")
    expect(html).toContain("Water-resistant guide")
    expect(html).not.toContain("<ul>")
    expect(html).not.toContain("<li>")
  })

  it("collapses bulleted title + link pairs without keeping a bullet", () => {
    const artifactId = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee"
    const title = "Granulated cork guide"
    const html = formatAssistantContentForDisplay(
      `- ${title}\n- [${title}](app://artifact/${artifactId})`,
    )
    expect(html).toContain(`href="app://artifact/${artifactId}"`)
    expect(html).toContain("ai-msg-entity-chip")
    expect(html).not.toContain("<ul>")
    expect(html).not.toContain("<li>")
    const occurrences = html.split(title).length - 1
    expect(occurrences).toBe(1)
  })

  it("collapses duplicate title + markdown link into one chip", () => {
    const artifactId = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee"
    const title = "Granulated cork: what is it, applications and how to choose it"
    const html = formatAssistantContentForDisplay(
      `${title}\n[${title}](app://artifact/${artifactId})`,
    )
    expect(html).toContain(`href="app://artifact/${artifactId}"`)
    expect(html).toContain("ai-msg-entity-chip")
    // Title should appear once inside the chip, not as a separate plain line + chip.
    const occurrences = html.split(title).length - 1
    expect(occurrences).toBe(1)
  })

  it("flattens multiline markdown artifact link labels into one chip", () => {
    const artifactId = "ca81d6ef-c2e6-4376-8b76-f422d6d0af7b"
    const html = formatAssistantContentForDisplay(
      `Claro — pedi a atualização da introdução no documento existente para ficar mais direta e em apenas um parágrafo, sem mexer no resto do ficheiro.\n\n[Somengil\n\nCapacity management\n\nrevisão assinalada v3 PT-PT](app://artifact/${artifactId})`,
    )
    expect(html).toContain(`href="app://artifact/${artifactId}"`)
    expect(html).toContain("ai-msg-entity-chip")
    expect(html).toContain("Somengil Capacity management revisão assinalada v3 PT-PT")
    expect(html).not.toContain("[Somengil")
    expect(html).not.toContain("](app://")
  })

  it("recovers multiline artifact links already split into HTML paragraphs", () => {
    const artifactId = "ca81d6ef-c2e6-4376-8b76-f422d6d0af7b"
    const html = formatAssistantContentForDisplay(
      `<p>[Somengil</p><p>Capacity management</p><p>revisão assinalada v3 PT-PT](app://artifact/${artifactId})</p>`,
    )
    expect(html).toContain("ai-msg-entity-chip")
    expect(html).toContain(`href="app://artifact/${artifactId}"`)
    expect(html).not.toContain("[Somengil")
  })

  it("renders bold markdown as strong tags", () => {
    const html = formatAssistantContentForDisplay("**Conclusão**")
    expect(html).toContain("<strong>Conclusão</strong>")
    expect(html).not.toContain("**Conclusão**")
  })

  it("collapses newlines inside quoted template names", () => {
    const html = formatAssistantContentForDisplay(
      'A minha recomendação: avançar com esta proposta como newsletter em inglês, seguindo o template “EN\n\nJuly 2026”, com 4 artigos e tom B2B sóbrio.',
    )
    expect(html).toContain("“EN July 2026”")
    expect(html).not.toMatch(/“EN<\/p>/)
    expect(html.match(/<p>/g)?.length ?? 0).toBe(1)
  })

  it("flattens multiline bold structure into inline strong text", () => {
    const html = formatAssistantContentForDisplay(
      'Propunha manter a lógica da newsletter de julho — **um tema editorial agregador\n\nintro curta\n\n4 blocos de artigos com CTA “Read on”** — mas dar a agosto um ângulo mais operacional.',
    )
    expect(html).toContain("<strong>")
    expect(html).toContain("um tema editorial agregador, intro curta, 4 blocos de artigos com CTA “Read on”")
    expect(html).not.toContain("**")
    expect(html).not.toContain("<ul>")
  })

  it("flattens short bullet lists after bold used as inline structure", () => {
    const html = formatAssistantContentForDisplay(
      'Propunha manter a lógica da newsletter de julho — **um tema editorial agregador**\n- intro curta\n- 4 blocos de artigos com CTA “Read on” — mas dar a agosto um ângulo mais operacional.',
    )
    expect(html).toContain("<strong>um tema editorial agregador</strong>")
    expect(html).toContain("intro curta, 4 blocos de artigos com CTA “Read on”")
    expect(html).not.toContain("<ul>")
    expect(html).not.toContain("<li>")
  })

  it("renders numbered lists", () => {
    const markdown = "Here are updates:\n\n1. **Conclusão**: text\n2. **Que tipos existem?**: text"
    const html = formatAssistantContentForDisplay(markdown)
    expect(html).toContain("<ol>")
    expect(html).toContain("<li>")
    expect(html).toContain("<strong>Conclusão</strong>")
  })

  it("renders nested bullet lists", () => {
    const markdown = "1. **Conclusão**: text\n   - **Snippet**: quote"
    const html = formatAssistantContentForDisplay(markdown)
    expect(html).toContain("<ol>")
    expect(html).toContain("<ul>")
    expect(html).toContain("<strong>Snippet</strong>")
  })

  it("keeps packed keyword bullets as a real list", () => {
    const html = formatAssistantContentForDisplay(
      'Palavras-chave: - cetose - cetose e diabetes - cetoacidose diabética - corpos cetónicos - dieta cetogénica e diabetes',
    )
    expect(html).toContain("<ul>")
    expect(html).toContain("<li>")
    expect(html).toContain("cetose e diabetes")
    expect(html).not.toMatch(/- cetose - cetose e diabetes/)
  })

  it("restores block breaks when assistant content is stored as HTML", () => {
    const html = formatAssistantContentForDisplay(
      '<p>O artigo deve seguir as guidelines.</p><ul><li>cetose</li><li>cetose e diabetes</li></ul><p>O artigo está a ser gerado</p>',
    )
    expect(html).toContain("<ul>")
    expect(html).toContain("<li>")
    expect(html.match(/<p>/g)?.length ?? 0).toBeGreaterThanOrEqual(2)
    expect(html).toContain("O artigo está a ser gerado")
    expect(html).not.toMatch(/diabetesO artigo/)
    expect(html).not.toMatch(/diabetes O artigo está a ser gerado<\/p>/)
  })

  it("repairs spaces around glued quotes", () => {
    const html = formatAssistantContentForDisplay(
      'Vou criar a task no projeto"quilaban diabetes"para o Planner (PT),"cetose" tem também"cetose"como keyword.',
    )
    expect(html).toContain("projeto &quot;quilaban diabetes&quot; para")
    expect(html).toContain("(PT), &quot;cetose&quot;")
    expect(html).toContain("também &quot;cetose&quot; como")
    expect(html).not.toContain("&quot; quilaban")
    expect(html).not.toContain("&quot; cetose")
  })
})

describe("formatAssistantBlocksForDisplay", () => {
  it("merges escaped paragraph blocks into rich markdown output", () => {
    const blocks = [
      {
        type: "paragraph",
        text: "<p>1. **Conclusão**: text</p>",
      },
      {
        type: "paragraph",
        text: "<p>   - **Snippet**: quote</p>",
      },
    ]
    const html = formatAssistantBlocksForDisplay(blocks)
    expect(html).toContain("<strong>Conclusão</strong>")
    expect(html).toContain("<strong>Snippet</strong>")
    expect(html).not.toContain("**Conclusão**")
  })
})

describe("groupAssistantBlocksForRender", () => {
  it("groups consecutive text blocks for a single markdown render pass", () => {
    const segments = groupAssistantBlocksForRender([
      { type: "text", text: "Intro" },
      { type: "paragraph", text: "<p>More</p>" },
      { type: "table", headers: ["A"], rows: [["1"]] },
      { type: "text", text: "Outro" },
    ])
    expect(segments).toHaveLength(3)
    expect(segments[0]).toEqual({
      kind: "markdown",
      blocks: [
        { type: "text", text: "Intro" },
        { type: "paragraph", text: "<p>More</p>" },
      ],
    })
    expect(segments[1]?.kind).toBe("table")
    expect(segments[2]?.kind).toBe("markdown")
  })
})

describe("buildAssistantContentJsonFromMarkdown", () => {
  it("stores raw markdown in text blocks and preserves attachments", () => {
    const blocks = buildAssistantContentJsonFromMarkdown("**Hello**", [
      { type: "attachment", attachment_id: "a1" },
    ])
    expect(blocks).toEqual([
      { type: "text", text: "**Hello**" },
      { type: "attachment", attachment_id: "a1" },
    ])
  })
})

describe("markdownFromAssistantBlocks", () => {
  it("recovers markdown from escaped paragraph html", () => {
    const markdown = markdownFromAssistantBlocks([
      { type: "paragraph", text: "<p>**Bold** item</p>" },
    ])
    expect(markdown).toContain("**Bold**")
  })
})
