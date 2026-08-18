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
  BrowserSession,
  BrowserUploadedFile,
  BrowserWorkspace,
  ControlBrowserInput,
  CreateBrowserInput,
  CreateProfileInput,
  LiveViewInfo,
  UploadFileInput,
} from "../types.ts"

type LocalBrowserRecord = {
  session: BrowserSession
  createdAt: number
}

const profiles = new Map<string, BrowserProfile>()
const workspaces = new Map<string, BrowserWorkspace>()
const browsers = new Map<string, LocalBrowserRecord>()
const files = new Map<string, BrowserUploadedFile & { bytes?: Uint8Array }>()

function newId(prefix: string): string {
  return `${prefix}_${crypto.randomUUID().replace(/-/g, "").slice(0, 20)}`
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

  getLiveView(_runId?: string | null, _browserId?: string | null): Promise<LiveViewInfo> {
    return Promise.resolve({
      liveViewUrl: null,
      source: "none",
      browserId: _browserId ?? null,
    })
  }
}
