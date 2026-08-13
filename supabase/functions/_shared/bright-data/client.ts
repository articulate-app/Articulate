/**
 * Bright Data Datasets API client (official v3 endpoints).
 * Docs: https://docs.brightdata.com/datasets/scrapers/concepts/sync-vs-async
 */

export type BrightDataTriggerOptions = {
  datasetId: string
  type?: "discover_new"
  discoverBy?: string
  format?: "json" | "ndjson" | "csv"
  includeErrors?: boolean
}

export type BrightDataProgress = {
  status: string
  snapshot_id?: string
  [key: string]: unknown
}

/**
 * A snapshot that is not ready yet is `pending`, never an error: Bright Data keeps
 * building it server-side, so the caller can persist the snapshot id and collect it
 * on a later invocation instead of paying for the same scrape twice.
 */
export type BrightDataCollectResult =
  | { status: "ready"; records: unknown[] }
  | { status: "pending"; lastStatus: string; transientError?: string }

const DEFAULT_POLL_INTERVAL_MS = 5_000
const DEFAULT_MAX_WAIT_MS = 90_000
const DEFAULT_RETRY_DELAY_MS = 600
const MAX_RETRY_DELAY_MS = 4_000
/** GETs are idempotent, so they can be retried freely. */
const READ_ATTEMPTS = 3
/** A retried trigger can start a second (billed) snapshot, so allow only one retry. */
const TRIGGER_ATTEMPTS = 2
const RETRYABLE_STATUS = new Set([408, 425, 429, 500, 502, 503, 504])

/**
 * Connection-level failures Deno surfaces when the pooled HTTP/2 link to
 * api.brightdata.com is torn down mid-request. They say nothing about the snapshot,
 * so the caller must retry rather than abandon a scrape it already paid for.
 */
const TRANSIENT_MESSAGE_PATTERN =
  /(error sending request|http2|h2 protocol error|connection (error|reset|closed|refused|aborted)|broken pipe|unexpected eof|tls handshake|dns error|os error (32|104|110)|failed to fetch|network error|stream closed|goaway|socket hang up|request timed out|operation timed out|deadline has elapsed)/i

export class BrightDataTransientError extends Error {
  readonly transient = true

  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options)
    this.name = "BrightDataTransientError"
  }
}

export function isTransientBrightDataMessage(message: string | null | undefined): boolean {
  return typeof message === "string" && TRANSIENT_MESSAGE_PATTERN.test(message)
}

export function isTransientBrightDataError(error: unknown): boolean {
  if (error instanceof BrightDataTransientError) return true
  if (error instanceof Error) return isTransientBrightDataMessage(error.message)
  return isTransientBrightDataMessage(String(error ?? ""))
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

type FetchInitWithClient = RequestInit & { client?: unknown }

/**
 * Bright Data's edge terminates pooled HTTP/2 connections aggressively; pinning the
 * runtime to HTTP/1.1 avoids the stream-level resets entirely. The API is unstable in
 * Deno and absent in Node, so a missing client just falls back to the default pool.
 */
function createHttp1Client(): unknown {
  const denoGlobal = (globalThis as {
    Deno?: { createHttpClient?: (options: Record<string, unknown>) => unknown }
  }).Deno
  if (typeof denoGlobal?.createHttpClient !== "function") return undefined
  try {
    return denoGlobal.createHttpClient({
      http1: true,
      http2: false,
      poolIdleTimeout: 5_000,
    })
  } catch {
    return undefined
  }
}

export class BrightDataClient {
  private readonly apiKey: string
  private readonly baseUrl = "https://api.brightdata.com/datasets/v3"
  private readonly retryDelayMs: number
  private httpClient: unknown = undefined
  private httpClientResolved = false

  constructor(apiKey: string, options: { retryDelayMs?: number } = {}) {
    if (!apiKey.trim()) {
      throw new Error("BRIGHT_DATA_API_KEY is missing")
    }
    this.apiKey = apiKey.trim()
    this.retryDelayMs = options.retryDelayMs ?? DEFAULT_RETRY_DELAY_MS
  }

  private authHeaders(): HeadersInit {
    return {
      Authorization: `Bearer ${this.apiKey}`,
      "Content-Type": "application/json",
    }
  }

  private resolveHttpClient(): unknown {
    if (!this.httpClientResolved) {
      this.httpClient = createHttp1Client()
      this.httpClientResolved = true
    }
    return this.httpClient
  }

  private backoffMs(attempt: number): number {
    const base = Math.min(this.retryDelayMs * 2 ** attempt, MAX_RETRY_DELAY_MS)
    return base + Math.floor(Math.random() * (this.retryDelayMs || 1))
  }

  /**
   * Retries connection blips and 5xx/429 responses, then reports whatever is left as a
   * transient error so callers can keep the snapshot alive instead of failing the run.
   */
  private async request(args: {
    url: string
    init: RequestInit
    label: string
    attempts: number
  }): Promise<Response> {
    let lastError: unknown = null

    for (let attempt = 0; attempt < args.attempts; attempt += 1) {
      const client = this.resolveHttpClient()
      const init: FetchInitWithClient = client ? { ...args.init, client } : args.init

      try {
        const response = await fetch(args.url, init)
        if (!RETRYABLE_STATUS.has(response.status) || attempt === args.attempts - 1) {
          return response
        }
        lastError = new BrightDataTransientError(
          `${args.label} returned ${response.status}`,
        )
        await response.body?.cancel().catch(() => {})
      } catch (error) {
        lastError = error
        // A rejected fetch may mean the custom client is unsupported here, so drop it
        // and let the remaining attempts use the runtime's default pool.
        if (client) {
          this.httpClient = undefined
        }
      }

      if (attempt < args.attempts - 1) await sleep(this.backoffMs(attempt))
    }

    const detail = lastError instanceof Error ? lastError.message : String(lastError)
    throw new BrightDataTransientError(
      `${args.label} failed after ${args.attempts} attempts: ${detail}`,
      { cause: lastError },
    )
  }

  async trigger(
    options: BrightDataTriggerOptions,
    input: unknown[],
  ): Promise<{ snapshot_id: string }> {
    const params = new URLSearchParams({
      dataset_id: options.datasetId,
      format: options.format ?? "json",
      include_errors: String(options.includeErrors ?? true),
    })
    if (options.type) params.set("type", options.type)
    if (options.discoverBy) params.set("discover_by", options.discoverBy)

    const response = await this.request({
      url: `${this.baseUrl}/trigger?${params.toString()}`,
      init: {
        method: "POST",
        headers: this.authHeaders(),
        body: JSON.stringify(input),
      },
      label: "Bright Data trigger",
      attempts: TRIGGER_ATTEMPTS,
    })

    const text = await response.text()
    let payload: unknown = null
    try {
      payload = text ? JSON.parse(text) : null
    } catch {
      payload = text
    }

    if (!response.ok) {
      throw new Error(
        `Bright Data trigger failed (${response.status}): ${
          typeof payload === "string" ? payload : JSON.stringify(payload)
        }`,
      )
    }

    const record = payload && typeof payload === "object"
      ? (payload as Record<string, unknown>)
      : null
    const snapshotId = typeof record?.snapshot_id === "string" ? record.snapshot_id : null
    if (!snapshotId) {
      throw new Error(`Bright Data trigger returned no snapshot_id: ${text}`)
    }
    return { snapshot_id: snapshotId }
  }

  async getProgress(snapshotId: string): Promise<BrightDataProgress> {
    const response = await this.request({
      url: `${this.baseUrl}/progress/${snapshotId}`,
      init: { method: "GET", headers: this.authHeaders() },
      label: `Bright Data progress ${snapshotId}`,
      attempts: READ_ATTEMPTS,
    })
    const text = await response.text()
    let payload: unknown = null
    try {
      payload = text ? JSON.parse(text) : null
    } catch {
      payload = { status: "unknown", raw: text }
    }
    if (!response.ok) {
      throw new Error(
        `Bright Data progress failed (${response.status}): ${text}`,
      )
    }
    return (payload ?? { status: "unknown" }) as BrightDataProgress
  }

  async downloadSnapshot(snapshotId: string): Promise<unknown[]> {
    const response = await this.request({
      url: `${this.baseUrl}/snapshot/${snapshotId}?format=json`,
      init: { method: "GET", headers: this.authHeaders() },
      label: `Bright Data snapshot download ${snapshotId}`,
      attempts: READ_ATTEMPTS,
    })
    const text = await response.text()
    if (!response.ok) {
      throw new Error(`Bright Data snapshot download failed (${response.status}): ${text}`)
    }
    if (!text.trim()) return []
    try {
      const parsed = JSON.parse(text)
      if (Array.isArray(parsed)) return parsed
      if (parsed && typeof parsed === "object") return [parsed]
      return []
    } catch {
      // NDJSON fallback
      return text
        .split("\n")
        .map((line) => line.trim())
        .filter(Boolean)
        .map((line) => JSON.parse(line))
    }
  }

  /**
   * Poll an existing snapshot until it is ready or the wait budget runs out.
   * Returns `pending` when the snapshot is still building so the caller can retry later.
   */
  async collect(
    snapshotId: string,
    args: { pollIntervalMs?: number; maxWaitMs?: number } = {},
  ): Promise<BrightDataCollectResult> {
    const pollIntervalMs = args.pollIntervalMs ?? DEFAULT_POLL_INTERVAL_MS
    const maxWaitMs = args.maxWaitMs ?? DEFAULT_MAX_WAIT_MS
    const started = Date.now()
    let lastStatus = "unknown"
    let transientError: string | undefined

    do {
      try {
        const progress = await this.getProgress(snapshotId)
        transientError = undefined
        lastStatus = String(progress.status ?? "unknown").toLowerCase()
        if (lastStatus === "ready") {
          return { status: "ready", records: await this.downloadSnapshot(snapshotId) }
        }
        if (lastStatus === "failed" || lastStatus === "error") {
          throw new Error(
            `Bright Data snapshot ${snapshotId} failed: ${JSON.stringify(progress)}`,
          )
        }
      } catch (error) {
        // The snapshot keeps building at Bright Data even when we cannot reach it,
        // so a network blip leaves the run pending rather than failing it.
        if (!isTransientBrightDataError(error)) throw error
        transientError = error instanceof Error ? error.message : String(error)
      }

      if (Date.now() - started + pollIntervalMs >= maxWaitMs) break
      await sleep(pollIntervalMs)
    } while (Date.now() - started < maxWaitMs)

    return transientError
      ? { status: "pending", lastStatus, transientError }
      : { status: "pending", lastStatus }
  }

  async triggerAndCollect(args: {
    options: BrightDataTriggerOptions
    input: unknown[]
    pollIntervalMs?: number
    maxWaitMs?: number
  }): Promise<{ snapshotId: string; records: unknown[] }> {
    const { snapshot_id } = await this.trigger(args.options, args.input)
    const collected = await this.collect(snapshot_id, {
      pollIntervalMs: args.pollIntervalMs,
      maxWaitMs: args.maxWaitMs,
    })
    if (collected.status === "pending") {
      throw new Error(
        `Bright Data snapshot ${snapshot_id} timed out after ${
          args.maxWaitMs ?? DEFAULT_MAX_WAIT_MS
        }ms`,
      )
    }
    return { snapshotId: snapshot_id, records: collected.records }
  }
}
