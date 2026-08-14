/** Validated IPC channel names for Articulate Desktop. */

export const IPC = {
  GET_INFO: "articulate-desktop:get-info",
  BROWSER_CREATE: "articulate-desktop:browser:create",
  BROWSER_CLOSE: "articulate-desktop:browser:close",
  BROWSER_SHOW: "articulate-desktop:browser:show",
  BROWSER_HIDE: "articulate-desktop:browser:hide",
  BROWSER_SET_BOUNDS: "articulate-desktop:browser:set-bounds",
  BROWSER_NAVIGATE: "articulate-desktop:browser:navigate",
  BROWSER_BACK: "articulate-desktop:browser:back",
  BROWSER_FORWARD: "articulate-desktop:browser:forward",
  BROWSER_RELOAD: "articulate-desktop:browser:reload",
  BROWSER_STOP: "articulate-desktop:browser:stop",
  BROWSER_GET_STATE: "articulate-desktop:browser:get-state",
  BROWSER_OBSERVE: "articulate-desktop:browser:observe",
  BROWSER_AGENT_ACTION: "articulate-desktop:browser:agent-action",
  BROWSER_AGENT_BEGIN: "articulate-desktop:browser:agent-begin",
  BROWSER_AGENT_GET_CONTROL: "articulate-desktop:browser:agent-get-control",
  BROWSER_HUMAN_BUMP: "articulate-desktop:browser:human-bump",
  UPDATE_GET_STATUS: "articulate-desktop:update:get-status",
  UPDATE_CHECK: "articulate-desktop:update:check",
  UPDATE_INSTALL: "articulate-desktop:update:install",
  /** Main → renderer push events */
  BROWSER_STATE: "articulate-desktop:browser:state",
  BROWSER_META: "articulate-desktop:browser:meta",
  BROWSER_DOWNLOAD: "articulate-desktop:browser:download",
  BROWSER_POPUP: "articulate-desktop:browser:popup",
  BROWSER_CONTROL: "articulate-desktop:browser:control",
  UPDATE_STATUS: "articulate-desktop:update:status",
} as const

export type DesktopIpcChannel = (typeof IPC)[keyof typeof IPC]

export const ALLOWED_INVOKE_CHANNELS = new Set<string>([
  IPC.GET_INFO,
  IPC.BROWSER_CREATE,
  IPC.BROWSER_CLOSE,
  IPC.BROWSER_SHOW,
  IPC.BROWSER_HIDE,
  IPC.BROWSER_SET_BOUNDS,
  IPC.BROWSER_NAVIGATE,
  IPC.BROWSER_BACK,
  IPC.BROWSER_FORWARD,
  IPC.BROWSER_RELOAD,
  IPC.BROWSER_STOP,
  IPC.BROWSER_GET_STATE,
  IPC.BROWSER_OBSERVE,
  IPC.BROWSER_AGENT_ACTION,
  IPC.BROWSER_AGENT_BEGIN,
  IPC.BROWSER_AGENT_GET_CONTROL,
  IPC.BROWSER_HUMAN_BUMP,
  IPC.UPDATE_GET_STATUS,
  IPC.UPDATE_CHECK,
  IPC.UPDATE_INSTALL,
])

export const ALLOWED_EVENT_CHANNELS = new Set<string>([
  IPC.BROWSER_STATE,
  IPC.BROWSER_META,
  IPC.BROWSER_DOWNLOAD,
  IPC.BROWSER_POPUP,
  IPC.BROWSER_CONTROL,
  IPC.UPDATE_STATUS,
])

export type DesktopBrowserBounds = {
  x: number
  y: number
  width: number
  height: number
  visible: boolean
}

export type DesktopBrowserState = {
  id: string
  url: string
  title: string
  favicon: string | null
  isLoading: boolean
  canGoBack: boolean
  canGoForward: boolean
  sessionPartition: string
}

export type DesktopInfo = {
  isDesktop: true
  /** Native Desktop shell semver (independent of web deploys). */
  desktopVersion: string
  /** Capability flags for web ↔ Desktop compatibility checks. */
  capabilities: string[]
  electron: string
  chromium: string
  platform: NodeJS.Platform
  arch: string
  sessionPartition: string
  browserViewActive: boolean
  activeBrowserId: string | null
  bounds: DesktopBrowserBounds | null
  url: string | null
  isPackaged: boolean
  appUrl: string
}

export type DesktopUpdateStatus = {
  status:
    | "idle"
    | "checking"
    | "available"
    | "not-available"
    | "downloading"
    | "downloaded"
    | "error"
  version: string | null
  percent: number | null
  message: string | null
}
