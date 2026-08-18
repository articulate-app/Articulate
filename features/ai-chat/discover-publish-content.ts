export type PublishContentDiscovery = {
  publicationRunId: string
  liveViewUrl: string | null
  destinationId: string | null
  destinationName: string | null
  artifactId: string | null
  status: string | null
  /** When true, auto-activate the right-pane Browser tab (legacy). Default false — show chat preview. */
  openBrowserTab: boolean
  showBrowserPreview: boolean
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null
}

function asString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null
}

function fromToolResult(row: unknown): PublishContentDiscovery | null {
  const record = asRecord(row)
  if (!record) return null
  const name = asString(record.name) ?? asString(record.tool_name)
  const publishingTools = new Set([
    "publish_content",
    "configure_publishing_destination",
    "continue_publication",
    "confirm_publication",
    "get_publication_state",
    "publish_scheduled_now",
    "cancel_scheduled_publication",
  ])
  if (!name || !publishingTools.has(name)) return null
  if (record.ok === false) return null
  // Persisted tool_results often only keep a compact data_summary (not full `data`).
  const data =
    asRecord(record.data) ??
    asRecord(record.data_summary) ??
    asRecord(record.result) ??
    record
  const nestedRun = asRecord(data.run) ?? asRecord(data.active_run)
  const publicationRunId =
    asString(data.publication_run_id) ??
    asString(data.publicationRunId) ??
    asString(nestedRun?.id)
  // Configure-only connect: synthesize a stable preview key from destination + connect run.
  const destinationId =
    asString(data.destination_id) ??
    asString(data.destinationId) ??
    asString(nestedRun?.destination_id)
  const connectRunId =
    asString(data.connect_run_id) ?? asString(data.connectRunId)
  const previewKey =
    publicationRunId ||
    (destinationId && connectRunId
      ? `connect:${destinationId}:${connectRunId}`
      : destinationId && asString(data.live_view_url)
        ? `connect:${destinationId}`
        : null)
  if (!previewKey) return null

  const status = asString(data.status) ?? asString(nestedRun?.status)
  const showBrowserPreview =
    data.show_browser_preview === true ||
    data.showBrowserPreview === true ||
    status === "scheduled" ||
    name === "publish_content" ||
    name === "configure_publishing_destination" ||
    name === "continue_publication" ||
    name === "confirm_publication" ||
    name === "publish_scheduled_now"

  if (!showBrowserPreview && data.open_browser_tab !== true) return null

  return {
    publicationRunId: previewKey,
    liveViewUrl:
      asString(data.live_view_url) ??
      asString(data.liveViewUrl) ??
      asString(nestedRun?.live_view_url),
    destinationId,
    destinationName:
      asString(data.destination_name) ??
      asString(data.destinationName) ??
      asString(asRecord(nestedRun?.metadata)?.destination_name),
    artifactId:
      asString(data.artifact_id) ??
      asString(data.artifactId) ??
      asString(nestedRun?.artifact_id),
    status,
    openBrowserTab: data.open_browser_tab === true || data.openBrowserTab === true,
    showBrowserPreview: true,
  }
}

/** Extract publishing tool results that should show a chat browser preview / Browser tab. */
export function discoverPublishContentFromMessageContentJson(
  contentJson: unknown,
): PublishContentDiscovery[] {
  if (!contentJson || typeof contentJson !== "object") return []
  const root = contentJson as Record<string, unknown>
  const found = new Map<string, PublishContentDiscovery>()
  const richness = (item: PublishContentDiscovery) =>
    (item.liveViewUrl ? 4 : 0)
    + (item.destinationId ? 2 : 0)
    + (item.destinationName ? 1 : 0)
    + (item.status ? 1 : 0)
  const remember = (item: PublishContentDiscovery | null) => {
    if (!item) return
    const existing = found.get(item.publicationRunId)
    if (!existing || richness(item) >= richness(existing)) {
      found.set(item.publicationRunId, item)
    }
  }

  const scanList = (value: unknown) => {
    if (!Array.isArray(value)) return
    for (const row of value) remember(fromToolResult(row))
  }

  // Live stream may attach a compact publishing_preview before full tool_results land.
  const publishingPreview = asRecord(root.publishing_preview)
  if (publishingPreview) {
    remember(
      fromToolResult({
        name: asString(publishingPreview.tool_name) ?? "publish_content",
        ok: publishingPreview.ok !== false,
        data_summary: publishingPreview,
      }),
    )
  }
  scanList(root.tool_results)
  const messageOutput = asRecord(root.message_output)
  if (messageOutput) scanList(messageOutput.tool_results)
  remember(fromToolResult(root))

  return Array.from(found.values())
}

/**
 * When stream finalize replaces message body with text blocks, keep durable
 * metadata (tool_results / publishing_preview / clarification) so chat cards
 * like PublicationBrowserPreviewCard still discover.
 */
export function mergeAssistantContentJsonPreservingMeta(
  existing: unknown,
  nextBlocks: unknown[],
  extras?: Record<string, unknown> | null,
): unknown {
  const existingRecord = asRecord(existing)
  const extrasRecord = extras ? asRecord(extras) : null
  const toolResults =
    (Array.isArray(extrasRecord?.tool_results) ? extrasRecord?.tool_results : null)
    ?? (Array.isArray(existingRecord?.tool_results) ? existingRecord?.tool_results : null)
  const publishingPreview =
    asRecord(extrasRecord?.publishing_preview)
    ?? asRecord(existingRecord?.publishing_preview)
  const browserPreview =
    asRecord(extrasRecord?.browser_preview)
    ?? asRecord(existingRecord?.browser_preview)
  const clarification =
    extrasRecord?.clarification_request
    ?? existingRecord?.clarification_request
    ?? null
  const outputKind =
    asString(extrasRecord?.output_kind)
    ?? asString(existingRecord?.output_kind)
  const uiVisibility =
    asString(extrasRecord?.ui_visibility)
    ?? asString(existingRecord?.ui_visibility)
  const buildIds =
    (Array.isArray(extrasRecord?.build_ids) ? extrasRecord?.build_ids : null)
    ?? (Array.isArray(existingRecord?.build_ids) ? existingRecord?.build_ids : null)

  const hasMeta =
    Boolean(toolResults?.length)
    || Boolean(publishingPreview)
    || Boolean(browserPreview)
    || Boolean(clarification)
    || Boolean(outputKind)
    || Boolean(uiVisibility)
    || Boolean(buildIds?.length)

  if (!hasMeta) {
    return nextBlocks
  }

  return {
    ...(existingRecord ?? {}),
    ...(extrasRecord ?? {}),
    blocks: nextBlocks,
    ...(toolResults ? { tool_results: toolResults } : {}),
    ...(publishingPreview ? { publishing_preview: publishingPreview } : {}),
    ...(browserPreview ? { browser_preview: browserPreview } : {}),
    ...(clarification ? { clarification_request: clarification } : {}),
    ...(outputKind ? { output_kind: outputKind } : {}),
    ...(uiVisibility ? { ui_visibility: uiVisibility } : {}),
    ...(buildIds ? { build_ids: buildIds } : {}),
  }
}

/** Compact tool_result row suitable for attaching to in-flight assistant messages. */
export function publishingPreviewToToolResult(preview: Record<string, unknown>): Record<string, unknown> {
  return {
    name: asString(preview.tool_name) ?? asString(preview.name) ?? "publish_content",
    ok: preview.ok !== false,
    skipped: false,
    error: asString(preview.error),
    data_summary: {
      publication_run_id:
        asString(preview.publication_run_id) ?? asString(preview.publicationRunId),
      destination_id:
        asString(preview.destination_id) ?? asString(preview.destinationId),
      destination_name:
        asString(preview.destination_name) ?? asString(preview.destinationName),
      artifact_id: asString(preview.artifact_id) ?? asString(preview.artifactId),
      status: asString(preview.status),
      live_view_url: asString(preview.live_view_url) ?? asString(preview.liveViewUrl),
      connect_run_id: asString(preview.connect_run_id) ?? asString(preview.connectRunId),
      show_browser_preview: true,
      open_browser_tab:
        preview.open_browser_tab === true || preview.openBrowserTab === true,
      needs_authentication:
        preview.needs_authentication === true || preview.needsAuthentication === true,
      continuing_publication:
        preview.continuing_publication === true || preview.continuingPublication === true,
    },
  }
}
