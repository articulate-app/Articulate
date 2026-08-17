import { spawn } from "node:child_process"
import { createServer } from "node:net"
import { execFile } from "node:child_process"
import { promisify } from "node:util"
import WebSocket from "ws"
import { resolveChromeExecutable } from "./src/chrome.ts"
const execFileAsync = promisify(execFile)
function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const s = createServer(); s.listen(0,"127.0.0.1",()=>{const a=s.address(); if(!a||typeof a==="string"){reject();return}; const p=a.port; s.close(()=>resolve(p))})
  })
}
const port = await freePort()
const child = spawn(resolveChromeExecutable(), [
  `--remote-debugging-port=${port}`,`--remote-debugging-address=127.0.0.1`,
  `--user-data-dir=/tmp/art-hide-${port}`,"--no-first-run","--window-size=1280,900","https://example.com",
], { stdio:"ignore" })
for (let i=0;i<50;i++){ try{ if((await fetch(`http://127.0.0.1:${port}/json/version`)).ok) break }catch{} await new Promise(r=>setTimeout(r,100))}
await new Promise(r=>setTimeout(r,400))
const pages = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()
const page = pages.find((p:any)=>p.type==="page")
function cdp(wsUrl:string){ let id=0; const ws=new WebSocket(wsUrl); const pending=new Map(); const ready=new Promise<void>((res,rej)=>{ws.on("open",()=>res()); ws.on("error",rej)}); ws.on("message",(raw)=>{const msg=JSON.parse(String(raw)); if(msg.id&&pending.has(msg.id)){const p=pending.get(msg.id); pending.delete(msg.id); msg.error?p.reject(new Error(JSON.stringify(msg.error))):p.resolve(msg.result)}}); return { ready, send:(m:string,p?:any)=>new Promise((res,rej)=>{const my=++id; pending.set(my,{resolve:res,reject:rej}); ws.send(JSON.stringify({id:my,method:m,params:p}))}), close:()=>ws.close() } }
const client=cdp(page.webSocketDebuggerUrl); await client.ready; await client.send("Page.enable")
await client.send("Emulation.setDeviceMetricsOverride",{width:820,height:960,deviceScaleFactor:2,mobile:false})
await execFileAsync("osascript",["-e",`tell application "System Events" to set visible of (first process whose unix id is ${child.pid}) to false`])
const t0=Date.now(); const sizes:any[]=[]
for (let i=0;i<10;i++){
  const shot=await client.send("Page.captureScreenshot",{format:"jpeg",quality:88,fromSurface:true})
  const jpeg=Buffer.from(shot.data,"base64"); let w=0,h=0
  for (let j=0;j<jpeg.length-9;j++){ if(jpeg[j]===0xff&&(jpeg[j+1]===0xc0||jpeg[j+1]===0xc2)){ h=(jpeg[j+5]<<8)|jpeg[j+6]; w=(jpeg[j+7]<<8)|jpeg[j+8]; break } }
  sizes.push({w,h,bytes:jpeg.length})
}
console.log(JSON.stringify({ hiddenCapture:{ n:10, elapsedMs:Date.now()-t0, avgMs:Math.round((Date.now()-t0)/10), sample: sizes[0] } }, null, 2))
// also try without fromSurface
const shot2=await client.send("Page.captureScreenshot",{format:"jpeg",quality:88,fromSurface:false})
const jpeg2=Buffer.from(shot2.data,"base64"); let w2=0,h2=0
for (let j=0;j<jpeg2.length-9;j++){ if(jpeg2[j]===0xff&&(jpeg2[j+1]===0xc0||jpeg2[j+1]===0xc2)){ h2=(jpeg2[j+5]<<8)|jpeg2[j+6]; w2=(jpeg2[j+7]<<8)|jpeg2[j+8]; break } }
console.log("fromSurface false while hidden", {w:w2,h:h2,bytes:jpeg2.length})
client.close(); child.kill(); process.exit(0)
