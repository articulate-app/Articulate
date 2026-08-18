export type AiBrowserDiscovery = {
  browserSessionId: string
  browserId: string | null
  sessionId: string | null
  liveViewUrl: string | null
  startUrl: string | null
  currentUrl: string | null
  title: string | null
  provider: string | null
  browserLabel: string | null
  status: string | null
  showBrowserPreview: boolean
  openBrowserTab: boolean
  desktopRequired: boolean
  desktopCommand: {
    command: string
    url: string | null
    instruction: string | null
    selector: string | null
    text: string | null
    index: number | null
    key: string | null
    clear: boolean
    deltaX: number | null
    deltaY: number | null
    ms: number | null
    browserId: string | null
    browserSessionId: string | null
    expectObservation: boolean
  } | null
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null
}

function asString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null
}

const BROWSER_TOOLS = new Set(["open_browser", "use_browser"])

function richness(item: AiBrowserDiscovery): number {
  return (
    (item.liveViewUrl ? 4 : 0)
    + (item.browserId ? 2 : 0)
    + (item.currentUrl ? 1 : 0)
    + (item.desktopCommand ? 1 : 0)
    + (item.title ? 1 : 0)
  )
}

function fromToolResult(row: unknown): AiBrowserDiscovery | null {
  const record = asRecord(row)
  if (!record) return null
  const name = asString(record.name) ?? asString(record.tool_name)
  if (!name || !BROWSER_TOOLS.has(name)) return null
  if (record.ok === false) return null
  const data =
    asRecord(record.data) ??
    asRecord(record.data_summary) ??
    asRecord(record.result) ??
    record
  const desktopBrowser = asRecord(data.desktop_browser)
  const desktopCommand = asRecord(data.desktop_command)
  const browserSessionId =
    asString(data.browser_session_id) ??
    asString(data.browserSessionId) ??
    asString(data.browser_id) ??
    asString(data.browserId)
  if (!browserSessionId) return null

  return {
    browserSessionId,
    browserId: asString(data.browser_id) ?? asString(data.browserId),
    sessionId: asString(data.session_id) ?? asString(data.sessionId),
    liveViewUrl: asString(data.live_view_url) ?? asString(data.liveViewUrl),
    startUrl: asString(data.start_url) ?? asString(data.startUrl),
    currentUrl:
      asString(data.current_url) ??
      asString(data.currentUrl) ??
      asString(data.url) ??
      asString(data.start_url),
    title: asString(data.title),
    provider: asString(data.provider),
    browserLabel: asString(data.browser_label) ?? asString(data.browserLabel),
    status: asString(data.status),
    showBrowserPreview: data.show_browser_preview !== false,
    openBrowserTab: data.open_browser_tab === true || name === "open_browser",
    desktopRequired:
      desktopBrowser?.required === true || desktopCommand?.required === true,
    desktopCommand: desktopCommand
      ? {
          command: asString(desktopCommand.command) ?? "status",
          url: asString(desktopCommand.url),
          instruction: asString(desktopCommand.instruction),
          selector: asString(desktopCommand.selector),
          text: asString(desktopCommand.text),
          index: Number.isFinite(Number(desktopCommand.index)) ? Number(desktopCommand.index) : null,
          key: asString(desktopCommand.key),
          clear: desktopCommand.clear === true,
          deltaX: Number.isFinite(Number(desktopCommand.delta_x ?? desktopCommand.deltaX))
            ? Number(desktopCommand.delta_x ?? desktopCommand.deltaX)
            : null,
          deltaY: Number.isFinite(Number(desktopCommand.delta_y ?? desktopCommand.deltaY))
            ? Number(desktopCommand.delta_y ?? desktopCommand.deltaY)
            : null,
          ms: Number.isFinite(Number(desktopCommand.ms)) ? Number(desktopCommand.ms) : null,
          browserId: asString(desktopCommand.browser_id),
          browserSessionId: asString(desktopCommand.browser_session_id),
          expectObservation: desktopCommand.expect_observation === true || data.expect_observation === true,
        }
      : null,
  }
}

export function discoverAiBrowserFromMessageContentJson(
  contentJson: unknown,
): AiBrowserDiscovery[] {
  const root = asRecord(contentJson)
  if (!root) return []
  const found = new Map<string, AiBrowserDiscovery>()
  const remember = (item: AiBrowserDiscovery | null) => {
    if (!item) return
    const existing = found.get(item.browserSessionId)
    if (!existing || richness(item) >= richness(existing)) {
      found.set(item.browserSessionId, item)
    }
  }

  const scanList = (value: unknown) => {
    if (!Array.isArray(value)) return
    for (const row of value) remember(fromToolResult(row))
  }

  const browserPreview = asRecord(root.browser_preview)
  if (browserPreview) {
    remember(
      fromToolResult({
        name: asString(browserPreview.tool_name) ?? "open_browser",
        ok: browserPreview.ok !== false,
        data_summary: browserPreview,
      }),
    )
  }
  scanList(root.tool_results)
  const messageOutput = asRecord(root.message_output)
  if (messageOutput) scanList(messageOutput.tool_results)
  remember(fromToolResult(root))
  return Array.from(found.values())
}

/** Compact tool_result row for attaching a live stream browser preview to an in-flight message. */
export function browserPreviewToToolResult(preview: Record<string, unknown>): Record<string, unknown> {
  return {
    name: asString(preview.tool_name) ?? asString(preview.name) ?? "open_browser",
    ok: preview.ok !== false,
    skipped: false,
    error: asString(preview.error),
    data_summary: {
      browser_session_id:
        asString(preview.browser_session_id) ?? asString(preview.browserSessionId),
      browser_id: asString(preview.browser_id) ?? asString(preview.browserId),
      session_id: asString(preview.session_id) ?? asString(preview.sessionId),
      live_view_url: asString(preview.live_view_url) ?? asString(preview.liveViewUrl),
      start_url: asString(preview.start_url) ?? asString(preview.startUrl),
      current_url: asString(preview.current_url) ?? asString(preview.currentUrl),
      title: asString(preview.title),
      provider: asString(preview.provider),
      browser_label: asString(preview.browser_label) ?? asString(preview.browserLabel),
      status: asString(preview.status),
      show_browser_preview: preview.show_browser_preview !== false,
      open_browser_tab:
        preview.open_browser_tab === true
        || preview.openBrowserTab === true
        || (asString(preview.tool_name) ?? asString(preview.name)) === "open_browser",
      desktop_browser: asRecord(preview.desktop_browser),
      desktop_command: asRecord(preview.desktop_command),
    },
  }
}
