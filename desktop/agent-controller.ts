/**
 * Constrained agent control over Desktop Browser WebContents.
 * Human input remains native; this path is programmatic only (main process).
 */

import type { WebContents } from "electron"
import type { DesktopBrowserManager } from "./browser-manager"

export type DesktopAgentAction =
  | { type: "navigate"; url: string }
  | { type: "back" }
  | { type: "forward" }
  | { type: "reload" }
  | { type: "click"; x: number; y: number; button?: "left" | "right" | "middle" }
  | { type: "double_click"; x: number; y: number }
  | { type: "type"; text: string; clear?: boolean }
  | { type: "press_key"; key: string; modifiers?: string[] }
  | { type: "scroll"; deltaX?: number; deltaY?: number; x?: number; y?: number }
  | { type: "select"; selector?: string; value?: string }
  | { type: "wait"; ms: number }
  | { type: "focus"; selector?: string }

export type DesktopBrowserObservation = {
  id: string
  url: string
  title: string
  isLoading: boolean
  canGoBack: boolean
  canGoForward: boolean
  focusedTag: string | null
  focusedType: string | null
  focusedName: string | null
  focusedValuePreview: string | null
  elements: Array<{
    index: number
    tag: string
    role: string | null
    name: string | null
    text: string | null
    href: string | null
    x: number
    y: number
    width: number
    height: number
  }>
  pageTextPreview: string
  controlOwner: "agent" | "human"
  agentGeneration: number
}

export type DesktopAgentControlState = {
  controlOwner: "agent" | "human"
  agentGeneration: number
}

const OBSERVE_SCRIPT = `(() => {
  const focused = document.activeElement
  const focusedTag = focused && focused !== document.body ? focused.tagName.toLowerCase() : null
  const focusedType = focused && 'type' in focused ? String(focused.type || '') : null
  const focusedName = focused ? (focused.getAttribute('aria-label') || focused.getAttribute('name') || focused.id || null) : null
  let focusedValuePreview = null
  if (focused && (focused.tagName === 'INPUT' || focused.tagName === 'TEXTAREA')) {
    const v = String(focused.value || '')
    const isPassword = focusedType === 'password'
    focusedValuePreview = isPassword ? (v ? '[redacted]' : '') : v.slice(0, 120)
  }
  const candidates = Array.from(document.querySelectorAll('a,button,input,textarea,select,[role="button"],[role="link"],[contenteditable="true"]'))
  const elements = []
  const seenHrefs = new Set()
  for (const el of candidates) {
    if (elements.length >= 48) break
    const rect = el.getBoundingClientRect()
    if (rect.width < 2 || rect.height < 2) continue
    if (rect.bottom < 0 || rect.right < 0 || rect.top > window.innerHeight || rect.left > window.innerWidth) continue
    const style = window.getComputedStyle(el)
    if (style.visibility === 'hidden' || style.display === 'none' || Number(style.opacity) === 0) continue
    const text = (el.innerText || el.getAttribute('aria-label') || el.getAttribute('placeholder') || '').trim().slice(0, 80)
    const href = el.tagName === 'A' ? el.href || null : (el.closest && el.closest('a[href]') ? el.closest('a[href]').href : null)
    if (href) seenHrefs.add(href)
    elements.push({
      index: elements.length,
      tag: el.tagName.toLowerCase(),
      role: el.getAttribute('role'),
      name: el.getAttribute('name') || el.id || null,
      text: text || null,
      href,
      x: Math.round(rect.left + rect.width / 2),
      y: Math.round(rect.top + rect.height / 2),
      width: Math.round(rect.width),
      height: Math.round(rect.height),
    })
  }
  if (elements.length < 48) {
    for (const a of Array.from(document.querySelectorAll('a[href]'))) {
      if (elements.length >= 48) break
      const href = a.href || ''
      if (!href || seenHrefs.has(href)) continue
      const rect = a.getBoundingClientRect()
      if (rect.width < 2 || rect.height < 2) continue
      seenHrefs.add(href)
      elements.push({
        index: elements.length,
        tag: 'a',
        role: a.getAttribute('role'),
        name: a.id || null,
        text: (a.innerText || a.getAttribute('aria-label') || '').trim().slice(0, 80) || null,
        href,
        x: Math.round(rect.left + rect.width / 2),
        y: Math.round(rect.top + rect.height / 2),
        width: Math.round(rect.width),
        height: Math.round(rect.height),
      })
    }
  }
  const pageTextPreview = (document.body && document.body.innerText ? document.body.innerText : '').replace(/\\s+/g, ' ').trim().slice(0, 1500)
  return {
    focusedTag,
    focusedType,
    focusedName,
    focusedValuePreview,
    elements,
    pageTextPreview,
  }
})()`

export class DesktopAgentController {
  private controlOwner: "agent" | "human" = "human"
  private agentGeneration = 0
  private readonly manager: DesktopBrowserManager
  private readonly onControlChange?: (state: DesktopAgentControlState) => void

  constructor(
    manager: DesktopBrowserManager,
    options?: { onControlChange?: (state: DesktopAgentControlState) => void },
  ) {
    this.manager = manager
    this.onControlChange = options?.onControlChange
  }

  getState(): DesktopAgentControlState {
    return {
      controlOwner: this.controlOwner,
      agentGeneration: this.agentGeneration,
    }
  }

  /** Human interacted with the native WebContents — invalidate agent plans. */
  bumpHumanControl(): DesktopAgentControlState {
    this.agentGeneration += 1
    this.controlOwner = "human"
    const state = this.getState()
    this.onControlChange?.(state)
    return state
  }

  /** Continue with agent — new generation, fresh plan required. */
  beginAgentControl(): DesktopAgentControlState {
    this.agentGeneration += 1
    this.controlOwner = "agent"
    const state = this.getState()
    this.onControlChange?.(state)
    return state
  }

  isGenerationCurrent(generation: number): boolean {
    return generation === this.agentGeneration && this.controlOwner === "agent"
  }

  private requireWebContents(id: string): WebContents {
    const wc = this.manager.getWebContents(id)
    if (!wc || wc.isDestroyed()) {
      throw new Error(`Desktop browser ${id} is not available`)
    }
    return wc
  }

  async observe(id: string): Promise<DesktopBrowserObservation> {
    const entry = this.manager.getEntry(id)
    if (!entry) throw new Error(`Desktop browser ${id} not found`)
    const wc = this.requireWebContents(id)
    const history = wc.navigationHistory
    let page: {
      focusedTag: string | null
      focusedType: string | null
      focusedName: string | null
      focusedValuePreview: string | null
      elements: DesktopBrowserObservation["elements"]
      pageTextPreview: string
    }
    try {
      page = (await wc.executeJavaScript(OBSERVE_SCRIPT, true)) as typeof page
    } catch {
      page = {
        focusedTag: null,
        focusedType: null,
        focusedName: null,
        focusedValuePreview: null,
        elements: [],
        pageTextPreview: "",
      }
    }
    return {
      id,
      url: entry.url || wc.getURL() || "",
      title: entry.title || wc.getTitle() || "",
      isLoading: entry.isLoading || wc.isLoading(),
      canGoBack: history.canGoBack(),
      canGoForward: history.canGoForward(),
      focusedTag: page.focusedTag,
      focusedType: page.focusedType,
      focusedName: page.focusedName,
      focusedValuePreview: page.focusedValuePreview,
      elements: page.elements ?? [],
      pageTextPreview: page.pageTextPreview ?? "",
      controlOwner: this.controlOwner,
      agentGeneration: this.agentGeneration,
    }
  }

  async executeAction(
    id: string,
    action: DesktopAgentAction,
    generation: number,
  ): Promise<{ ok: boolean; dropped?: boolean; reason?: string }> {
    if (!this.isGenerationCurrent(generation)) {
      return { ok: false, dropped: true, reason: "stale_generation" }
    }
    const wc = this.requireWebContents(id)

    switch (action.type) {
      case "navigate": {
        this.manager.navigate(id, action.url)
        return { ok: true }
      }
      case "back":
        return { ok: this.manager.back(id) }
      case "forward":
        return { ok: this.manager.forward(id) }
      case "reload":
        return { ok: this.manager.reload(id) }
      case "wait": {
        const ms = Math.min(Math.max(Number(action.ms) || 0, 0), 15_000)
        await new Promise((r) => setTimeout(r, ms))
        if (!this.isGenerationCurrent(generation)) {
          return { ok: false, dropped: true, reason: "stale_generation" }
        }
        return { ok: true }
      }
      case "click":
      case "double_click": {
        const button = action.type === "click" ? action.button ?? "left" : "left"
        const clickCount = action.type === "double_click" ? 2 : 1
        wc.sendInputEvent({
          type: "mouseDown",
          x: Math.round(action.x),
          y: Math.round(action.y),
          button,
          clickCount,
        })
        wc.sendInputEvent({
          type: "mouseUp",
          x: Math.round(action.x),
          y: Math.round(action.y),
          button,
          clickCount,
        })
        return { ok: true }
      }
      case "scroll": {
        const x = Math.round(action.x ?? 0)
        const y = Math.round(action.y ?? 0)
        wc.sendInputEvent({
          type: "mouseWheel",
          x,
          y,
          deltaX: Math.round(action.deltaX ?? 0),
          deltaY: Math.round(action.deltaY ?? 0),
        })
        return { ok: true }
      }
      case "type": {
        if (action.clear) {
          const isMac = process.platform === "darwin"
          wc.sendInputEvent({
            type: "keyDown",
            keyCode: "A",
            modifiers: isMac ? ["meta"] : ["control"],
          })
          wc.sendInputEvent({
            type: "keyUp",
            keyCode: "A",
            modifiers: isMac ? ["meta"] : ["control"],
          })
          wc.sendInputEvent({ type: "keyDown", keyCode: "Backspace" })
          wc.sendInputEvent({ type: "keyUp", keyCode: "Backspace" })
        }
        for (const ch of action.text) {
          if (!this.isGenerationCurrent(generation)) {
            return { ok: false, dropped: true, reason: "stale_generation" }
          }
          wc.sendInputEvent({ type: "char", keyCode: ch })
        }
        return { ok: true }
      }
      case "press_key": {
        const modifiers = (action.modifiers ?? []).map((m) => m.toLowerCase())
        wc.sendInputEvent({
          type: "keyDown",
          keyCode: action.key,
          modifiers: modifiers as Electron.InputEvent["modifiers"],
        })
        wc.sendInputEvent({
          type: "keyUp",
          keyCode: action.key,
          modifiers: modifiers as Electron.InputEvent["modifiers"],
        })
        return { ok: true }
      }
      case "focus":
      case "select": {
        const selector = action.selector
        if (!selector) return { ok: false, reason: "selector_required" }
        const value = action.type === "select" ? action.value ?? "" : null
        await wc.executeJavaScript(
          `(() => {
            const el = document.querySelector(${JSON.stringify(selector)})
            if (!el) return false
            el.focus()
            if (${JSON.stringify(value)} !== null && 'value' in el) {
              el.value = ${JSON.stringify(value)}
              el.dispatchEvent(new Event('input', { bubbles: true }))
              el.dispatchEvent(new Event('change', { bubbles: true }))
            }
            return true
          })()`,
          true,
        )
        return { ok: true }
      }
      default:
        return { ok: false, reason: "unknown_action" }
    }
  }

  /** Attach native input listeners so human interaction preempts the agent. */
  attachHumanPreemption(id: string) {
    const wc = this.manager.getWebContents(id)
    if (!wc || wc.isDestroyed()) return
    const bump = () => {
      if (this.controlOwner === "agent") this.bumpHumanControl()
    }
    wc.on("before-input-event", (_event, input) => {
      // Only bump on real key presses / mouse — not synthetic agent events if marked.
      if (input.type === "keyDown" || input.type === "mouseDown") bump()
    })
    wc.on("dom-ready", () => {
      void wc
        .executeJavaScript(
          `(() => {
            if (window.__articulateHumanPreempt) return
            window.__articulateHumanPreempt = true
            const notify = () => {
              try { window.articulateDesktopHumanInteracted && window.articulateDesktopHumanInteracted() } catch (_) {}
            }
            // Pointer/wheel in page — IPC notify is optional; main before-input-event covers most.
            window.addEventListener('pointerdown', notify, { capture: true, passive: true })
            window.addEventListener('wheel', notify, { capture: true, passive: true })
          })()`,
          true,
        )
        .catch(() => undefined)
    })
  }
}
