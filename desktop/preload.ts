/**
 * Trusted preload for the Articulate application WebContents only.
 * Remote Browser WebContents have no preload.
 */

import { contextBridge, ipcRenderer, type IpcRendererEvent } from "electron"
import {
  ALLOWED_EVENT_CHANNELS,
  ALLOWED_INVOKE_CHANNELS,
  IPC,
  type DesktopBrowserBounds,
  type DesktopBrowserState,
  type DesktopInfo,
} from "./ipc"

function invoke<T>(channel: string, payload?: unknown): Promise<T> {
  if (!ALLOWED_INVOKE_CHANNELS.has(channel)) {
    return Promise.reject(new Error(`Blocked IPC channel: ${channel}`))
  }
  return ipcRenderer.invoke(channel, payload) as Promise<T>
}

function on(channel: string, listener: (payload: unknown) => void): () => void {
  if (!ALLOWED_EVENT_CHANNELS.has(channel)) {
    throw new Error(`Blocked event channel: ${channel}`)
  }
  const wrapped = (_event: IpcRendererEvent, payload: unknown) => listener(payload)
  ipcRenderer.on(channel, wrapped)
  return () => ipcRenderer.removeListener(channel, wrapped)
}

const articulateDesktop = {
  isDesktop: true as const,

  getInfo(): Promise<DesktopInfo> {
    return invoke<DesktopInfo>(IPC.GET_INFO)
  },

  updates: {
    getStatus(): Promise<import("./ipc").DesktopUpdateStatus> {
      return invoke(IPC.UPDATE_GET_STATUS)
    },
    check(): Promise<{ ok: boolean; reason?: string; message?: string }> {
      return invoke(IPC.UPDATE_CHECK)
    },
    install(): Promise<{ ok: boolean; reason?: string }> {
      return invoke(IPC.UPDATE_INSTALL)
    },
    onStatus(listener: (payload: import("./ipc").DesktopUpdateStatus) => void): () => void {
      return on(IPC.UPDATE_STATUS, (payload) =>
        listener(payload as import("./ipc").DesktopUpdateStatus),
      )
    },
  },

  browser: {
    create(options?: { id?: string; url?: string }): Promise<DesktopBrowserState> {
      return invoke<DesktopBrowserState>(IPC.BROWSER_CREATE, options ?? {})
    },
    close(id: string): Promise<{ ok: boolean }> {
      return invoke(IPC.BROWSER_CLOSE, { id })
    },
    show(id: string): Promise<{ ok: boolean }> {
      return invoke(IPC.BROWSER_SHOW, { id })
    },
    hide(id?: string): Promise<{ ok: boolean }> {
      return invoke(IPC.BROWSER_HIDE, id ? { id } : {})
    },
    setBounds(id: string, bounds: DesktopBrowserBounds): Promise<{ ok: boolean }> {
      return invoke(IPC.BROWSER_SET_BOUNDS, { id, bounds })
    },
    navigate(id: string, url: string): Promise<{ ok: boolean }> {
      return invoke(IPC.BROWSER_NAVIGATE, { id, url })
    },
    back(id: string): Promise<{ ok: boolean }> {
      return invoke(IPC.BROWSER_BACK, { id })
    },
    forward(id: string): Promise<{ ok: boolean }> {
      return invoke(IPC.BROWSER_FORWARD, { id })
    },
    reload(id: string): Promise<{ ok: boolean }> {
      return invoke(IPC.BROWSER_RELOAD, { id })
    },
    stop(id: string): Promise<{ ok: boolean }> {
      return invoke(IPC.BROWSER_STOP, { id })
    },
    getState(id: string): Promise<DesktopBrowserState | null> {
      return invoke(IPC.BROWSER_GET_STATE, { id })
    },
    capture(id: string): Promise<{ dataUrl: string | null }> {
      return invoke(IPC.BROWSER_CAPTURE, { id })
    },
    observe(id: string): Promise<unknown> {
      return invoke(IPC.BROWSER_OBSERVE, { id })
    },
    agentAction(
      id: string,
      generation: number,
      action: Record<string, unknown>,
    ): Promise<{ ok: boolean; dropped?: boolean; reason?: string }> {
      return invoke(IPC.BROWSER_AGENT_ACTION, { id, generation, action })
    },
    beginAgent(): Promise<{ controlOwner: "agent" | "human"; agentGeneration: number }> {
      return invoke(IPC.BROWSER_AGENT_BEGIN)
    },
    getControl(): Promise<{ controlOwner: "agent" | "human"; agentGeneration: number }> {
      return invoke(IPC.BROWSER_AGENT_GET_CONTROL)
    },
    bumpHuman(): Promise<{ controlOwner: "agent" | "human"; agentGeneration: number }> {
      return invoke(IPC.BROWSER_HUMAN_BUMP)
    },
    onControl(
      listener: (payload: { controlOwner: "agent" | "human"; agentGeneration: number }) => void,
    ): () => void {
      return on(IPC.BROWSER_CONTROL, (payload) =>
        listener(payload as { controlOwner: "agent" | "human"; agentGeneration: number }),
      )
    },
    onState(listener: (state: DesktopBrowserState) => void): () => void {
      return on(IPC.BROWSER_STATE, (payload) => listener(payload as DesktopBrowserState))
    },
    onMeta(
      listener: (payload: {
        id: string
        title: string
        favicon: string | null
        url: string
      }) => void,
    ): () => void {
      return on(IPC.BROWSER_META, (payload) =>
        listener(
          payload as {
            id: string
            title: string
            favicon: string | null
            url: string
          },
        ),
      )
    },
    onDownload(
      listener: (payload: {
        id: string
        filename: string
        url: string
        state: string
      }) => void,
    ): () => void {
      return on(IPC.BROWSER_DOWNLOAD, (payload) =>
        listener(payload as { id: string; filename: string; url: string; state: string }),
      )
    },
    onPopup(
      listener: (payload: { id: string; url: string; openerId: string }) => void,
    ): () => void {
      return on(IPC.BROWSER_POPUP, (payload) =>
        listener(payload as { id: string; url: string; openerId: string }),
      )
    },
  },
}

contextBridge.exposeInMainWorld("articulateDesktop", articulateDesktop)

export type ArticulateDesktopApi = typeof articulateDesktop
