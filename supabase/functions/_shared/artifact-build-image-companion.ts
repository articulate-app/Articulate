const IMAGE_TYPES = new Set([
  "image",
  "images",
  "illustration",
  "photo",
  "visual",
  "article_with_images",
  "document_with_images",
  "mixed",
  "video",
  "video_clip",
])

export function instructionAsksForImage(text: string): boolean {
  const value = String(text ?? "")
  if (!value.trim()) return false
  const mentionsImage = /\b(imagem|imagens|image|images|foto|fotos|photograph|visual|ilustra\w*|artwork)\b/i.test(value)
  if (!mentionsImage) return false
  return (
    /\b(procur[aeo]\w*|busca\w*|encontr[aeo]\w*|find|search|ger[ae]\w*|generate|cri[ae]\w*|create|add|adicion\w*|inclu\w*|preciso|need|quero|want|para o artigo|for the article)\b/i.test(value)
    || /procura uma imagem/i.test(value)
  )
}

function artifactTypeOf(spec: { artifact_type?: unknown }): string {
  return String(spec.artifact_type ?? "document").trim().toLowerCase()
}

function hasImagePlan(spec: { artifact_type?: unknown; media_items?: unknown }): boolean {
  if (IMAGE_TYPES.has(artifactTypeOf(spec))) return true
  return Array.isArray(spec.media_items) && spec.media_items.length > 0
}

function uniqueHandle(base: string, used: Set<string>): string {
  const root = String(base || "artifact_image").replace(/_image(?:_\d+)?$/, "") || "artifact"
  let handle = `${root}_image`.slice(0, 100)
  let index = 2
  while (used.has(handle)) {
    handle = `${root}_image_${index}`.slice(0, 100)
    index += 1
  }
  return handle
}

function extractCurrentUserRequest(text: string): string {
  const value = String(text ?? "")
  const marked = value.match(/CURRENT USER REQUEST:\s*([\s\S]+)$/i)
  if (marked?.[1]?.trim()) return marked[1].trim()
  const stripped = value
    .replace(/\[ARTICULATE_LEARNED_PREFERENCES_V1\][\s\S]*?\[\/ARTICULATE_LEARNED_PREFERENCES_V1\]/g, "")
    .trim()
  return stripped || value.trim()
}

export function expandDocumentImageCompanions<T extends Record<string, any>>(
  specs: T[],
  options?: { requestText?: string | null },
): T[] {
  const rows = Array.isArray(specs) ? specs : []
  if (rows.length === 0) return rows
  if (rows.some((spec) => hasImagePlan(spec))) return rows
  const requestText = extractCurrentUserRequest(String(options?.requestText ?? ""))
  if (requestText && !instructionAsksForImage(requestText)) return rows

  const used = new Set(rows.map((spec) => String(spec.handle ?? "").trim()).filter(Boolean))
  const extras: T[] = []
  for (const spec of rows) {
    const text = requestText || extractCurrentUserRequest(
      [spec.instruction, spec.title, spec.request_text].filter(Boolean).join("\n"),
    )
    if (!instructionAsksForImage(text)) continue
    const handle = uniqueHandle(String(spec.handle ?? "artifact"), used)
    used.add(handle)
    const titleBase = String(spec.title ?? "").trim() || "artigo"
    extras.push({
      ...spec,
      handle,
      artifact_id: null,
      operation: "create",
      artifact_type: "image",
      artifact_role: "article_image",
      title: `Imagem — ${titleBase}`.slice(0, 240),
      source_artifact_id: spec.artifact_id ?? null,
      source_ids: Array.isArray(spec.source_ids) ? spec.source_ids : [],
      source_version_number: null,
      source_handle: spec.artifact_id ? null : spec.handle,
      derivation_type: "generated_from",
      depends_on_handles: spec.artifact_id ? [] : [spec.handle].filter(Boolean),
      instruction: [
        `Procura ou gera uma imagem adequada para o artigo "${titleBase}".`,
        String(spec.instruction ?? "").trim(),
      ].filter(Boolean).join("\n").slice(0, 30000),
      priority: Number(spec.priority ?? 100) + 10,
      metadata: {
        ...(spec.metadata && typeof spec.metadata === "object" ? spec.metadata : {}),
        reason: "Companion image requested in the same run as a document edit.",
        companion_of: spec.handle,
      },
      selection: null,
      media_items: null,
    })
  }
  return extras.length ? [...rows, ...extras] : rows
}
