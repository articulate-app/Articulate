/**
 * Provider-agnostic browser agent contract.
 * Browser Use Cloud V4 is the MVP implementation; Browserbase + Stagehand / Computer Use can plug in later.
 */

export type BrowserAgentProviderName =
  | "browser_use"
  /** Articulate Desktop Electron WebContentsView (interactive + immediate publishing). */
  | "articulate_desktop"
  /**
   * @deprecated Legacy Local Browser Bridge. Retained for historical publication_runs only.
   * Never select for new executions.
   */
  | "browser_use_local"
  | "browserbase_stagehand"
  | "browserbase_computer_use"
  | "other"

/** Execution preference. "local" is accepted as a legacy alias of "auto" (never Local Bridge). */
export type BrowserExecutionMode = "desktop" | "cloud" | "auto" | "local"

export type BrowserProfile = {
  id: string
  name?: string | null
  userId?: string | null
  cookieDomains?: string[] | null
}

export type BrowserSession = {
  id: string
  status: "active" | "stopped" | string
  liveViewUrl?: string | null
  /** Never return CDP URLs to the frontend. */
  cdpUrl?: string | null
  timeoutAt?: string | null
}

export type BrowserWorkspace = {
  id: string
  name?: string | null
}

export type BrowserUploadedFile = {
  id: string
  name: string
  path: string
  size?: number
  purpose?: string | null
}

export type BrowserRunStatus =
  | "queued"
  | "dispatching"
  | "running"
  | "completed"
  | "failed"
  | "cancelled"
  | string

export type BrowserRun = {
  id: string
  sessionId: string
  workspaceId?: string | null
  status: BrowserRunStatus
  task?: string | null
  result?: string | null
  error?: string | null
  attachedFileIds?: string[] | null
}

export type BrowserRunEvent = {
  id: number
  runId: string
  ts: string
  type: string
  data: Record<string, unknown>
}

export type CreateProfileInput = {
  name?: string | null
  userId?: string | null
}

export type BrowserViewportSize = {
  width: number
  height: number
}

export type CreateBrowserInput = {
  profileId?: string | null
  timeoutMinutes?: number
  proxyCountryCode?: string | null
  enableRecording?: boolean
  /** Optional initial navigation after the browser starts (server-side CDP). */
  startUrl?: string | null
  /** Remote browser screen size (Browser Use V4 browserScreenWidth/Height). */
  screen?: BrowserViewportSize | null
}

export type StartRunInput = {
  task: string
  model?: string
  sessionId?: string | null
  workspaceId?: string | null
  profileId?: string | null
  attachedFileIds?: string[] | null
  /**
   * ISO country code for residential proxy, or `null` to disable proxy.
   * Required by the V4 TS contract whenever browserSettings is sent for a NEW browser.
   */
  proxyCountryCode?: string | null
  /** Record the browser session to mp4. Defaults to false for the performance baseline. */
  record?: boolean | null
  maxCostUsd?: number | null
  /** Remote browser screen size when a new browser is provisioned (V4 screenWidth/Height). */
  screen?: BrowserViewportSize | null
}

export type ContinueRunInput = {
  sessionId: string
  text: string
  model?: string
  /** When true, interrupt the current turn if supported. */
  interrupt?: boolean
}

export type UploadFileInput = {
  workspaceId: string
  name: string
  contentType: string
  bytes: Uint8Array
  purpose?: string | null
}

export type GetEventsInput = {
  runId: string
  after?: number | null
  limit?: number
}

export type LiveViewInfo = {
  liveViewUrl: string | null
  source: "browser" | "event" | "none"
  browserId?: string | null
}

export type AlignBrowserViewportInput = {
  screen: BrowserViewportSize
  /** Agent session id from a V4 run (maps to browsers?agentSessionId=). */
  agentSessionId?: string | null
  browserId?: string | null
}

export type AlignBrowserViewportResult = {
  browserId: string | null
  resized: boolean
  liveViewUrl?: string | null
}

export type BrowserHistoryEntry = {
  id: number
  url: string
  title: string
}

export type BrowserNavigationState = {
  url: string
  title: string
  canGoBack: boolean
  canGoForward: boolean
  history: BrowserHistoryEntry[]
  /** False when the remote browser is gone/stopped (status probes only). */
  active?: boolean
}

export type ControlBrowserCommand =
  | "status"
  | "navigate"
  | "back"
  | "forward"
  | "reload"
  | "history_entry"

export type ControlBrowserInput = {
  browserId?: string | null
  agentSessionId?: string | null
  command: ControlBrowserCommand
  url?: string | null
  historyEntryId?: number | null
}

export interface BrowserAgentProvider {
  readonly name: BrowserAgentProviderName

  createProfile(input: CreateProfileInput): Promise<BrowserProfile>
  /** Best-effort remote profile deletion. Local unlink remains authoritative. */
  deleteProfile?(profileId: string): Promise<void>
  createBrowser(input: CreateBrowserInput): Promise<BrowserSession>
  stopBrowser(browserId: string): Promise<BrowserSession | null>
  getBrowser(browserId: string): Promise<BrowserSession | null>
  /** List currently active Browser Use browser sessions (BaaS + agent-linked). */
  listActiveBrowsers(): Promise<BrowserSession[]>
  /** Navigate an active browser via CDP. Never expose cdpUrl to clients. */
  navigateBrowser(browserId: string, url: string): Promise<void>
  /**
   * URL bar / history controls for Articulate chrome (CDP). Never exposes cdpUrl.
   */
  controlBrowser(input: ControlBrowserInput): Promise<BrowserNavigationState>
  /**
   * Force remote screen metrics to match the local pane after browser.ready.
   * Never exposes CDP URLs to clients.
   */
  alignBrowserViewport(input: AlignBrowserViewportInput): Promise<AlignBrowserViewportResult>

  createWorkspace(name?: string | null): Promise<BrowserWorkspace>
  uploadFile(input: UploadFileInput): Promise<BrowserUploadedFile>

  startRun(input: StartRunInput): Promise<BrowserRun>
  continueRun(input: ContinueRunInput): Promise<BrowserRun>
  cancelRun(runId: string): Promise<void>
  getRun(runId: string): Promise<BrowserRun>
  getRunStatus(runId: string): Promise<BrowserRunStatus>
  getEvents(input: GetEventsInput): Promise<{ events: BrowserRunEvent[]; nextAfter: number | null }>
  getLiveView(runId: string, browserId?: string | null): Promise<LiveViewInfo>
}

export class BrowserAgentError extends Error {
  readonly code: string
  readonly status?: number
  readonly provider: BrowserAgentProviderName
  readonly retryable: boolean

  constructor(
    code: string,
    message: string,
    options?: {
      status?: number
      provider?: BrowserAgentProviderName
      retryable?: boolean
      cause?: unknown
    },
  ) {
    super(message, options?.cause !== undefined ? { cause: options.cause } : undefined)
    this.name = "BrowserAgentError"
    this.code = code
    this.status = options?.status
    this.provider = options?.provider ?? "browser_use"
    this.retryable = options?.retryable ?? false
  }
}
