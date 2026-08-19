/**
 * Browser control layer.
 *
 * Articulate AI = reasoning.
 * BrowserController = deterministic page actions (Playwright-shaped).
 * BrowserProvider = where the browser runs (Desktop / Cloud).
 *
 * Cloud executes these actions over CDP (the same protocol Playwright uses).
 * Desktop maps the same commands onto the Electron WebContents controller.
 * Raw Playwright APIs are never exposed to the model.
 */

import {
  resolveVisualSearchPage,
  type VerifiedVisualAsset,
  type VisualFollowCandidate,
  type VisualPageKind,
} from "./visual-assets.ts"

export type BrowserControllerCommand =
  | "navigate"
  | "back"
  | "forward"
  | "reload"
  | "status"
  | "close"
  | "click"
  | "type"
  | "press"
  | "scroll"
  | "wait"
  | "snapshot"
  | "get_text"
  | "get_links"
  | "extract"
  | "screenshot"
  | "current_url"
  | "go_back"
  | "verify_url"

export const BROWSER_CONTROLLER_COMMANDS = new Set<BrowserControllerCommand>([
  "navigate",
  "back",
  "forward",
  "reload",
  "status",
  "close",
  "click",
  "type",
  "press",
  "scroll",
  "wait",
  "snapshot",
  "get_text",
  "get_links",
  "extract",
  "screenshot",
  "current_url",
  "go_back",
  "verify_url",
])

export const BROWSER_INSPECT_COMMANDS = new Set<BrowserControllerCommand>([
  "status",
  "snapshot",
  "get_text",
  "get_links",
  "extract",
  "screenshot",
  "current_url",
  "verify_url",
])

export type BrowserControllerInput = {
  command: BrowserControllerCommand
  url?: string | null
  selector?: string | null
  text?: string | null
  index?: number | null
  key?: string | null
  clear?: boolean | null
  deltaX?: number | null
  deltaY?: number | null
  x?: number | null
  y?: number | null
  ms?: number | null
  limit?: number | null
}

export type BrowserVerifiedLink = {
  text: string
  href: string
  verified: true
}

export type BrowserSnapshotElement = {
  index: number
  tag: string
  role: string | null
  name: string | null
  text: string | null
  href: string | null
}

export type BrowserSnapshot = {
  url: string
  title: string
  links: BrowserVerifiedLink[]
  elements: BrowserSnapshotElement[]
  text: string
  authRequired: boolean
}

export type BrowserControllerResult = {
  ok: boolean
  error: string | null
  error_code: string | null
  url: string
  title: string
  links: BrowserVerifiedLink[]
  text: string
  elements: BrowserSnapshotElement[]
  auth_required: boolean
  can_go_back: boolean
  can_go_forward: boolean
  verified: boolean | null
  screenshot_included: boolean
  page_kind?: VisualPageKind | null
  visual_assets?: VerifiedVisualAsset[]
  visual_follow_candidates?: VisualFollowCandidate[]
  unresolved_reason?: string | null
}

export const BROWSER_ERROR_CODES = {
  browser_unavailable: "browser_unavailable",
  local_bridge_unavailable: "local_bridge_unavailable",
  cloud_browser_unavailable: "cloud_browser_unavailable",
  browser_session_not_found: "browser_session_not_found",
  browser_session_expired: "browser_session_expired",
  browser_navigation_failed: "browser_navigation_failed",
  browser_navigation_timeout: "browser_navigation_timeout",
  browser_element_not_found: "browser_element_not_found",
  browser_auth_required: "browser_auth_required",
  browser_user_takeover_required: "browser_user_takeover_required",
  browser_provider_failure: "browser_provider_failure",
  browser_action_failed: "browser_action_failed",
} as const

export function isBrowserControllerCommand(value: unknown): value is BrowserControllerCommand {
  return BROWSER_CONTROLLER_COMMANDS.has(String(value ?? "").trim() as BrowserControllerCommand)
}

export function compactBrowserResult(result: BrowserControllerResult): BrowserControllerResult {
  return {
    ...result,
    text: result.text.slice(0, 4000),
    links: result.links.slice(0, 40),
    elements: result.elements.slice(0, 40),
    visual_assets: result.visual_assets?.slice(0, 8),
    visual_follow_candidates: result.visual_follow_candidates?.slice(0, 12),
  }
}

function attachVisualSearch(
  result: BrowserControllerResult,
  html?: string | null,
): BrowserControllerResult {
  const resolved = resolveVisualSearchPage({
    url: result.url,
    title: result.title,
    html,
    text: result.text,
    links: result.links,
  })
  return compactBrowserResult({
    ...result,
    page_kind: resolved.page_kind,
    visual_assets: resolved.visual_assets,
    visual_follow_candidates: resolved.follow_candidates,
    unresolved_reason: resolved.unresolved_reason,
  })
}

export function emptyBrowserResult(
  errorCode: string,
  error: string,
  url = "",
): BrowserControllerResult {
  return {
    ok: false,
    error,
    error_code: errorCode,
    url,
    title: "",
    links: [],
    text: "",
    elements: [],
    auth_required: errorCode === BROWSER_ERROR_CODES.browser_auth_required,
    can_go_back: false,
    can_go_forward: false,
    verified: null,
    screenshot_included: false,
  }
}

/**
 * In-page control script. Playwright-shaped actions over the live DOM.
 * Returns compact structured output — never a raw DOM dump.
 */
export const PAGE_CONTROL_SCRIPT = `async (action) => {
  const asString = (value) => (typeof value === "string" ? value.trim() : "");
  const limit = Math.max(1, Math.min(Number(action && action.limit) || 24, 40));
  const visible = (el) => {
    if (!el) return false;
    const rect = el.getBoundingClientRect();
    if (rect.width < 2 || rect.height < 2) return false;
    if (rect.bottom < 0 || rect.right < 0 || rect.top > window.innerHeight || rect.left > window.innerWidth) return false;
    const style = window.getComputedStyle(el);
    return style.visibility !== "hidden" && style.display !== "none" && Number(style.opacity) !== 0;
  };
  const hrefOf = (el) => {
    if (!el) return null;
    const node = el.closest && el.closest("a[href]") || (el.tagName === "A" ? el : null);
    const href = node && node.href ? String(node.href) : "";
    return href && !href.startsWith("javascript:") ? href : null;
  };
  const collectLinks = () => {
    const seen = new Set();
    const links = [];
    const anchors = Array.from(document.querySelectorAll("a[href]"));
    for (const a of anchors) {
      if (links.length >= limit) break;
      if (!visible(a)) continue;
      const href = hrefOf(a);
      if (!href || seen.has(href)) continue;
      seen.add(href);
      const text = (a.innerText || a.getAttribute("aria-label") || a.getAttribute("title") || "").replace(/\\s+/g, " ").trim().slice(0, 120);
      links.push({ text, href, verified: true });
    }
    return links;
  };
  const collectElements = () => {
    const candidates = Array.from(document.querySelectorAll('a,button,input,textarea,select,[role="button"],[role="link"],[contenteditable="true"]'));
    const elements = [];
    for (const el of candidates) {
      if (elements.length >= 40) break;
      if (!visible(el)) continue;
      const text = (el.innerText || el.getAttribute("aria-label") || el.getAttribute("placeholder") || "").replace(/\\s+/g, " ").trim().slice(0, 80);
      elements.push({
        index: elements.length,
        tag: el.tagName.toLowerCase(),
        role: el.getAttribute("role"),
        name: el.getAttribute("name") || el.id || null,
        text: text || null,
        href: hrefOf(el),
      });
    }
    return elements;
  };
  const authRequired = (() => {
    const text = ((document.body && document.body.innerText) || "").slice(0, 4000).toLowerCase();
    const url = String(location.href || "").toLowerCase();
    return /\\b(sign in|log in|login|password|verify you are human|captcha)\\b/.test(text)
      || /\\/(login|signin|sign-in|auth)\\b/.test(url);
  })();
  const pageText = ((document.body && document.body.innerText) || "").replace(/\\s+/g, " ").trim().slice(0, 4000);
  const snapshot = () => ({
    url: String(location.href || ""),
    title: String(document.title || ""),
    links: collectLinks(),
    elements: collectElements(),
    text: pageText,
    authRequired,
  });
  const findByIndex = (index) => {
    const elements = Array.from(document.querySelectorAll('a,button,input,textarea,select,[role="button"],[role="link"],[contenteditable="true"]')).filter(visible);
    return elements[index] || null;
  };
  const findBySelector = (selector) => {
    if (!selector) return null;
    try {
      const nodes = Array.from(document.querySelectorAll(selector));
      return nodes.find(visible) || nodes[0] || null;
    } catch {
      return null;
    }
  };
  const findByText = (needle) => {
    const target = asString(needle).toLowerCase();
    if (!target) return null;
    const candidates = Array.from(document.querySelectorAll('a,button,[role="button"],[role="link"],input,textarea,select,label'));
    return candidates.find((el) => {
      if (!visible(el)) return false;
      const text = (el.innerText || el.getAttribute("aria-label") || el.getAttribute("placeholder") || el.value || "").replace(/\\s+/g, " ").trim().toLowerCase();
      return text.includes(target);
    }) || null;
  };
  const clickEl = (el) => {
    if (!el) return false;
    el.scrollIntoView({ block: "center", inline: "center" });
    if (typeof el.click === "function") el.click();
    else el.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
    return true;
  };
  const command = asString(action && action.command) || "snapshot";
  if (command === "wait") {
    const ms = Math.min(Math.max(Number(action && action.ms) || 400, 0), 15000);
    await new Promise((resolve) => setTimeout(resolve, ms));
  }
  if (command === "scroll") {
    window.scrollBy(Number(action && action.deltaX) || 0, Number(action && action.deltaY) || 600);
  }
  if (command === "click") {
    const el =
      (Number.isFinite(Number(action && action.index)) ? findByIndex(Number(action.index)) : null)
      || findBySelector(asString(action && action.selector))
      || findByText(asString(action && action.text));
    if (!clickEl(el)) {
      return { ok: false, error: "element_not_found", errorCode: "browser_element_not_found", ...snapshot() };
    }
  }
  if (command === "type") {
    const el =
      findBySelector(asString(action && action.selector))
      || findByIndex(Number(action && action.index))
      || document.activeElement;
    if (!el) {
      return { ok: false, error: "element_not_found", errorCode: "browser_element_not_found", ...snapshot() };
    }
    el.focus();
    if (action && action.clear && "value" in el) {
      el.value = "";
      el.dispatchEvent(new Event("input", { bubbles: true }));
    }
    const value = String((action && action.text) || "");
    if ("value" in el) {
      el.value = (action && action.clear) ? value : String(el.value || "") + value;
      el.dispatchEvent(new Event("input", { bubbles: true }));
      el.dispatchEvent(new Event("change", { bubbles: true }));
    } else if (el.isContentEditable) {
      el.textContent = (action && action.clear) ? value : String(el.textContent || "") + value;
      el.dispatchEvent(new Event("input", { bubbles: true }));
    }
  }
  if (command === "press") {
    const key = asString(action && action.key) || "Enter";
    const target = document.activeElement || document.body;
    target.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true }));
    target.dispatchEvent(new KeyboardEvent("keyup", { key, bubbles: true }));
    if (key === "Enter" && target && typeof target.form?.requestSubmit === "function") {
      target.form.requestSubmit();
    }
  }
  if (command === "extract") {
    const selector = asString(action && action.selector) || "a[href]";
    const nodes = (() => {
      try { return Array.from(document.querySelectorAll(selector)); } catch { return []; }
    })();
    const links = [];
    const seen = new Set();
    for (const node of nodes) {
      if (links.length >= limit) break;
      const href = hrefOf(node);
      if (!href || seen.has(href)) continue;
      seen.add(href);
      const text = (node.innerText || node.getAttribute("aria-label") || node.getAttribute("alt") || "").replace(/\\s+/g, " ").trim().slice(0, 120);
      links.push({ text, href, verified: true });
    }
    const snap = snapshot();
    return { ok: true, error: null, errorCode: null, ...snap, links };
  }
  return { ok: true, error: null, errorCode: null, ...snapshot() };
}`

export function mapPageScriptResult(raw: unknown, extras?: Partial<BrowserControllerResult>): BrowserControllerResult {
  const record = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {}
  const linksRaw = Array.isArray(record.links) ? record.links : []
  const elementsRaw = Array.isArray(record.elements) ? record.elements : []
  const links: BrowserVerifiedLink[] = []
  for (const item of linksRaw) {
    if (!item || typeof item !== "object") continue
    const href = typeof (item as { href?: unknown }).href === "string" ? (item as { href: string }).href.trim() : ""
    if (!href) continue
    const text =
      typeof (item as { text?: unknown }).text === "string" ? (item as { text: string }).text.trim() : ""
    links.push({ text, href, verified: true })
  }
  const elements: BrowserSnapshotElement[] = []
  for (const item of elementsRaw) {
    if (!item || typeof item !== "object") continue
    const row = item as Record<string, unknown>
    elements.push({
      index: Number(row.index) || elements.length,
      tag: typeof row.tag === "string" ? row.tag : "",
      role: typeof row.role === "string" ? row.role : null,
      name: typeof row.name === "string" ? row.name : null,
      text: typeof row.text === "string" ? row.text : null,
      href: typeof row.href === "string" ? row.href : null,
    })
  }
  const errorCode = typeof record.errorCode === "string" ? record.errorCode : extras?.error_code ?? null
  const error = typeof record.error === "string" ? record.error : extras?.error ?? null
  const html = typeof record.html === "string" ? record.html : null
  return attachVisualSearch({
    ok: record.ok !== false && !error,
    error,
    error_code: errorCode,
    url: typeof record.url === "string" ? record.url : extras?.url ?? "",
    title: typeof record.title === "string" ? record.title : extras?.title ?? "",
    links,
    text: typeof record.text === "string" ? record.text : "",
    elements,
    auth_required: record.authRequired === true,
    can_go_back: extras?.can_go_back ?? false,
    can_go_forward: extras?.can_go_forward ?? false,
    verified: extras?.verified ?? null,
    screenshot_included: extras?.screenshot_included ?? false,
  }, html)
}

export function desktopObservationToResult(observation: {
  url?: string
  title?: string
  canGoBack?: boolean
  canGoForward?: boolean
  elements?: Array<{
    index: number
    tag: string
    role: string | null
    name: string | null
    text: string | null
    href: string | null
  }>
  pageTextPreview?: string
} | null): BrowserControllerResult {
  const links: BrowserVerifiedLink[] = []
  const seen = new Set<string>()
  for (const el of observation?.elements ?? []) {
    const href = typeof el.href === "string" ? el.href.trim() : ""
    if (!href || seen.has(href)) continue
    seen.add(href)
    links.push({ text: el.text ?? "", href, verified: true })
  }
  return attachVisualSearch({
    ok: true,
    error: null,
    error_code: null,
    url: observation?.url ?? "",
    title: observation?.title ?? "",
    links,
    text: observation?.pageTextPreview ?? "",
    elements: observation?.elements ?? [],
    auth_required: false,
    can_go_back: observation?.canGoBack ?? false,
    can_go_forward: observation?.canGoForward ?? false,
    verified: null,
    screenshot_included: false,
  })
}
