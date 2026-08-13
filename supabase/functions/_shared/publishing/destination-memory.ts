/**
 * Lightweight publishing-destination memory helpers.
 * No selectors, click paths, or Browser Use scripts — semantic URLs + guidance only.
 */

export type PublishingContentTypeKey =
  | "article"
  | "newsletter"
  | "social_post"
  | "landing_page"
  | "other"

export type PublishingDestinationEntryPoints = {
  article?: string
  newsletter?: string
  social_post?: string
  landing_page?: string
  other?: string
}

export type PublishingDestinationMemory = {
  entry_points?: PublishingDestinationEntryPoints
  guidance?: string
  last_successful_entry_url?: string
  last_successful_publication_url?: string
  last_learned_content_type?: PublishingContentTypeKey
  updated_at?: string
}

const CONTENT_TYPE_KEYS: PublishingContentTypeKey[] = [
  "article",
  "newsletter",
  "social_post",
  "landing_page",
  "other",
]

const GENERIC_HOST_BLOCKLIST = new Set([
  "google.com",
  "www.google.com",
  "accounts.google.com",
  "account.squarespace.com",
  "login.squarespace.com",
  "www.facebook.com",
  "facebook.com",
  "login.microsoftonline.com",
  "browser-use.com",
  "api.browser-use.com",
  "live.browser-use.com",
])

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null
}

function asString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null
}

function normalizeUrl(value: unknown): string | null {
  const raw = asString(value)
  if (!raw) return null
  try {
    const parsed = new URL(raw)
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return null
    // Drop hash/query noise for memory keys; keep path.
    parsed.hash = ""
    return parsed.toString()
  } catch {
    return null
  }
}

function hostOf(url: string): string | null {
  try {
    return new URL(url).hostname.toLowerCase()
  } catch {
    return null
  }
}

function pathOf(url: string): string {
  try {
    const path = new URL(url).pathname || "/"
    return path.replace(/\/+$/, "") || "/"
  } catch {
    return "/"
  }
}

export function normalizePublishingContentType(
  value: unknown,
): PublishingContentTypeKey {
  const raw = String(value ?? "").trim().toLowerCase()
  if (!raw) return "article"
  if (raw.includes("newsletter") || raw.includes("email")) return "newsletter"
  if (
    raw.includes("social") ||
    raw.includes("linkedin") ||
    raw.includes("instagram") ||
    raw.includes("facebook") ||
    raw.includes("x_post") ||
    raw.includes("tweet")
  ) {
    return "social_post"
  }
  if (raw.includes("landing") || (raw.includes("page") && !raw.includes("blog"))) {
    return "landing_page"
  }
  if (
    raw.includes("article") ||
    raw.includes("blog") ||
    raw.includes("post") ||
    raw.includes("document") ||
    raw.includes("copy")
  ) {
    return "article"
  }
  return "other"
}

export function parseDestinationMemory(value: unknown): PublishingDestinationMemory {
  const record = asRecord(value) ?? {}
  const entryRaw = asRecord(record.entry_points) ?? asRecord(record.entryPoints) ?? {}
  const entry_points: PublishingDestinationEntryPoints = {}
  for (const key of CONTENT_TYPE_KEYS) {
    const url = normalizeUrl(entryRaw[key])
    if (url) entry_points[key] = url
  }
  const guidance =
    asString(record.guidance) ??
    asString(record.notes) ??
    undefined
  const last_successful_entry_url =
    normalizeUrl(record.last_successful_entry_url) ??
    normalizeUrl(record.lastSuccessfulEntryUrl) ??
    undefined
  const last_successful_publication_url =
    normalizeUrl(record.last_successful_publication_url) ??
    normalizeUrl(record.lastSuccessfulPublicationUrl) ??
    undefined
  const last_learned_content_type = normalizePublishingContentType(
    record.last_learned_content_type ?? record.lastLearnedContentType ?? "other",
  )
  const updated_at = asString(record.updated_at) ?? asString(record.updatedAt) ?? undefined

  const memory: PublishingDestinationMemory = {}
  if (Object.keys(entry_points).length > 0) memory.entry_points = entry_points
  if (guidance) memory.guidance = guidance
  if (last_successful_entry_url) memory.last_successful_entry_url = last_successful_entry_url
  if (last_successful_publication_url) {
    memory.last_successful_publication_url = last_successful_publication_url
  }
  if (record.last_learned_content_type || record.lastLearnedContentType) {
    memory.last_learned_content_type = last_learned_content_type
  }
  if (updated_at) memory.updated_at = updated_at
  return memory
}

/** Public API shape — safe for clients and AI tools. */
export function publicDestinationMemory(
  value: unknown,
): PublishingDestinationMemory {
  return parseDestinationMemory(value)
}

/**
 * Reject temporary Live View / login / homepage / search URLs as entry points.
 */
export function isUsefulPublishingEntryUrl(
  candidate: unknown,
  args?: { defaultStartUrl?: string | null; destinationName?: string | null },
): boolean {
  const url = normalizeUrl(candidate)
  if (!url) return false
  const host = hostOf(url)
  if (!host) return false
  if (host.includes("browser-use")) return false
  if (GENERIC_HOST_BLOCKLIST.has(host)) return false
  if (host.endsWith(".google.com") || host === "google.com") return false

  const path = pathOf(url)
  const pathLower = path.toLowerCase()
  if (
    pathLower.includes("/login") ||
    pathLower.includes("/signin") ||
    pathLower.includes("/sign-in") ||
    pathLower.includes("/auth") ||
    pathLower.includes("/account/login")
  ) {
    return false
  }

  const defaultStart = normalizeUrl(args?.defaultStartUrl)
  if (defaultStart) {
    const defaultHost = hostOf(defaultStart)
    const defaultPath = pathOf(defaultStart)
    // Same as destination default start (often account/login) → not a content entry.
    if (url === defaultStart) return false
    if (defaultHost && host === defaultHost && path === defaultPath) return false
  }

  // Bare site homepage is too generic to be a content-type entry point.
  if (path === "/" || path === "") {
    // Allow only if it clearly looks like a CMS app path host (squarespace config, etc.)
    // Generic marketing homepage → reject.
    if (!host.includes("squarespace.com") && !host.includes("webflow.io") && !pathLower.includes("config")) {
      return false
    }
    if (host.startsWith("www.") || (!host.includes("config") && !host.includes("admin"))) {
      return false
    }
  }

  return true
}

export function resolvePublicationStartUrl(args: {
  memory?: PublishingDestinationMemory | null
  contentType?: unknown
  defaultStartUrl: string
}): {
  startUrl: string
  source: "content_type_entry_point" | "last_successful_entry" | "default_start_url"
} {
  const memory = parseDestinationMemory(args.memory ?? {})
  const contentType = normalizePublishingContentType(args.contentType)
  const defaultStartUrl = normalizeUrl(args.defaultStartUrl) ?? String(args.defaultStartUrl || "").trim()

  const typed = memory.entry_points?.[contentType]
  if (typed && isUsefulPublishingEntryUrl(typed, { defaultStartUrl })) {
    return { startUrl: typed, source: "content_type_entry_point" }
  }

  const last = memory.last_successful_entry_url
  if (
    last &&
    isUsefulPublishingEntryUrl(last, { defaultStartUrl }) &&
    (!memory.last_learned_content_type || memory.last_learned_content_type === contentType)
  ) {
    return { startUrl: last, source: "last_successful_entry" }
  }

  return { startUrl: defaultStartUrl, source: "default_start_url" }
}

export function buildDestinationMemoryPromptBlock(args: {
  destinationName: string
  contentType?: unknown
  memory?: PublishingDestinationMemory | null
  preferredEntryUrl?: string | null
  defaultStartUrl?: string | null
}): string {
  const memory = parseDestinationMemory(args.memory ?? {})
  const contentType = normalizePublishingContentType(args.contentType)
  const entry =
    normalizeUrl(args.preferredEntryUrl) ??
    memory.entry_points?.[contentType] ??
    memory.last_successful_entry_url ??
    null
  const lines = [
    "Publishing destination memory:",
    "",
    `Destination: ${args.destinationName}`,
    `Content type: ${contentType}`,
  ]
  if (entry) {
    lines.push("", "Preferred entry point:", entry)
  } else if (args.defaultStartUrl) {
    lines.push("", "Default start URL:", String(args.defaultStartUrl))
  }
  if (memory.guidance?.trim()) {
    lines.push("", "Guidance:", memory.guidance.trim())
  }
  if (memory.last_successful_publication_url) {
    lines.push(
      "",
      "Previous successful publication URL:",
      memory.last_successful_publication_url,
    )
  }
  lines.push(
    "",
    "Known publishing destination guidance:",
    "",
    `- This destination is ${args.destinationName}.`,
  )
  if (memory.guidance?.trim()) {
    lines.push(`- ${memory.guidance.trim()}`)
  }
  if (entry) {
    lines.push(`- Start from this known article entry point when possible: ${entry}`)
  }
  lines.push(
    "",
    "Use this information to reduce unnecessary navigation.",
    "If the saved entry point is no longer valid, recover semantically using the website and continue the task.",
    "Do not treat this memory as an absolute script. Prefer semantic interaction with the site.",
  )
  return lines.join("\n")
}

export function mergeDestinationMemoryPatch(
  current: unknown,
  patch: unknown,
): PublishingDestinationMemory {
  const base = parseDestinationMemory(current)
  const incoming = asRecord(patch) ?? {}
  const next = { ...base }

  if ("guidance" in incoming) {
    const guidance = asString(incoming.guidance)
    if (guidance) next.guidance = guidance
    else delete next.guidance
  }

  if ("entry_points" in incoming || "entryPoints" in incoming) {
    const entryRaw =
      asRecord(incoming.entry_points) ?? asRecord(incoming.entryPoints) ?? {}
    const entry_points: PublishingDestinationEntryPoints = {
      ...(base.entry_points ?? {}),
    }
    for (const key of CONTENT_TYPE_KEYS) {
      if (!(key in entryRaw)) continue
      const url = normalizeUrl(entryRaw[key])
      if (url) entry_points[key] = url
      else delete entry_points[key]
    }
    if (Object.keys(entry_points).length > 0) next.entry_points = entry_points
    else delete next.entry_points
  }

  if ("last_successful_entry_url" in incoming || "lastSuccessfulEntryUrl" in incoming) {
    const url =
      normalizeUrl(incoming.last_successful_entry_url) ??
      normalizeUrl(incoming.lastSuccessfulEntryUrl)
    if (url) next.last_successful_entry_url = url
    else delete next.last_successful_entry_url
  }

  if (
    "last_successful_publication_url" in incoming ||
    "lastSuccessfulPublicationUrl" in incoming
  ) {
    const url =
      normalizeUrl(incoming.last_successful_publication_url) ??
      normalizeUrl(incoming.lastSuccessfulPublicationUrl)
    if (url) next.last_successful_publication_url = url
    else delete next.last_successful_publication_url
  }

  next.updated_at = new Date().toISOString()
  return next
}

/**
 * Learn entry/publication URLs after a successful editor reach or publish.
 * Conservative: never overwrite a known-good entry with a generic/login URL.
 */
export function learnDestinationMemoryFromRun(args: {
  currentMemory?: unknown
  contentType?: unknown
  entryUrl?: string | null
  publicationUrl?: string | null
  defaultStartUrl?: string | null
}): PublishingDestinationMemory | null {
  const current = parseDestinationMemory(args.currentMemory ?? {})
  const contentType = normalizePublishingContentType(args.contentType)
  let changed = false
  const next: PublishingDestinationMemory = { ...current }

  const entryCandidate = normalizeUrl(args.entryUrl)
  if (
    entryCandidate &&
    isUsefulPublishingEntryUrl(entryCandidate, {
      defaultStartUrl: args.defaultStartUrl,
    })
  ) {
    const existing = current.entry_points?.[contentType]
    if (!existing || existing !== entryCandidate) {
      next.entry_points = {
        ...(current.entry_points ?? {}),
        [contentType]: entryCandidate,
      }
      next.last_successful_entry_url = entryCandidate
      next.last_learned_content_type = contentType
      changed = true
    } else if (current.last_successful_entry_url !== entryCandidate) {
      next.last_successful_entry_url = entryCandidate
      next.last_learned_content_type = contentType
      changed = true
    }
  }

  const publicationCandidate = normalizeUrl(args.publicationUrl)
  if (
    publicationCandidate &&
    !publicationCandidate.includes("browser-use") &&
    hostOf(publicationCandidate) &&
    !GENERIC_HOST_BLOCKLIST.has(hostOf(publicationCandidate)!)
  ) {
    if (current.last_successful_publication_url !== publicationCandidate) {
      next.last_successful_publication_url = publicationCandidate
      changed = true
    }
  }

  if (!changed) return null
  next.updated_at = new Date().toISOString()
  return next
}

/**
 * If Browser Use asks a clarification that destination memory already answers,
 * return a short instruction to continue without interrupting the user.
 */
export function resolveAutoAnswerFromDestinationMemory(args: {
  question?: string | null
  memory?: PublishingDestinationMemory | null
  contentType?: unknown
}): string | null {
  const question = String(args.question ?? "").trim()
  if (!question) return null
  const memory = parseDestinationMemory(args.memory ?? {})
  const guidance = memory.guidance?.trim() ?? ""
  if (!guidance) return null

  const q = question.toLowerCase()
  // Collection / section ambiguity (Blog vs Insights vs News, etc.)
  const looksLikeCollectionChoice =
    (q.includes("blog") || q.includes("insights") || q.includes("news") || q.includes("collection") || q.includes("section")) &&
    (q.includes("which") || q.includes("?") || q.includes("cannot") || q.includes("can't") || q.includes("unsure") || q.includes("determine"))

  if (!looksLikeCollectionChoice) return null

  const guidanceLower = guidance.toLowerCase()
  const mentioned: Array<{ label: string; needle: string }> = [
    { label: "Blog", needle: "blog" },
    { label: "Insights", needle: "insights" },
    { label: "News", needle: "news" },
  ]
  const preferred = mentioned.find((item) => guidanceLower.includes(item.needle))
  if (!preferred) return null

  // Only auto-answer when the question also mentions that option or peer options.
  const questionMentionsOption = mentioned.some((item) => q.includes(item.needle))
  if (!questionMentionsOption) return null

  return `Use the ${preferred.label} collection/section. Destination guidance already specifies this.`
}
