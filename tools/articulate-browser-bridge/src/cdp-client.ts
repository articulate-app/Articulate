import { EventEmitter } from "node:events"
import WebSocket from "ws"

type CdpResponse = {
  id?: number
  method?: string
  params?: unknown
  result?: unknown
  error?: { message?: string; code?: number }
}

/**
 * Persistent CDP client for one page/browser target.
 * Supports request/response and event subscriptions (required for screencast).
 * Used only inside the Bridge — never expose raw CDP URLs to the frontend.
 */
export class CdpClient extends EventEmitter {
  private ws: WebSocket | null = null
  private nextId = 1
  private pending = new Map<
    number,
    { resolve: (value: unknown) => void; reject: (error: Error) => void }
  >()
  private connecting: Promise<void> | null = null

  constructor(private readonly wsUrl: string) {
    super()
  }

  get isOpen(): boolean {
    return Boolean(this.ws && this.ws.readyState === WebSocket.OPEN)
  }

  async connect(): Promise<void> {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) return
    if (this.connecting) return this.connecting
    this.connecting = new Promise<void>((resolve, reject) => {
      const ws = new WebSocket(this.wsUrl)
      const timer = setTimeout(() => {
        try {
          ws.close()
        } catch {
          // ignore
        }
        reject(new Error("CDP connect timed out"))
      }, 10_000)
      ws.on("open", () => {
        clearTimeout(timer)
        this.ws = ws
        this.connecting = null
        resolve()
      })
      ws.on("error", (error) => {
        clearTimeout(timer)
        this.connecting = null
        reject(error instanceof Error ? error : new Error(String(error)))
      })
      ws.on("message", (raw) => {
        try {
          const msg = JSON.parse(String(raw)) as CdpResponse
          if (typeof msg.id === "number" && this.pending.has(msg.id)) {
            const entry = this.pending.get(msg.id)!
            this.pending.delete(msg.id)
            if (msg.error?.message) entry.reject(new Error(msg.error.message))
            else entry.resolve(msg.result)
            return
          }
          if (typeof msg.method === "string") {
            this.emit("event", msg.method, msg.params)
            this.emit(msg.method, msg.params)
          }
        } catch {
          // ignore non-JSON
        }
      })
      ws.on("close", () => {
        this.ws = null
        this.emit("close")
        for (const [, entry] of this.pending) {
          entry.reject(new Error("CDP socket closed"))
        }
        this.pending.clear()
      })
    })
    return this.connecting
  }

  async send<T = unknown>(method: string, params?: Record<string, unknown>): Promise<T> {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      await this.connect()
    }
    const ws = this.ws
    if (!ws || ws.readyState !== WebSocket.OPEN) {
      throw new Error("CDP not connected")
    }
    const id = this.nextId++
    const result = await new Promise<unknown>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id)
        reject(new Error(`CDP ${method} timed out`))
      }, 30_000)
      this.pending.set(id, {
        resolve: (value) => {
          clearTimeout(timer)
          resolve(value)
        },
        reject: (error) => {
          clearTimeout(timer)
          reject(error)
        },
      })
      ws.send(JSON.stringify({ id, method, params }))
    })
    return result as T
  }

  async close(): Promise<void> {
    if (!this.ws) return
    try {
      this.ws.close()
    } catch {
      // ignore
    }
    this.ws = null
  }
}

export async function withPageCdp<T>(
  wsUrl: string,
  fn: (client: CdpClient) => Promise<T>,
): Promise<T> {
  const client = new CdpClient(wsUrl)
  try {
    await client.connect()
    await client.send("Page.enable")
    await client.send("Runtime.enable")
    await client.send("DOM.enable").catch(() => undefined)
    return await fn(client)
  } finally {
    await client.close()
  }
}
