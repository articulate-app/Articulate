import { mintLocalBrowserAccessToken, ALL_LOCAL_BROWSER_SCOPES } from "./app/lib/browser-helper-auth.ts"
import WebSocket from "./tools/articulate-browser-bridge/node_modules/ws/wrapper.mjs"

const health = await (await fetch("http://127.0.0.1:17321/health")).json()
const jwks = await (await fetch("http://127.0.0.1:3000/api/browser-helper/jwks")).json()
await fetch("http://127.0.0.1:17321/v1/pairing/verification-key", {
  method: "POST",
  headers: { "Content-Type": "application/json", Origin: "http://127.0.0.1:3000" },
  body: JSON.stringify({ publicKeyPem: jwks.publicKeyPem }),
})
const minted = await mintLocalBrowserAccessToken({
  sub: "diag3", user_id: 1, device_id: health.deviceId, scope: ALL_LOCAL_BROWSER_SCOPES,
})
const auth = { Authorization: `Bearer ${minted.token}`, "Content-Type": "application/json", Origin: "http://127.0.0.1:3000" }
const started = await (await fetch("http://127.0.0.1:17321/v1/sessions", {
  method: "POST", headers: auth, body: JSON.stringify({ url: "https://example.com", profileKey: "diag-sharp2" }),
})).json()
console.log("session headless", started.session?.headless)
const sid = started.session.id
const vp = await (await fetch(`http://127.0.0.1:17321/v1/sessions/${sid}/viewport`, {
  method: "POST", headers: auth, body: JSON.stringify({ width: 820, height: 960, deviceScaleFactor: 2 }),
})).json()
console.log("viewport diagnostics", JSON.stringify(vp.diagnostics, null, 2))

const frames: any[] = []
await new Promise((resolve, reject) => {
  const ws = new WebSocket(`ws://127.0.0.1:17321/v1/sessions/${sid}/stream?access_token=${minted.token}`)
  const t0 = Date.now()
  ws.on("message", (data, isBinary) => {
    if (!isBinary) return
    const view = new DataView(data.buffer, data.byteOffset, data.byteLength)
    const deviceWidth = view.getFloat32(1 + 8, true)
    const deviceHeight = view.getFloat32(1 + 12, true)
    const jpegLen = view.getUint32(1 + 24, true)
    const jpeg = Buffer.from(data.buffer, data.byteOffset + 29, jpegLen)
    let w=0,h=0
    for (let i=0;i<jpeg.length-9;i++) {
      if (jpeg[i]===0xff && (jpeg[i+1]===0xc0 || jpeg[i+1]===0xc2)) {
        h=(jpeg[i+5]<<8)|jpeg[i+6]; w=(jpeg[i+7]<<8)|jpeg[i+8]; break
      }
    }
    frames.push({ w,h, jpegLen, meta:`${deviceWidth}x${deviceHeight}`, t: Date.now()-t0 })
    if (frames.length >= 8) { ws.close(); resolve(null) }
  })
  ws.on("error", reject)
  setTimeout(() => reject(new Error("timeout")), 12000)
})
const elapsed = frames[frames.length-1].t
console.log(JSON.stringify({
  format: "jpeg",
  quality: vp.diagnostics?.screencast?.quality,
  mode: vp.diagnostics?.screencast?.mode,
  maxWidth: vp.diagnostics?.screencast?.maxWidth,
  maxHeight: vp.diagnostics?.screencast?.maxHeight,
  deviceScaleFactor: vp.diagnostics?.deviceScaleFactor,
  cssViewport: vp.diagnostics?.viewport,
  jpegPixels: `${frames[0].w}x${frames[0].h}`,
  metaCss: frames[0].meta,
  expectedAtDpr2: "1640x1920",
  fpsApprox: +(frames.length / (elapsed/1000)).toFixed(1),
  avgJpegKB: Math.round(frames.reduce((a,f)=>a+f.jpegLen,0)/frames.length/1024),
  chromeWindow: "headless=new (no native window)",
}, null, 2))

await fetch(`http://127.0.0.1:17321/v1/sessions/${sid}/stop`, { method: "POST", headers: auth })
