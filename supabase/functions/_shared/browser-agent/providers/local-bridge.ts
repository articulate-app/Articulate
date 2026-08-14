/**
 * @deprecated LEGACY / ARCHIVED SPIKE — Local Browser Bridge provider.
 *
 * Disconnected from runtime provider resolution (Desktop → Cloud only).
 * Do not instantiate for new publication or browser sessions.
 * Module retained for historical reference and old `browser_use_local` rows.
 *
 * Edge cannot reach 127.0.0.1. This provider coordinated local runs via the
 * Articulate Browser Bridge experiment — never a production-quality experience.
 */

import type {
  AlignBrowserViewportInput,
  AlignBrowserViewportResult,
  BrowserAgentProvider,
  BrowserNavigationState,
  BrowserProfile,
  BrowserRun,
  BrowserRunEvent,
  BrowserRunStatus,
  BrowserSession,
  BrowserUploadedFile,
  BrowserWorkspace,
  ContinueRunInput,
  ControlBrowserInput,
  CreateBrowserInput,
  CreateProfileInput,
  GetEventsInput,
  LiveViewInfo,
  StartRunInput,
  UploadFileInput,
} from "../types.ts"
import { BrowserAgentError } from "../types.ts"

type LocalRunRecord = {
  run: BrowserRun
  events: BrowserRunEvent[]
  browserId: string
  createdAt: number
}

type LocalBrowserRecord = {
  session: BrowserSession
  createdAt: number
}

const profiles = new Map<string, BrowserProfile>()
const workspaces = new Map<string, BrowserWorkspace>()
const browsers = new Map<string, LocalBrowserRecord>()
const runs = new Map<string, LocalRunRecord>()
const files = new Map<string, BrowserUploadedFile & { bytes?: Uint8Array }>()

function newId(prefix: string): string {
  return `${prefix}_${crypto.randomUUID().replace(/-/g, "").slice(0, 20)}`
}

function requireRun(runId: string): LocalRunRecord {
  const row = runs.get(runId)
  if (!row) {
    throw new BrowserAgentError("provider_request_failed", "Local browser run not found", {
      provider: "browser_use_local",
      status: 404,
    })
  }
  return row
}

function publicRun(row: LocalRunRecord): BrowserRun {
  return { ...row.run }
}

export class LocalBridgeProvider implements BrowserAgentProvider {
  readonly name = "browser_use_local" as const

  createProfile(input: CreateProfileInput): Promise<BrowserProfile> {
    const id = newId("local_profile")
    const profile: BrowserProfile = {
      id,
      name: input.name ?? "Articulate local profile",
      userId: input.userId ?? null,
      cookieDomains: null,
    }
    profiles.set(id, profile)
    return Promise.resolve(profile)
  }

  deleteProfile(profileId: string): Promise<void> {
    profiles.delete(profileId)
    return Promise.resolve()
  }

  createBrowser(input: CreateBrowserInput): Promise<BrowserSession> {
    const id = newId("local_browser")
    const session: BrowserSession = {
      id,
      status: "active",
      // Local Chrome is the primary view; no Cloud Live View.
      liveViewUrl: null,
      cdpUrl: null,
      timeoutAt: null,
    }
    browsers.set(id, { session, createdAt: Date.now() })
    if (input.startUrl) {
      // Client navigates after attaching to the Bridge session.
      session.status = "active"
    }
    return Promise.resolve({ ...session })
  }

  stopBrowser(browserId: string): Promise<BrowserSession | null> {
    const row = browsers.get(browserId)
    if (!row) return Promise.resolve(null)
    row.session = { ...row.session, status: "stopped" }
    browsers.delete(browserId)
    return Promise.resolve({ ...row.session })
  }

  getBrowser(browserId: string): Promise<BrowserSession | null> {
    const row = browsers.get(browserId)
    return Promise.resolve(row ? { ...row.session } : null)
  }

  listActiveBrowsers(): Promise<BrowserSession[]> {
    return Promise.resolve(
      Array.from(browsers.values())
        .filter((row) => row.session.status === "active")
        .map((row) => ({ ...row.session })),
    )
  }

  navigateBrowser(_browserId: string, _url: string): Promise<void> {
    // Navigation is performed by the local Bridge client.
    return Promise.resolve()
  }

  controlBrowser(_input: ControlBrowserInput): Promise<BrowserNavigationState> {
    return Promise.resolve({
      url: "",
      title: "",
      canGoBack: false,
      canGoForward: false,
      history: [],
      active: true,
    })
  }

  alignBrowserViewport(
    _input: AlignBrowserViewportInput,
  ): Promise<AlignBrowserViewportResult> {
    return Promise.resolve({
      browserId: null,
      resized: false,
      liveViewUrl: null,
    })
  }

  createWorkspace(name?: string | null): Promise<BrowserWorkspace> {
    const id = newId("local_ws")
    const workspace: BrowserWorkspace = { id, name: name ?? null }
    workspaces.set(id, workspace)
    return Promise.resolve(workspace)
  }

  uploadFile(input: UploadFileInput): Promise<BrowserUploadedFile> {
    const id = newId("local_file")
    const file: BrowserUploadedFile & { bytes?: Uint8Array } = {
      id,
      name: input.name,
      path: `/local/${input.workspaceId}/${input.name}`,
      size: input.bytes.byteLength,
      purpose: input.purpose ?? null,
      bytes: input.bytes,
    }
    files.set(id, file)
    return Promise.resolve({
      id: file.id,
      name: file.name,
      path: file.path,
      size: file.size,
      purpose: file.purpose,
    })
  }

  startRun(input: StartRunInput): Promise<BrowserRun> {
    const browserId = input.sessionId?.trim() || newId("local_browser")
    if (!browsers.has(browserId)) {
      browsers.set(browserId, {
        session: {
          id: browserId,
          status: "active",
          liveViewUrl: null,
          cdpUrl: null,
        },
        createdAt: Date.now(),
      })
    }
    const runId = newId("local_run")
    const run: BrowserRun = {
      id: runId,
      sessionId: browserId,
      workspaceId: input.workspaceId ?? null,
      status: "running",
      task: input.task,
      result: null,
      error: null,
      attachedFileIds: input.attachedFileIds ?? null,
    }
    const event: BrowserRunEvent = {
      id: 1,
      runId,
      ts: new Date().toISOString(),
      type: "local.run.started",
      data: {
        taskPreview: input.task.slice(0, 240),
        requiresLocalClient: true,
        profileId: input.profileId ?? null,
      },
    }
    runs.set(runId, {
      run,
      events: [event],
      browserId,
      createdAt: Date.now(),
    })
    return Promise.resolve(publicRun(runs.get(runId)!))
  }

  continueRun(input: ContinueRunInput): Promise<BrowserRun> {
    // Find latest run for session, or create a continuation run.
    let latest: LocalRunRecord | null = null
    for (const row of runs.values()) {
      if (row.run.sessionId === input.sessionId) {
        if (!latest || row.createdAt > latest.createdAt) latest = row
      }
    }
    if (!latest) {
      return this.startRun({
        task: input.text,
        sessionId: input.sessionId,
        model: input.model,
      })
    }
    latest.run = {
      ...latest.run,
      status: "running",
      task: input.text,
      error: null,
    }
    latest.events.push({
      id: latest.events.length + 1,
      runId: latest.run.id,
      ts: new Date().toISOString(),
      type: "local.run.continued",
      data: {
        textPreview: input.text.slice(0, 240),
        interrupt: Boolean(input.interrupt),
        requiresLocalClient: true,
      },
    })
    return Promise.resolve(publicRun(latest))
  }

  cancelRun(runId: string): Promise<void> {
    const row = runs.get(runId)
    if (!row) return Promise.resolve()
    row.run = { ...row.run, status: "cancelled" }
    return Promise.resolve()
  }

  getRun(runId: string): Promise<BrowserRun> {
    return Promise.resolve(publicRun(requireRun(runId)))
  }

  getRunStatus(runId: string): Promise<BrowserRunStatus> {
    return Promise.resolve(requireRun(runId).run.status)
  }

  getEvents(
    input: GetEventsInput,
  ): Promise<{ events: BrowserRunEvent[]; nextAfter: number | null }> {
    const row = requireRun(input.runId)
    const after = typeof input.after === "number" ? input.after : 0
    const limit = input.limit ?? 100
    const events = row.events.filter((event) => event.id > after).slice(0, limit)
    const nextAfter = events.length ? events[events.length - 1]!.id : null
    return Promise.resolve({ events, nextAfter })
  }

  getLiveView(_runId: string, _browserId?: string | null): Promise<LiveViewInfo> {
    return Promise.resolve({
      liveViewUrl: null,
      source: "none",
      browserId: _browserId ?? null,
    })
  }

  /** Test/helper: mark a local run completed with optional result text. */
  completeLocalRun(runId: string, result?: string | null, error?: string | null): BrowserRun {
    const row = requireRun(runId)
    row.run = {
      ...row.run,
      status: error ? "failed" : "completed",
      result: result ?? null,
      error: error ?? null,
    }
    return publicRun(row)
  }
}
