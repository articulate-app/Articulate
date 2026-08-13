import { getBrowserState, runBrowserAction } from "../src/actions.ts"
import type { LocalBrowserSession } from "../src/chrome.ts"
import { listPageTargets } from "../src/chrome.ts"
import { withPageCdp } from "../src/cdp-client.ts"

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

async function dump(label: string) {
  const state = await getBrowserState(session)
  console.log(`\n=== ${label} ===`)
  console.log(state.url, state.title, "elements=", state.elements.length)
  for (const e of state.elements) {
    if (e.text) console.log(`[${e.index}] ${JSON.stringify(e.text)}`)
  }
  return state
}

await runBrowserAction(session, {
  type: "navigate",
  url: "https://ivo-relvas-t2lp.squarespace.com/config/pages",
})
await new Promise((r) => setTimeout(r, 2500))
let state = await dump("initial")

// Scroll the pages panel area if possible.
const pages = await listPageTargets(session)
const ws = pages[0]?.webSocketDebuggerUrl
if (ws) {
  await withPageCdp(ws, async (client) => {
    await client.send("Runtime.evaluate", {
      expression: `(() => {
        const candidates = Array.from(document.querySelectorAll('*')).filter(el => {
          const t = (el.textContent || '');
          return t.includes('ADD PAGE') && t.includes('Services');
        });
        const panel = candidates.sort((a,b) => a.getBoundingClientRect().width - b.getBoundingClientRect().width)[0];
        if (panel) panel.scrollTop = panel.scrollHeight;
        window.scrollBy(0, 400);
        return !!panel;
      })()`,
      returnByValue: true,
    })
  })
  await new Promise((r) => setTimeout(r, 500))
  state = await dump("after scroll")
}

const artigos = state.elements.filter(
  (e) => /artigos/i.test(e.text) && e.text.trim().length <= 40,
)
console.log("\nArtigos candidates:", artigos)

if (!artigos.length) {
  // Fallback: search DOM text nodes via CDP
  if (!ws) throw new Error("No Artigos and no ws")
  const found = await withPageCdp(ws, async (client) => {
    const result = (await client.send("Runtime.evaluate", {
      expression: `(() => {
        const all = Array.from(document.querySelectorAll('*'));
        const hits = [];
        for (const el of all) {
          const text = (el.innerText || '').trim();
          if (text === 'Artigos') {
            const rect = el.getBoundingClientRect();
            if (rect.width > 2 && rect.height > 2) {
              hits.push({
                tag: el.tagName.toLowerCase(),
                className: String(el.className || '').slice(0, 120),
                x: Math.round(rect.left + 20),
                y: Math.round(rect.top + rect.height / 2),
              });
            }
          }
        }
        return hits.slice(0, 10);
      })()`,
      returnByValue: true,
    })) as { result?: { value?: Array<{ tag: string; className: string; x: number; y: number }> } }
    return result.result?.value || []
  })
  console.log("DOM Artigos hits:", found)
  if (!found.length) throw new Error("Artigos not in DOM")
  const p = found[found.length - 1]!
  await withPageCdp(ws, async (client) => {
    for (const clickCount of [1, 2]) {
      await client.send("Input.dispatchMouseEvent", {
        type: "mousePressed",
        x: p.x,
        y: p.y,
        button: "left",
        clickCount,
      })
      await client.send("Input.dispatchMouseEvent", {
        type: "mouseReleased",
        x: p.x,
        y: p.y,
        button: "left",
        clickCount,
      })
    }
  })
} else {
  const target = artigos[artigos.length - 1]!
  await runBrowserAction(session, { type: "click", index: target.index })
  await new Promise((r) => setTimeout(r, 800))
  await runBrowserAction(session, { type: "click", index: target.index })
}

await new Promise((r) => setTimeout(r, 2000))
await dump("after artigos click")
