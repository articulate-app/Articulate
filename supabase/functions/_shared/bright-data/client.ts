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

const DEFAULT_POLL_INTERVAL_MS = 5_000
const DEFAULT_MAX_WAIT_MS = 90_000

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

export class BrightDataClient {
  private readonly apiKey: string
  private readonly baseUrl = "https://api.brightdata.com/datasets/v3"

  constructor(apiKey: string) {
    if (!apiKey.trim()) {
      throw new Error("BRIGHT_DATA_API_KEY is missing")
    }
    this.apiKey = apiKey.trim()
  }

  private authHeaders(): HeadersInit {
    return {
      Authorization: `Bearer ${this.apiKey}`,
      "Content-Type": "application/json",
    }
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

    const response = await fetch(`${this.baseUrl}/trigger?${params.toString()}`, {
      method: "POST",
      headers: this.authHeaders(),
      body: JSON.stringify(input),
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
    const response = await fetch(`${this.baseUrl}/progress/${snapshotId}`, {
      method: "GET",
      headers: this.authHeaders(),
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
    const response = await fetch(
      `${this.baseUrl}/snapshot/${snapshotId}?format=json`,
      {
        method: "GET",
        headers: this.authHeaders(),
      },
    )
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

  async triggerAndCollect(args: {
    options: BrightDataTriggerOptions
    input: unknown[]
    pollIntervalMs?: number
    maxWaitMs?: number
  }): Promise<{ snapshotId: string; records: unknown[] }> {
    const { snapshot_id } = await this.trigger(args.options, args.input)
    const pollIntervalMs = args.pollIntervalMs ?? DEFAULT_POLL_INTERVAL_MS
    const maxWaitMs = args.maxWaitMs ?? DEFAULT_MAX_WAIT_MS
    const started = Date.now()

    while (Date.now() - started < maxWaitMs) {
      const progress = await this.getProgress(snapshot_id)
      const status = String(progress.status ?? "").toLowerCase()
      if (status === "ready") {
        const records = await this.downloadSnapshot(snapshot_id)
        return { snapshotId: snapshot_id, records }
      }
      if (status === "failed" || status === "error") {
        throw new Error(
          `Bright Data snapshot ${snapshot_id} failed: ${JSON.stringify(progress)}`,
        )
      }
      await sleep(pollIntervalMs)
    }

    throw new Error(
      `Bright Data snapshot ${snapshot_id} timed out after ${maxWaitMs}ms`,
    )
  }
}
