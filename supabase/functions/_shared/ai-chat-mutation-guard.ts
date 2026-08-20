export function extractCurrentUserRequest(text: string): string {
  const value = String(text ?? "")
  const marked = value.match(/CURRENT USER REQUEST:\s*([\s\S]+)$/i)
  if (marked?.[1]?.trim()) return marked[1].trim()
  const stripped = value
    .replace(/\[ARTICULATE_LEARNED_PREFERENCES_V1\][\s\S]*?\[\/ARTICULATE_LEARNED_PREFERENCES_V1\]/g, "")
    .trim()
  return stripped || value.trim()
}

export function isMutatingToolName(name: unknown): boolean {
  const toolName = String(name ?? "").trim()
  return /^(?:ai_(?:update|create|save|attach|restore|duplicate|bulk_update|bulk_create|manage|start_artifact_build|set_agent_run_state)|configure_publishing_destination|publish_content|update_publication_progress|continue_publication|confirm_publication|cancel_publication|reschedule_publication|cancel_scheduled_publication|publish_scheduled_now)/.test(toolName)
}

export function hasSuccessfulMutation(toolResults: unknown[]): boolean {
  return (Array.isArray(toolResults) ? toolResults : []).some((result) => {
    const row = result && typeof result === "object"
      ? result as { ok?: unknown; skipped?: unknown; name?: unknown }
      : null
    return row?.ok === true && row?.skipped !== true && isMutatingToolName(row?.name)
  })
}

/** True when the model announced a write that never started — retry the tool loop once. */
export function shouldRetryForUngroundedWriteClaim(args: {
  assistantText: string
  toolResults: unknown[]
  alreadyRetried: boolean
}): boolean {
  if (args.alreadyRetried) return false
  if (hasSuccessfulMutation(args.toolResults)) return false
  return claimsQueuedOrCompletedWrite(args.assistantText)
}

export function claimsQueuedOrCompletedWrite(text: string): boolean {
  const value = String(text ?? "").trim()
  if (!value) return false
  return /\b(?:corrigi|alterei|atualizei|associei|vinculei|liguei|anexei|adicionei|acrescentei|criei|criada|criado|removi|eliminei|apaguei|guardei|gravei|publiquei|reagendei|cancelei|restaurei|dupliquei|configurei|enviei|pedi(?:do)?|fixed|changed|updated|attached|linked|created|removed|deleted|saved|published|rescheduled|cancelled|canceled|restored|duplicated|configured|requested|queued|sent)\b/i.test(value)
    || /(?:task|tarefa|projeto|project)\s+criad/i.test(value)
    || /pedido de atualiza/i.test(value)
    || /atualiza\w+ enviad/i.test(value)
    || /artifact card vai refletir/i.test(value)
    || /update was requested/i.test(value)
    || /\ba aplicar\b/i.test(value)
    || /\bvou (?:acrescent|adicion|inser|aplic|escrev)/i.test(value)
    || /atualiza-se em seguida/i.test(value)
    || /documento atualiza/i.test(value)
}

function successfulCreateHasPersistedId(toolResults: unknown[]): boolean {
  return (Array.isArray(toolResults) ? toolResults : []).some((result) => {
    const row = result && typeof result === "object"
      ? result as { ok?: unknown; skipped?: unknown; name?: unknown; data?: unknown }
      : null
    if (row?.ok !== true || row?.skipped === true) return false
    if (!/ai_(?:create_task|bulk_create_tasks|create_project|duplicate_task)/.test(String(row.name ?? ""))) {
      return false
    }
    const data = row.data && typeof row.data === "object" ? row.data as Record<string, unknown> : null
    const created = Array.isArray(data?.created) ? data.created : []
    return Boolean(
      data?.task_id
      || data?.project_id
      || data?.id
      || created.some((item) => item && typeof item === "object" && (item as { task_id?: unknown }).task_id),
    )
  })
}

function stripArtifactAppLinks(text: string): string {
  return String(text ?? "")
    .replace(/\[[^\]]*\]\(app:\/\/artifact\/[^)]+\)/gi, " ")
    .replace(/app:\/\/artifact\/[0-9a-f-]+/gi, " ")
}

export function containsInternalImplementationSpeak(text: string): boolean {
  const value = stripArtifactAppLinks(text)
  if (!value.trim()) return false
  return /cartão do artifact|artifact card/i.test(value)
    || /\b(?:worker|work unit|orchestrat(?:or|ed)?|rpc|ydoc|yjs|tiptap|supabase|edge function|idempotenc\w*|lease[_ ]token|build_id|unit_id|ai_start_artifact|enfileirad\w*|revision_conflict)\b/i.test(value)
    || /\(\s*id\s+\d{3,}\s*\)/i.test(value)
    || /\bid\s+\d{4,}\b/i.test(value)
}

export function rewriteInternalImplementationSpeak(text: string): { text: string; changed: boolean } {
  const value = String(text ?? "").trim()
  if (!containsInternalImplementationSpeak(value)) return { text: value, changed: false }
  const cleaned = value
    .replace(/cartão do artifact|artifact card/gi, "artigo")
    .replace(/\b(?:worker|work unit|orchestrat(?:or|ed)?|rpc|ydoc|yjs|tiptap|supabase|edge function|idempotenc\w*|lease[_ ]token|build_id|unit_id|ai_start_artifact|enfileirad\w*|revision_conflict)\b/gi, "")
    .replace(/\(\s*id\s+\d{3,}\s*\)/gi, "")
    .replace(/\bid\s+\d{4,}\b/gi, "")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
  if (cleaned && !containsInternalImplementationSpeak(cleaned)) {
    return { changed: true, text: cleaned }
  }
  return { text: value, changed: false }
}

export function userFacingBuildFailure(codeOrMessage: string | null | undefined): string {
  const value = String(codeOrMessage ?? "").trim()
  if (/revision_conflict|expected_text_mismatch/i.test(value)) {
    return "The document changed while this update was being applied. Nothing was overwritten."
  }
  if (/ydoc_conversion_mismatch|artifact_not_saved/i.test(value)) {
    return "The update could not be applied."
  }
  if (/editorial_title_required/i.test(value)) {
    return "Could not start the update because the document title was missing."
  }
  if (!value || /work unit failed|artifact_/i.test(value)) {
    return "The update could not be applied."
  }
  if (containsInternalImplementationSpeak(value)) {
    return "The update could not be applied."
  }
  return value
}

export function guardUngroundedMutationClaim(text: string, toolResults: unknown[]): { text: string; changed: boolean } {
  const value = String(text ?? "").trim()
  if (!value) return { text: value, changed: false }
  const results = Array.isArray(toolResults) ? toolResults : []
  if (hasSuccessfulMutation(results)) {
    if (
      /(?:task|tarefa|projeto|project)\s+criad|\bcriei\s+(?:a\s+|uma\s+)?(?:task|tarefa|projeto)|(?:created|i created)\s+(?:a\s+|the\s+)?(?:task|project)/i.test(value)
      && !successfulCreateHasPersistedId(results)
    ) {
      const looksPortuguese = /[áàâãéêíóôõúç]/i.test(value) || /\b(?:criei|criada|tarefa|projeto)\b/i.test(value)
      return {
        changed: true,
        text: looksPortuguese
          ? "Não consegui criar o registo pedido. Nenhuma task ou projeto novo ficou gravado."
          : "I could not create the requested record. No new task or project was saved.",
      }
    }
    return { text: value, changed: false }
  }
  if (!claimsQueuedOrCompletedWrite(value)) return { text: value, changed: false }
  const looksPortuguese = /[áàâãéêíóôõúç]/i.test(value)
    || /\b(?:corrigi|alterei|atualizei|associei|vinculei|adicionei|acrescentei|enviei|pedido)\b/i.test(value)
  return {
    changed: true,
    text: looksPortuguese
      ? "Não consegui aplicar a alteração pedida. Nenhuma operação de escrita foi concluída e nada foi alterado."
      : "I could not apply the requested change. No write operation completed and nothing was changed.",
  }
}

function asUuid(value: unknown): string | null {
  const text = String(value ?? "").trim()
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(text) ? text : null
}

export function extractMentionedArtifactId(text: string): string | null {
  const match = String(text ?? "").match(/app:\/\/artifact\/([0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})/i)
  return match?.[1] ?? null
}

export function resolveForcedArtifactTarget(args: {
  selectedArtifactId?: string | null
  selectedTitle?: string | null
  centerArtifactId?: string | null
  centerTitle?: string | null
  mentionedArtifactId?: string | null
  recentArtifacts?: Array<{ id?: string | null; title?: string | null }>
}): { id: string; title: string | null } | null {
  const selected = asUuid(args.selectedArtifactId)
  if (selected) return { id: selected, title: args.selectedTitle ?? null }
  const center = asUuid(args.centerArtifactId)
  if (center) return { id: center, title: args.centerTitle ?? null }
  const mentioned = asUuid(args.mentionedArtifactId)
  if (mentioned) {
    const match = (args.recentArtifacts ?? []).find((row) => asUuid(row.id) === mentioned)
    return { id: mentioned, title: match?.title ?? null }
  }
  const recent = (args.recentArtifacts ?? []).filter((row) =>
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(row.id ?? ""))
  )
  if (recent.length === 1) {
    return { id: String(recent[0]!.id), title: recent[0]!.title ?? null }
  }
  return null
}
