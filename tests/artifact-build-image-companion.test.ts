import { describe, expect, it } from "vitest"
import {
  expandDocumentImageCompanions,
  instructionAsksForImage,
} from "../supabase/functions/_shared/artifact-build-image-companion"

describe("expandDocumentImageCompanions", () => {
  it("detects a Portuguese find-image request", () => {
    expect(instructionAsksForImage("troca a frase e procura uma imagem para o artigo")).toBe(true)
    expect(instructionAsksForImage("corrige só o título")).toBe(false)
  })

  it("adds a companion image spec in the same plan", () => {
    const expanded = expandDocumentImageCompanions([
      {
        handle: "cegid_article",
        operation: "update",
        artifact_id: "1009dbb8-32a0-4a01-ae52-9151d2f228b5",
        artifact_type: "document",
        title: "X problemas que uma app de software de gestão de ativos resolve no terreno",
        instruction: "Substitui a frase e procura uma imagem para o artigo",
        task_id: 13629,
        priority: 100,
      },
    ])
    expect(expanded).toHaveLength(2)
    expect(expanded[0]?.artifact_type).toBe("document")
    expect(expanded[1]).toMatchObject({
      handle: "cegid_article_image",
      operation: "create",
      artifact_type: "image",
      task_id: 13629,
      source_artifact_id: "1009dbb8-32a0-4a01-ae52-9151d2f228b5",
    })
    expect(expanded[1]?.depends_on_handles).toEqual([])
  })

  it("does not add an image when the current request only asks for a text replace", () => {
    const expanded = expandDocumentImageCompanions(
      [
        {
          handle: "cegid_article",
          operation: "update",
          artifact_id: "1009dbb8-32a0-4a01-ae52-9151d2f228b5",
          artifact_type: "document",
          title: "Artigo",
          instruction: [
            "[ARTICULATE_LEARNED_PREFERENCES_V1]",
            "Preferir imagens quando o utilizador pedir um artigo novo.",
            "[/ARTICULATE_LEARNED_PREFERENCES_V1]",
            "",
            "CURRENT USER REQUEST:",
            'podes trocar "app de software de gestão de ativos" por software de gestão de ativos?',
          ].join("\n"),
        },
      ],
      {
        requestText: [
          "[ARTICULATE_LEARNED_PREFERENCES_V1]",
          "Preferir imagens quando o utilizador pedir um artigo novo.",
          "[/ARTICULATE_LEARNED_PREFERENCES_V1]",
          "",
          "CURRENT USER REQUEST:",
          'podes trocar "app de software de gestão de ativos" por software de gestão de ativos?',
        ].join("\n"),
      },
    )
    expect(expanded).toHaveLength(1)
    expect(expanded[0]?.artifact_type).toBe("document")
  })

  it("does not add a second image when the plan already has one", () => {
    const expanded = expandDocumentImageCompanions([
      {
        handle: "article",
        operation: "update",
        artifact_type: "document",
        title: "Artigo",
        instruction: "Edita o texto e procura uma imagem",
      },
      {
        handle: "hero",
        operation: "create",
        artifact_type: "image",
        title: "Hero",
        instruction: "Gera a imagem",
      },
    ])
    expect(expanded).toHaveLength(2)
  })
})
