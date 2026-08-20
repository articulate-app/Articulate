import { describe, expect, it } from "vitest"
import {
  extractCurrentUserRequest,
  guardUngroundedMutationClaim,
  rewriteInternalImplementationSpeak,
  resolveForcedArtifactTarget,
  shouldRetryForUngroundedWriteClaim,
} from "../supabase/functions/_shared/ai-chat-mutation-guard"

describe("ai chat mutation guard", () => {
  it("retries when the model announced a write without calling a tool", () => {
    expect(shouldRetryForUngroundedWriteClaim({
      assistantText: 'A aplicar o ajuste: vou acrescentar uma frase introdutória. O documento atualiza-se em seguida.',
      toolResults: [],
      alreadyRetried: false,
    })).toBe(true)
    expect(shouldRetryForUngroundedWriteClaim({
      assistantText: "A aplicar o ajuste.",
      toolResults: [{ name: "ai_start_artifact_build", ok: true, skipped: false }],
      alreadyRetried: false,
    })).toBe(false)
    expect(shouldRetryForUngroundedWriteClaim({
      assistantText: "A aplicar o ajuste.",
      toolResults: [],
      alreadyRetried: true,
    })).toBe(false)
  })

  it("rewrites a promised apply when no write tool ran", () => {
    const result = guardUngroundedMutationClaim(
      'A aplicar o ajuste: vou acrescentar uma frase introdutória curta após o H2 "O que é a SIBO". O documento atualiza-se em seguida.',
      [],
    )
    expect(result.changed).toBe(true)
    expect(result.text).toContain("nada foi alterado")
  })

  it("strips learned preferences from the current user request", () => {
    const wrapped = [
      "[ARTICULATE_LEARNED_PREFERENCES_V1]",
      "LEARNED PREFERENCES — acrescentar a frase só quando o utilizador pedir.",
      "[/ARTICULATE_LEARNED_PREFERENCES_V1]",
      "",
      "CURRENT USER REQUEST:",
      'ainda vejo referencias a "app de software de gestão de ativos". podes trocar por software de gestão de ativos?',
    ].join("\n")
    expect(extractCurrentUserRequest(wrapped)).toContain("podes trocar")
  })

  it("rewrites a created-task claim when no task id was persisted", () => {
    const result = guardUngroundedMutationClaim(
      "Task criada no projeto Cegid, atribuída ao Ivo Relvas.\n\nProjeto: \nTask: ",
      [{ name: "ai_create_task", ok: true, skipped: false, data: {} }],
    )
    expect(result.changed).toBe(true)
    expect(result.text).toContain("Nenhuma task")
  })

  it("rewrites a queued-update claim when no tool ran", () => {
    const result = guardUngroundedMutationClaim(
      "Pedido de atualização enviado para acrescentar a frase “olá, tudo bem?”. A artifact card vai refletir o resultado quando o worker concluir.",
      [],
    )
    expect(result.changed).toBe(true)
    expect(result.text).toContain("nada foi alterado")
  })

  it("rewrites leaked numeric ids as internal speak", () => {
    const result = rewriteInternalImplementationSpeak(
      "Tarefa criada (id 13633) e o artigo está em produção.",
    )
    expect(result.changed).toBe(true)
    expect(result.text).not.toMatch(/\bid\s+\d+/i)
    expect(result.text).toContain("Tarefa criada")
  })

  it("keeps a normal reply that only mentions an artifact link", () => {
    const result = rewriteInternalImplementationSpeak(
      "A reforçar as FAQs com perguntas reais.\n\n[SIBO](app://artifact/3dcd2b1d-68a7-4dbf-88f8-50ab0a5fd1b7)",
    )
    expect(result.changed).toBe(false)
    expect(result.text).toContain("FAQs")
  })

  it("keeps the model reply when a document update was queued", () => {
    const result = guardUngroundedMutationClaim(
      "Vou corrigir os acentos em todo o artigo.",
      [{ name: "ai_start_artifact_build", ok: true, skipped: false }],
    )
    expect(result.changed).toBe(false)
    expect(result.text).toBe("Vou corrigir os acentos em todo o artigo.")
  })

  it("rewrites internal implementation speak even when a write started", () => {
    const result = rewriteInternalImplementationSpeak(
      "Pedido de atualização enviado para o worker. Quando ficar pronto, a alteração aparece no cartão do artifact.",
    )
    expect(result.changed).toBe(true)
    expect(result.text).not.toMatch(/worker|artifact/i)
    expect(result.text).toContain("artigo")
    expect(result.text).not.toBe("A aplicar a alteração no artigo. O documento mostra o resultado quando ficar pronto.")
  })

  it("does not replace queued-build narration with a canned sentence", () => {
    const result = guardUngroundedMutationClaim(
      "Corrigindo os acentos no artigo agora.",
      [{ name: "ai_start_artifact_build", ok: true, skipped: false }],
    )
    expect(result.changed).toBe(false)
    expect(result.text).toBe("Corrigindo os acentos no artigo agora.")
  })

  it("keeps a persisted document write reply", () => {
    const result = guardUngroundedMutationClaim(
      "Updated the article.",
      [{ name: "ai_save_artifact", ok: true, skipped: false }],
    )
    expect(result.changed).toBe(false)
  })

  it("prefers the open center artifact over recent thread artifacts", () => {
    const target = resolveForcedArtifactTarget({
      centerArtifactId: "cafe2fdb-1b26-4612-aca2-163a36d6639d",
      centerTitle: "COLLAB TEST",
      recentArtifacts: [{ id: "11111111-1111-4111-8111-111111111111", title: "Other" }],
    })
    expect(target?.id).toBe("cafe2fdb-1b26-4612-aca2-163a36d6639d")
  })
})
