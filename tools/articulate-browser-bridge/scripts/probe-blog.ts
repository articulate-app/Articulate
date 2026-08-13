import { getBrowserState, runBrowserAction, captureScreenshotPngBase64 } from "../src/actions.ts"
import type { LocalBrowserSession } from "../src/chrome.ts"
import { listPageTargets } from "../src/chrome.ts"
import { withPageCdp } from "../src/cdp-client.ts"
import { writeFileSync } from "node:fs"

const label = process.env.PAGE_LABEL || "Artigos"
const session = {
  id: "adopted",
  status: "active",
  startUrl: "",
  currentUrl: "",
  title: "",
  userDataDir: "",
  debuggingPort: Number(process.env.CDP_PORT || 58512),
  cdpHttpBase: `http://127.0.0.1:${process.env.CDP_PORT || 58512}`,
  startedAt: new Date().toISOString(),
  process: null,
} as LocalBrowserSession

await runBrowserAction(session, {
  type: "navigate",
  url: "https://ivo-relvas-t2lp.squarespace.com/config/pages",
})
await new Promise((r) => setTimeout(r, 3500))
let state = await getBrowserState(session)
for (let i = 0; i < 5 && !state.elements.some((e) => e.text === label); i += 1) {
  await new Promise((r) => setTimeout(r, 1000))
  state = await getBrowserState(session)
}

const pages = await listPageTargets(session)
const ws = pages[0]?.webSocketDebuggerUrl
if (!ws) throw new Error("no ws")

await withPageCdp(ws, async (client) => {
  const scrolled = (await client.send("Runtime.evaluate", {
    expression: `(() => {
      const wanted = ${JSON.stringify(label)};
      const nodes = Array.from(document.querySelectorAll('p'));
      const el = nodes.find((n) => (n.innerText || '').trim() === wanted);
      if (!el) return null;
      el.scrollIntoView({ block: 'center', inline: 'nearest' });
      const rect = el.getBoundingClientRect();
      return {
        text: (el.innerText || '').trim(),
        x: Math.round(rect.left + Math.min(rect.width / 2, 40)),
        y: Math.round(rect.top + rect.height / 2),
        top: Math.round(rect.top),
        w: Math.round(rect.width),
        h: Math.round(rect.height),
      };
    })()`,
    returnByValue: true,
  })) as { result?: { value?: Record<string, number | string> | null } }
  const target = scrolled.result?.value
  console.log("target", target)
  if (!target) throw new Error(`no ${label}`)
  const x = Number(target.x)
  const y = Number(target.y)

  await client.send("Input.dispatchMouseEvent", { type: "mouseMoved", x, y })
  await new Promise((r) => setTimeout(r, 250))
  await client.send("Input.dispatchMouseEvent", {
    type: "mousePressed",
    x,
    y,
    button: "left",
    clickCount: 1,
  })
  await client.send("Input.dispatchMouseEvent", {
    type: "mouseReleased",
    x,
    y,
    button: "left",
    clickCount: 1,
  })
})

await new Promise((r) => setTimeout(r, 2500))

await withPageCdp(ws, async (client) => {
  const info = (await client.send("Runtime.evaluate", {
    expression: `(() => {
      const bodyText = document.body.innerText || '';
      const needles = ['Add Post','ADD POST','New Post','Posts','Draft','Publish','Edit Post','Create Post','Escrever','Artigos','Blog'];
      const found = needles.filter((n) => bodyText.includes(n));
      const buttons = Array.from(document.querySelectorAll('button, a, [role="button"]'))
        .map(el => (el.innerText || el.getAttribute('aria-label') || '').trim())
        .filter(Boolean)
        .filter((t,i,arr) => arr.indexOf(t) === i)
        .slice(0, 80);
      return { found, buttons, href: location.href, title: document.title };
    })()`,
    returnByValue: true,
  })) as { result?: { value?: unknown } }
  console.log(JSON.stringify(info.result?.value, null, 2))
})

const png = await captureScreenshotPngBase64(session)
writeFileSync(`/tmp/sqsp-${label.toLowerCase()}-click.png`, Buffer.from(png, "base64"))
console.log(`Wrote /tmp/sqsp-${label.toLowerCase()}-click.png`)
