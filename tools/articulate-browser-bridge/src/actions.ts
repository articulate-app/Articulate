import type { LocalBrowserSession } from "./chrome.js"
import { listPageTargets, refreshSessionMeta } from "./chrome.js"
import { withPageCdp, type CdpClient } from "./cdp-client.js"

export type InteractiveElement = {
  index: number
  tag: string
  role: string
  type: string
  text: string
  name: string
  href: string
  placeholder: string
  /** Never includes real password values. */
  value: string
  isPassword: boolean
}

export type BrowserState = {
  url: string
  title: string
  elements: InteractiveElement[]
  note: string
}

export type BrowserAction =
  | { type: "navigate"; url: string }
  | { type: "back" }
  | { type: "forward" }
  | { type: "reload" }
  | { type: "click"; index: number }
  | { type: "type"; index: number; text: string; submit?: boolean }
  | { type: "scroll"; direction: "up" | "down"; amount?: number }
  | { type: "wait"; ms?: number }

async function pageWsUrl(session: LocalBrowserSession): Promise<string> {
  const pages = await listPageTargets(session)
  const page = pages[0]
  if (!page?.webSocketDebuggerUrl) {
    throw new Error("No page CDP target available")
  }
  return page.webSocketDebuggerUrl
}

async function evaluateJson<T>(client: CdpClient, expression: string): Promise<T> {
  const result = await client.send<{
    result?: { type?: string; value?: unknown; unserializableValue?: string }
    exceptionDetails?: { text?: string }
  }>("Runtime.evaluate", {
    expression,
    returnByValue: true,
    awaitPromise: true,
  })
  if (result.exceptionDetails?.text) {
    throw new Error(result.exceptionDetails.text)
  }
  return result.result?.value as T
}

const STATE_SCRIPT = `(() => {
  const nodes = Array.from(document.querySelectorAll(
    'a[href], button, input, textarea, select, [role="button"], [role="link"], [role="treeitem"], [role="menuitem"], [contenteditable="true"], [data-test*="page"], [class*="page-tree"] [tabindex], [class*="PageTree"] *, [class*="pages-tree"] *'
  ));
  // Prefer leaf-ish labeled controls; drop huge nested containers later via text length.
  const visible = nodes.filter((el) => {
    const style = window.getComputedStyle(el);
    if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') return false;
    const rect = el.getBoundingClientRect();
    if (rect.width < 2 || rect.height < 2) return false;
    const text = (el.innerText || el.textContent || '').trim();
    // Keep short labels (page names) and standard controls; skip giant wrappers.
    if (text.length > 80 && !['A','BUTTON','INPUT','TEXTAREA','SELECT'].includes(el.tagName)) return false;
    return true;
  }).slice(0, 160);

  // Mark elements for reliable click/type by index (Bridge-owned attribute).
  document.querySelectorAll('[data-articulate-idx]').forEach((el) => el.removeAttribute('data-articulate-idx'));

  return visible.map((el, index) => {
    el.setAttribute('data-articulate-idx', String(index));
    const tag = (el.tagName || '').toLowerCase();
    const type = (el.getAttribute('type') || '').toLowerCase();
    const isPassword = tag === 'input' && type === 'password';
    const rawValue = 'value' in el ? String(el.value ?? '') : '';
    const text = (el.innerText || el.textContent || '').trim().replace(/\\s+/g, ' ').slice(0, 120);
    return {
      index,
      tag,
      role: el.getAttribute('role') || '',
      type,
      text,
      name: el.getAttribute('name') || el.getAttribute('aria-label') || '',
      href: el.getAttribute('href') || '',
      placeholder: el.getAttribute('placeholder') || '',
      value: isPassword ? (rawValue ? '[REDACTED]' : '') : rawValue.slice(0, 80),
      isPassword,
    };
  });
})()`

export async function getBrowserState(session: LocalBrowserSession): Promise<BrowserState> {
  const wsUrl = await pageWsUrl(session)
  const payload = await withPageCdp(wsUrl, async (client) => {
    const url = await evaluateJson<string>(client, "location.href")
    const title = await evaluateJson<string>(client, "document.title")
    const elements = await evaluateJson<InteractiveElement[]>(client, STATE_SCRIPT)
    return { url, title, elements: Array.isArray(elements) ? elements : [] }
  })
  session.currentUrl = payload.url || session.currentUrl
  session.title = payload.title || session.title
  return {
    ...payload,
    note: "Password field values are redacted. Do not ask the user to paste passwords into the agent.",
  }
}

async function clickIndex(client: CdpClient, index: number): Promise<void> {
  const point = await evaluateJson<{ x: number; y: number } | null>(
    client,
    `(() => {
      const el = document.querySelector('[data-articulate-idx="${index}"]');
      if (!el) return null;
      el.scrollIntoView({ block: 'center', inline: 'nearest' });
      const rect = el.getBoundingClientRect();
      // Re-measure after scroll — CDP mouse events use viewport coordinates.
      return {
        x: Math.round(rect.left + Math.min(Math.max(rect.width / 2, 8), 40)),
        y: Math.round(rect.top + rect.height / 2),
      };
    })()`,
  )
  if (!point) throw new Error(`No element at index ${index}. Call get_state first.`)
  if (point.y < 0 || point.x < 0) {
    throw new Error(`Element ${index} is offscreen after scroll (x=${point.x}, y=${point.y})`)
  }

  // Prefer real mouse events — Squarespace page-tree items often ignore element.click().
  await client.send("Input.dispatchMouseEvent", {
    type: "mouseMoved",
    x: point.x,
    y: point.y,
  })
  await client.send("Input.dispatchMouseEvent", {
    type: "mousePressed",
    x: point.x,
    y: point.y,
    button: "left",
    clickCount: 1,
  })
  await client.send("Input.dispatchMouseEvent", {
    type: "mouseReleased",
    x: point.x,
    y: point.y,
    button: "left",
    clickCount: 1,
  })
}

async function typeIndex(
  client: CdpClient,
  index: number,
  text: string,
  submit: boolean,
): Promise<void> {
  // Never log `text` — may contain secrets typed by the agent into non-password fields.
  const ok = await evaluateJson<boolean>(
    client,
    `(() => {
      const el = document.querySelector('[data-articulate-idx="${index}"]');
      if (!el) return false;
      el.scrollIntoView({ block: 'center', inline: 'center' });
      el.focus();
      const tag = (el.tagName || '').toLowerCase();
      if (tag === 'input' || tag === 'textarea') {
        const proto = tag === 'textarea' ? window.HTMLTextAreaElement.prototype : window.HTMLInputElement.prototype;
        const setter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;
        if (setter) setter.call(el, ${JSON.stringify(text)});
        else el.value = ${JSON.stringify(text)};
        el.dispatchEvent(new Event('input', { bubbles: true }));
        el.dispatchEvent(new Event('change', { bubbles: true }));
      } else if (el.isContentEditable) {
        el.textContent = ${JSON.stringify(text)};
        el.dispatchEvent(new Event('input', { bubbles: true }));
      } else {
        return false;
      }
      if (${submit ? "true" : "false"}) {
        const form = el.closest('form');
        if (form) form.requestSubmit ? form.requestSubmit() : form.submit();
        else el.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
      }
      return true;
    })()`,
  )
  if (!ok) throw new Error(`Cannot type into index ${index}. Call get_state first.`)
}

export async function runBrowserAction(
  session: LocalBrowserSession,
  action: BrowserAction,
): Promise<{ ok: true; action: BrowserAction; durationMs: number }> {
  const started = Date.now()
  const wsUrl = await pageWsUrl(session)

  switch (action.type) {
    case "wait": {
      await new Promise((resolve) => setTimeout(resolve, Math.min(Math.max(action.ms ?? 500, 0), 10_000)))
      break
    }
    case "navigate": {
      if (!/^https?:\/\//i.test(action.url.trim())) {
        throw new Error("Only http(s) URLs are allowed")
      }
      await withPageCdp(wsUrl, async (client) => {
        await client.send("Page.navigate", { url: action.url.trim() })
      })
      await new Promise((resolve) => setTimeout(resolve, 400))
      break
    }
    case "back":
    case "forward":
    case "reload": {
      await withPageCdp(wsUrl, async (client) => {
        if (action.type === "back") {
          await evaluateJson(client, "history.back(); true")
        } else if (action.type === "forward") {
          await evaluateJson(client, "history.forward(); true")
        } else {
          await client.send("Page.reload", { ignoreCache: false })
        }
      })
      await new Promise((resolve) => setTimeout(resolve, 350))
      break
    }
    case "scroll": {
      const amount = Math.min(Math.max(action.amount ?? 600, 50), 2000)
      const delta = action.direction === "up" ? -amount : amount
      await withPageCdp(wsUrl, async (client) => {
        await evaluateJson(client, `window.scrollBy(0, ${delta}); true`)
      })
      break
    }
    case "click": {
      // Ensure indices exist for this page snapshot.
      await getBrowserState(session)
      await withPageCdp(await pageWsUrl(session), async (client) => {
        await clickIndex(client, action.index)
      })
      await new Promise((resolve) => setTimeout(resolve, 250))
      break
    }
    case "type": {
      await getBrowserState(session)
      await withPageCdp(await pageWsUrl(session), async (client) => {
        await typeIndex(client, action.index, action.text, Boolean(action.submit))
      })
      await new Promise((resolve) => setTimeout(resolve, 200))
      break
    }
    default: {
      const _exhaustive: never = action
      throw new Error(`Unsupported action: ${JSON.stringify(_exhaustive)}`)
    }
  }

  await refreshSessionMeta(session)
  return { ok: true, action, durationMs: Date.now() - started }
}

export async function captureScreenshotPngBase64(
  session: LocalBrowserSession,
): Promise<string> {
  const wsUrl = await pageWsUrl(session)
  return await withPageCdp(wsUrl, async (client) => {
    const result = await client.send<{ data: string }>("Page.captureScreenshot", {
      format: "png",
      fromSurface: true,
    })
    return result.data
  })
}
