import { describe, expect, it } from "vitest"
import * as Y from "yjs"
import {
  htmlToTipTapDoc,
  inferGlobalReplace,
  isEditoriallyEquivalent,
  localizeApplyConflict,
  normalizeLeftoverMarkdownHtml,
  resolveAiApplyDocument,
  blockPlainText,
  patchedContentToTipTapDoc,
  replaceInTipTapDoc,
  replaceYDocWithTipTapJson,
  tipTapJsonToPlainText,
  yXmlPlainText,
  yXmlToTipTapDoc,
} from "../app/lib/collaboration/tiptap-json-to-yxml"

describe("tiptap json to yxml (no prosemirror)", () => {
  it("applies the collab test HTML without losing the inserted phrase", () => {
    const html = [
      "<p>COLLAB TEST – Browser + AI – 2026-08-19</p>",
      "<p>Teste interno de colaboração em tempo real</p>",
      "<p>A persistência mantém o conteúdo disponível entre atualizações, sem perder o que já foi escrito. Em um teste como este, ela ajuda a confirmar olá, tudo bem? se o texto continua íntegro.</p>",
      "<p>Projection</p>",
      "<p>A projection mostra como o REMOUNT-PERSIST-CHECK-37b04c8.</p>",
    ].join("")
    const json = htmlToTipTapDoc(html)
    const ydoc = new Y.Doc()
    replaceYDocWithTipTapJson(ydoc, json, "ai:test")
    const text = yXmlPlainText(ydoc)
    expect(text).toContain("olá, tudo bem?")
    expect(text).toContain("REMOUNT-PERSIST-CHECK-37b04c8")
    expect(text).toBe(tipTapJsonToPlainText(json).replace(/\s+/g, " ").trim())
  })

  it("plain-text from a Y.Doc ignores bold mark chrome", () => {
    const json = htmlToTipTapDoc("<p><strong>Meta title:</strong> X problemas</p>")
    const ydoc = new Y.Doc()
    replaceYDocWithTipTapJson(ydoc, json, "ai:test")
    const text = yXmlPlainText(ydoc)
    expect(text).toBe("Meta title: X problemas")
    expect(text).not.toContain("<bold>")
    expect(isEditoriallyEquivalent(
      "<bold>Meta title:</bold> SIBO",
      "Meta title: SIBO",
    )).toBe(true)
  })

  it("turns leftover markdown headings and INCLUDEPICTURE into real blocks", () => {
    const html = [
      "<p>Meta title: SIBO</p>",
      "<p># SIBO: o que é<br>A SIBO é o sobrecrescimento bacteriano.</p>",
      '<p>INCLUDEPICTURE &quot;https://as1.ftcdn.net/v2/jpg/example.jpg&quot; \\* MERGEFORMATINET</p>',
      "<p>## O que é a SIBO</p>",
    ].join("")
    const normalized = normalizeLeftoverMarkdownHtml(html)
    expect(normalized).toContain("<h1>SIBO: o que é</h1>")
    expect(normalized).toContain("<p>A SIBO é o sobrecrescimento bacteriano.</p>")
    expect(normalized).toContain('<figure><img src="https://as1.ftcdn.net/v2/jpg/example.jpg"')
    expect(normalized).toContain("<h2>O que é a SIBO</h2>")
    expect(normalized).not.toContain("# SIBO")
    expect(normalized).not.toContain("INCLUDEPICTURE")

    const doc = htmlToTipTapDoc(html)
    const types = (doc.content ?? []).map((node) => node.type)
    expect(types).toContain("heading")
    expect(types).toContain("attachmentBlock")
  })

  it("keeps Word/HTML tables instead of flattening them to prose", () => {
    const json = htmlToTipTapDoc(
      "<p>Intro</p><table><thead><tr><th>Head</th></tr></thead><tbody><tr><td>Cell</td></tr></tbody></table><p>Outro</p>",
    )
    const types = (json.content ?? []).map((node) => node.type)
    expect(types).toEqual(["paragraph", "table", "paragraph"])
    const table = json.content?.[1]
    expect(table?.content?.[0]?.type).toBe("tableRow")
    expect(table?.content?.[0]?.content?.[0]?.type).toBe("tableHeader")
    expect(table?.content?.[1]?.content?.[0]?.type).toBe("tableCell")
    expect(tipTapJsonToPlainText(json)).toContain("Head")
    expect(tipTapJsonToPlainText(json)).toContain("Cell")
  })

  it("keeps bold marks when converting HTML", () => {
    const json = htmlToTipTapDoc("<p>Keep <strong>this</strong> word.</p>")
    expect(json.content?.[0]?.content).toEqual([
      { type: "text", text: "Keep " },
      { type: "text", text: "this", marks: [{ type: "bold" }] },
      { type: "text", text: " word." },
    ])
  })

  it("parses anchors into link marks, including escaped leftover HTML", () => {
    const json = htmlToTipTapDoc(
      '<p>Pode ser pedida uma <a href="https://www.jcs.pt/pt/blog-da-saude/colonoscopia-como-e-feita-e-quais-os-riscos/">colonoscopia</a>.</p>',
    )
    const marks = json.content?.[0]?.content?.find((node) => node.text === "colonoscopia")?.marks
    expect(marks?.[0]).toMatchObject({
      type: "link",
      attrs: { href: "https://www.jcs.pt/pt/blog-da-saude/colonoscopia-como-e-feita-e-quais-os-riscos/" },
    })

    const escaped = htmlToTipTapDoc(
      "<p>Pode ser pedida uma &lt;a href=&quot;https://www.jcs.pt/pt/blog-da-saude/colonoscopia-como-e-feita-e-quais-os-riscos/&quot;&gt;colonoscopia&lt;/a&gt;.</p>",
    )
    const escapedMarks = escaped.content?.[0]?.content?.find((node) => node.text === "colonoscopia")?.marks
    expect(escapedMarks?.[0]?.type).toBe("link")
    expect(tipTapJsonToPlainText(escaped)).toContain("colonoscopia")
    expect(tipTapJsonToPlainText(escaped)).not.toContain("<a href")
  })

  it("applies link-only AI edits onto the live document", () => {
    const live = htmlToTipTapDoc("<p>Pode ser pedida uma colonoscopia para excluir outras causas.</p>")
    const patched = htmlToTipTapDoc(
      '<p>Pode ser pedida uma <a href="https://www.jcs.pt/pt/blog-da-saude/colonoscopia-como-e-feita-e-quais-os-riscos/">colonoscopia</a> para excluir outras causas.</p>',
    )
    const resolved = resolveAiApplyDocument({
      liveDoc: live,
      patchedDoc: patched,
      expectedText: tipTapJsonToPlainText(live),
      requireExactCurrent: true,
    })
    expect(resolved.ok).toBe(true)
    if (!resolved.ok) return
    expect(resolved.mode).toBe("marks")
    const linked = resolved.doc.content?.[0]?.content?.find((node) => node.text === "colonoscopia")
    expect(linked?.marks?.[0]).toMatchObject({
      type: "link",
      attrs: { href: "https://www.jcs.pt/pt/blog-da-saude/colonoscopia-como-e-feita-e-quais-os-riscos/" },
    })
  })

  it("prefers provided HTML over a nested tiptap snapshot", () => {
    const json = patchedContentToTipTapDoc({
      contentJson: {
        tiptap: {
          type: "doc",
          content: [{ type: "paragraph", content: [{ type: "text", text: "From JSON" }] }],
        },
        blocks: [{ html: "<p>From HTML</p>" }],
      },
      html: "<p>From HTML</p>",
    })
    expect(tipTapJsonToPlainText(json)).toContain("From HTML")
  })

  it("infers a global phrase replace that explains before → after", () => {
    const before =
      "X problemas que uma app de software de gestão de ativos resolve. A app de software de gestão de ativos no terreno."
    const after =
      "X problemas que uma software de gestão de ativos resolve. A software de gestão de ativos no terreno."
    expect(inferGlobalReplace(before, after)).toEqual({
      from: "app de software de gestão de ativos",
      to: "software de gestão de ativos",
    })
  })

  it("replays a global replace on a live Y.Doc without dropping later user text", () => {
    const before = htmlToTipTapDoc(
      "<p>Uma app de software de gestão de ativos resolve rotinas.</p><p>Outra app de software de gestão de ativos no armazém.</p>",
    )
    const after = htmlToTipTapDoc(
      "<p>Uma software de gestão de ativos resolve rotinas.</p><p>Outra software de gestão de ativos no armazém.</p>",
    )
    const inferred = inferGlobalReplace(
      tipTapJsonToPlainText(before).replace(/\s+/g, " ").trim(),
      tipTapJsonToPlainText(after).replace(/\s+/g, " ").trim(),
    )
    expect(inferred?.from).toContain("app de software")

    const live = htmlToTipTapDoc(
      "<p>Uma app de software de gestão de ativos resolve rotinas.</p><p>Outra app de software de gestão de ativos no armazém.</p><p>Nota do editor.</p>",
    )
    const ydoc = new Y.Doc()
    replaceYDocWithTipTapJson(ydoc, live, "user")
    const replaced = replaceInTipTapDoc(yXmlToTipTapDoc(ydoc), [inferred!])
    expect(replaced.count).toBeGreaterThanOrEqual(2)
    replaceYDocWithTipTapJson(ydoc, replaced.doc, "ai")
    const text = yXmlPlainText(ydoc)
    expect(text).toContain("software de gestão de ativos")
    expect(text).not.toContain("app de software de gestão de ativos")
    expect(text).toContain("Nota do editor.")
  })

  it("prefers AI HTML with H3s over a stale nested tiptap snapshot", () => {
    const json = patchedContentToTipTapDoc({
      contentJson: {
        tiptap: htmlToTipTapDoc("<h2>7 problemas</h2><p>Intro.</p>"),
        blocks: [{ html: "<h2>7 problemas</h2><h3>Perdas no terreno</h3><p>Corpo.</p>" }],
      },
      html: "<h2>7 problemas</h2><h3>Perdas no terreno</h3><p>Corpo.</p>",
    })
    const types = (json.content ?? []).map((node) => `${node.type}:${node.attrs?.level ?? ""}`)
    expect(types).toContain("heading:3")
  })

  it("promotes matching problem titles to H3 and inserts missing ones after the section", () => {
    const live = htmlToTipTapDoc([
      "<h2>7 problemas que uma app resolve</h2>",
      "<p>Estes são os problemas.</p>",
      "<h2>Funcionalidades</h2>",
    ].join(""))
    const patched = htmlToTipTapDoc([
      "<h2>7 problemas que uma app resolve</h2>",
      "<p>Estes são os problemas.</p>",
      "<h3>Perdas no terreno</h3>",
      "<p>As perdas custam tempo.</p>",
      "<h2>Funcionalidades</h2>",
    ].join(""))
    const resolved = resolveAiApplyDocument({
      liveDoc: live,
      patchedDoc: patched,
      expectedText: "7 problemas que uma app resolve Estes são os problemas. Funcionalidades",
      requireExactCurrent: true,
    })
    expect(resolved.ok).toBe(true)
    if (!resolved.ok) return
    const headings = (resolved.doc.content ?? [])
      .filter((node) => node.type === "heading")
      .map((node) => `${node.attrs?.level}:${blockPlainText(node)}`)
    expect(headings).toContain("3:Perdas no terreno")
    expect(tipTapJsonToPlainText(resolved.doc)).toContain("As perdas custam tempo.")
    expect(tipTapJsonToPlainText(resolved.doc)).toContain("Funcionalidades")
  })

  it("keeps a user rewrite when the AI expected a different sentence", () => {
    const live = htmlToTipTapDoc("<p>The user rewrote this sentence.</p>")
    const patched = htmlToTipTapDoc("<p>The AI sentence.</p>")
    const resolved = resolveAiApplyDocument({
      liveDoc: live,
      patchedDoc: patched,
      expectedText: "The original sentence.",
      requireExactCurrent: true,
    })
    expect(resolved.ok).toBe(false)
    if (resolved.ok) return
    expect(resolved.reason).toBe("expected_text_mismatch")
    expect(resolved.currentText).toContain("The user rewrote this sentence.")
    expect(resolved.conflict.current).toContain("The user rewrote this sentence.")
    expect(resolved.conflict.incoming).toContain("The AI sentence.")
    expect(resolved.conflict.current.length).toBeLessThan(80)
  })

  it("inserts a missing intro before a later matching heading", () => {
    const live = htmlToTipTapDoc([
      "<h1>SIBO: o que é, sintomas, causas e tratamento</h1>",
      "<h2>O que é a SIBO</h2>",
      "<p>O sobrecrescimento bacteriano no intestino delgado.</p>",
    ].join(""))
    const patched = htmlToTipTapDoc([
      "<h1>SIBO: o que é, sintomas, causas e tratamento</h1>",
      "<p>Antes de entrar nos detalhes, vale perceber o que é a SIBO e porque importa.</p>",
      "<h2>O que é a SIBO</h2>",
      "<p>O sobrecrescimento bacteriano no intestino delgado.</p>",
    ].join(""))
    const resolved = resolveAiApplyDocument({
      liveDoc: live,
      patchedDoc: patched,
      expectedText: tipTapJsonToPlainText(live),
      requireExactCurrent: true,
    })
    expect(resolved.ok).toBe(true)
    if (!resolved.ok) return
    const text = tipTapJsonToPlainText(resolved.doc)
    expect(text).toMatch(/vale perceber o que é a SIBO[\s\S]*O que é a SIBO/)
    expect(text).toContain("sobrecrescimento bacteriano")
  })

  it("retypes any matching block and inserts missing list items", () => {
    const live = htmlToTipTapDoc([
      "<p>Checklist</p>",
      "<p>Keep this paragraph.</p>",
    ].join(""))
    const patched = htmlToTipTapDoc([
      "<h2>Checklist</h2>",
      "<ul><li>First item</li><li>Second item</li></ul>",
      "<p>Keep this paragraph.</p>",
    ].join(""))
    const resolved = resolveAiApplyDocument({
      liveDoc: live,
      patchedDoc: patched,
      expectedText: "Checklist Keep this paragraph.",
      requireExactCurrent: true,
    })
    expect(resolved.ok).toBe(true)
    if (!resolved.ok) return
    const first = resolved.doc.content?.[0]
    expect(first?.type).toBe("heading")
    expect(first?.attrs?.level).toBe(2)
    expect(tipTapJsonToPlainText(resolved.doc)).toContain("First item")
    expect(tipTapJsonToPlainText(resolved.doc)).toContain("Keep this paragraph.")
  })

  it("localizes a conflict to the colliding phrase, not the whole article", () => {
    const live = [
      "A long unchanged intro about the product stays put.",
      "The user rewrote this sentence.",
      "A long unchanged closing also stays put and must not appear in the conflict chip.",
    ].join(" ")
    const patched = [
      "A long unchanged intro about the product stays put.",
      "The AI sentence.",
      "A long unchanged closing also stays put and must not appear in the conflict chip.",
    ].join(" ")
    const span = localizeApplyConflict({
      expectedText: [
        "A long unchanged intro about the product stays put.",
        "The original sentence.",
        "A long unchanged closing also stays put and must not appear in the conflict chip.",
      ].join(" "),
      liveText: live,
      patchedText: patched,
    })
    expect(span.current).toContain("user rewrote")
    expect(span.incoming).toContain("AI sentence")
    expect(span.current).not.toContain("unchanged closing")
    expect(span.incoming).not.toContain("unchanged closing")
    expect(span.current.length).toBeLessThan(80)
  })
})
