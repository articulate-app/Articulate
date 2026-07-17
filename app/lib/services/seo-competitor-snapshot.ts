"use client"

import { createClientComponentClient } from "@supabase/auth-helpers-nextjs"
import { invokeEdgeFunctionFetch } from "../edge-functions"
import type {
  CompetitorStructureResponse,
  CompetitorPageType,
  PrefetchCompetitorStructuresRequest,
  PrefetchCompetitorStructuresResponse,
  SaveKeywordCompetitorInput,
  SeoSnapshot,
  SeoSnapshotCompetitor,
  SeoSnapshotStructure,
  TopResultsResponse,
} from "../types/seo-competitor-snapshot"

const SUPABASE_FUNCTIONS_BASE = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1`

type UnknownRecord = Record<string, unknown>

function asRecord(value: unknown): UnknownRecord | null {
  return value != null && typeof value === "object" && !Array.isArray(value)
    ? (value as UnknownRecord)
    : null
}

function asNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value
  if (typeof value === "string" && value.trim().length > 0) {
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : null
  }
  return null
}

function asString(value: unknown): string | null {
  return typeof value === "string" ? value : null
}

function asPageType(value: unknown): CompetitorPageType | null {
  if (value === "article" || value === "product" || value === "homepage" || value === "category" || value === "landing" || value === "unknown") {
    return value
  }
  return null
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value
    .map((entry) => (typeof entry === "string" ? entry : null))
    .filter((entry): entry is string => !!entry)
}

function normalizeStructure(raw: unknown): SeoSnapshotStructure | null {
  const row = asRecord(raw)
  if (!row) return null
  const flatHeadingsRaw = Array.isArray(row.flatHeadings)
    ? row.flatHeadings
    : Array.isArray(row.flat_headings)
      ? row.flat_headings
      : []
  const flatHeadings = flatHeadingsRaw
    .map((entry) => {
      const item = asRecord(entry)
      if (!item) return null
      const level = asNumber(item.level)
      const tag = asString(item.tag)
      const text = asString(item.text)
      if ((level !== 1 && level !== 2 && level !== 3) || (tag !== "h1" && tag !== "h2" && tag !== "h3") || !text) {
        return null
      }
      return { level: level as 1 | 2 | 3, tag: tag as "h1" | "h2" | "h3", text }
    })
    .filter((entry): entry is NonNullable<typeof entry> => !!entry)

  return {
    pageTitle: asString(row.pageTitle) ?? asString(row.page_title) ?? null,
    h1: asStringArray(row.h1 ?? row.h_1),
    h2: asStringArray(row.h2 ?? row.h_2),
    h3: asStringArray(row.h3 ?? row.h_3),
    flatHeadings,
    source: asString(row.source) ?? null,
    pageType: asPageType(row.pageType ?? row.page_type),
    fetchedAt: asString(row.fetchedAt) ?? asString(row.fetched_at) ?? null,
    error: asString(row.error),
    available: typeof row.available === "boolean" ? row.available : null,
  }
}

function normalizeCompetitor(raw: unknown): SeoSnapshotCompetitor | null {
  const row = asRecord(raw)
  if (!row) return null
  const id = asNumber(row.id)
  const taskId = asNumber(row.taskId ?? row.task_id)
  const channelId = asNumber(row.channelId ?? row.channel_id)
  const keyword = asString(row.keyword)
  const position = asNumber(row.position)
  const title = asString(row.title)
  const url = asString(row.url)
  const createdAt = asString(row.createdAt ?? row.created_at)
  const updatedAt = asString(row.updatedAt ?? row.updated_at)
  if (
    id == null ||
    taskId == null ||
    channelId == null ||
    !keyword ||
    position == null ||
    !title ||
    !url ||
    !createdAt ||
    !updatedAt
  ) {
    return null
  }
  return {
    id,
    taskId,
    channelId,
    keyword,
    position,
    title,
    url,
    displayLink: asString(row.displayLink ?? row.display_link) ?? null,
    selected: !!row.selected,
    createdAt,
    updatedAt,
    structure: normalizeStructure(row.structure),
  }
}

function normalizeSnapshot(raw: unknown): SeoSnapshot {
  const row = asRecord(raw)
  if (!row) {
    return {
      taskId: 0,
      channelId: 0,
      primaryKeyword: null,
      secondaryKeywords: [],
      keywords: [],
      competitors: [],
    }
  }

  return {
    taskId: asNumber(row.taskId ?? row.task_id) ?? 0,
    channelId: asNumber(row.channelId ?? row.channel_id) ?? 0,
    primaryKeyword: asString(row.primaryKeyword ?? row.primary_keyword) ?? null,
    secondaryKeywords: asStringArray(row.secondaryKeywords ?? row.secondary_keywords),
    keywords: asStringArray(row.keywords),
    competitors: Array.isArray(row.competitors)
      ? row.competitors.map((entry) => normalizeCompetitor(entry)).filter((entry): entry is SeoSnapshotCompetitor => !!entry)
      : [],
  }
}

function isSeoConfigurationNotFoundError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false
  const row = error as Record<string, unknown>
  const message = typeof row.message === "string" ? row.message : ""
  return message.toLowerCase().includes("seo configuration not found")
}

async function invokeEdgeFunction<TPayload, TResponse>(name: string, payload: TPayload): Promise<TResponse> {
  const supabase = createClientComponentClient()
  const response = await invokeEdgeFunctionFetch({
    supabase,
    url: `${SUPABASE_FUNCTIONS_BASE}/${name}`,
    init: {
      method: "POST",
      body: JSON.stringify(payload),
    },
    headers: {
      "Content-Type": "application/json",
    },
    debugLabel: name,
  })

  if (!response.ok) {
    const text = await response.text().catch(() => "")
    throw new Error(text || `${name} failed with ${response.status}`)
  }

  return (await response.json()) as TResponse
}

export async function fetchTaskChannelSeoSnapshot(taskId: number, channelId: number): Promise<SeoSnapshot> {
  const supabase = createClientComponentClient()
  const { data, error } = await supabase.rpc("get_task_channel_seo_snapshot", {
    p_task_id: taskId,
    p_channel_id: channelId,
  })
  if (error) {
    if (isSeoConfigurationNotFoundError(error)) {
      return {
        taskId,
        channelId,
        primaryKeyword: null,
        secondaryKeywords: [],
        keywords: [],
        competitors: [],
      }
    }
    throw error
  }
  return normalizeSnapshot(data)
}

export async function fetchTopResults(payload: {
  q: string
  languageId?: string | number | null
  regionId?: string | number | null
  num?: number
}): Promise<TopResultsResponse> {
  return invokeEdgeFunction<typeof payload, TopResultsResponse>("top-results", payload)
}

export async function fetchCompetitorStructure(payload: { url: string }): Promise<CompetitorStructureResponse> {
  return invokeEdgeFunction<typeof payload, CompetitorStructureResponse>("competitor-structure", payload)
}

export async function prefetchCompetitorStructures(payload: PrefetchCompetitorStructuresRequest): Promise<PrefetchCompetitorStructuresResponse> {
  const competitors = Array.isArray(payload.competitors) ? payload.competitors : []
  if (competitors.length === 0) {
    return {
      jobId: null,
      queued: 0,
      completed: true,
    }
  }
  return invokeEdgeFunction<PrefetchCompetitorStructuresRequest, PrefetchCompetitorStructuresResponse>(
    "prefetch-competitor-structures",
    payload,
  )
}

export async function saveKeywordCompetitors(params: {
  taskId: number
  channelId: number
  keyword: string
  results: SaveKeywordCompetitorInput[]
}): Promise<SeoSnapshotCompetitor[]> {
  const supabase = createClientComponentClient()
  const { data, error } = await supabase.rpc("save_keyword_competitors", {
    p_task_id: params.taskId,
    p_channel_id: params.channelId,
    p_keyword: params.keyword,
    p_results: params.results,
  })
  if (error) throw error
  if (!Array.isArray(data)) return []
  return data.map((entry) => normalizeCompetitor(entry)).filter((entry): entry is SeoSnapshotCompetitor => !!entry)
}

export async function selectKeywordCompetitor(params: {
  taskId: number
  channelId: number
  keyword: string
  competitorId: number
}): Promise<void> {
  const supabase = createClientComponentClient()
  const { error } = await supabase.rpc("select_keyword_competitor", {
    p_task_id: params.taskId,
    p_channel_id: params.channelId,
    p_keyword: params.keyword,
    p_competitor_id: params.competitorId,
  })
  if (error) throw error
}

export async function saveCompetitorStructure(params: {
  competitorId: number
  structure: SeoSnapshotStructure
}): Promise<void> {
  const supabase = createClientComponentClient()
  const { error } = await supabase.rpc("save_competitor_structure", {
    p_competitor_id: params.competitorId,
    p_page_title: params.structure.pageTitle,
    p_h1: params.structure.h1,
    p_h2: params.structure.h2,
    p_h3: params.structure.h3,
    p_flat_headings: params.structure.flatHeadings,
    p_source: params.structure.source,
    p_page_type: params.structure.pageType ?? "unknown",
  })
  if (error) throw error
}
