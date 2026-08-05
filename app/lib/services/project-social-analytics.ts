"use client"

import { createClientComponentClient } from "@supabase/auth-helpers-nextjs"
import type { CompetitorSocialNetwork } from "@/lib/competitor-social"
import type { SocialCompetitiveSummary } from "@/lib/project-social-summary"

export const PROJECT_SOCIAL_SUMMARY_QUERY_KEY = "project-social-summary" as const

export type SocialPostTimeseriesPoint = {
  date: string
  entity_id: string
  posts_count: number
  interactions_total: number | null
}

export type SocialFollowerTimeseriesPoint = {
  date: string
  entity_id: string
  followers_count: number | null
}

export type ProjectSocialCompetitiveSummary = SocialCompetitiveSummary & {
  post_timeseries: SocialPostTimeseriesPoint[]
  follower_timeseries: SocialFollowerTimeseriesPoint[]
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null
}

function asNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : null
  }
  return null
}

function mapEntity(row: Record<string, unknown>) {
  return {
    entity_id: String(row.entity_id ?? ""),
    entity_name: String(row.entity_name ?? ""),
    entity_type: row.entity_type === "owned" ? ("owned" as const) : ("competitor" as const),
    is_owned: row.is_owned === true,
    posts_count: asNumber(row.posts_count) ?? 0,
    posts_with_interactions: asNumber(row.posts_with_interactions) ?? 0,
    interactions_total: asNumber(row.interactions_total),
    interactions_avg: asNumber(row.interactions_avg),
    interactions_median: asNumber(row.interactions_median),
    reactions_total: asNumber(row.reactions_total),
    comments_total: asNumber(row.comments_total),
    shares_total: asNumber(row.shares_total),
    views_total: asNumber(row.views_total),
    share_of_posts_pct: asNumber(row.share_of_posts_pct),
    share_of_interactions_pct: asNumber(row.share_of_interactions_pct),
    followers_latest: asNumber(row.followers_latest),
    followers_start: asNumber(row.followers_start),
    followers_delta: asNumber(row.followers_delta),
    followers_delta_pct: asNumber(row.followers_delta_pct),
    follower_snapshot_days: asNumber(row.follower_snapshot_days),
    networks: Array.isArray(row.networks)
      ? row.networks.map((network) => {
          const n = asRecord(network) ?? {}
          return {
            network: String(n.network ?? ""),
            posts_count: asNumber(n.posts_count) ?? 0,
            interactions_total: asNumber(n.interactions_total),
            interactions_median: asNumber(n.interactions_median),
          }
        })
      : [],
    top_posts: Array.isArray(row.top_posts)
      ? row.top_posts.map((post) => {
          const p = asRecord(post) ?? {}
          return {
            id: asNumber(p.id) ?? 0,
            network: String(p.network ?? ""),
            post_url: String(p.post_url ?? ""),
            published_at: typeof p.published_at === "string" ? p.published_at : null,
            text_content: typeof p.text_content === "string" ? p.text_content : null,
            thumbnail_url: typeof p.thumbnail_url === "string" ? p.thumbnail_url : null,
            reactions_count: asNumber(p.reactions_count),
            comments_count: asNumber(p.comments_count),
            shares_count: asNumber(p.shares_count),
            views_count: asNumber(p.views_count),
            interactions: asNumber(p.interactions),
          }
        })
      : [],
  }
}

export async function getProjectSocialCompetitiveSummary(args: {
  projectId: number
  from?: string | null
  to?: string | null
  networks?: CompetitorSocialNetwork[] | null
  entityIds?: string[] | null
}): Promise<ProjectSocialCompetitiveSummary> {
  const supabase = createClientComponentClient()
  const { data, error } = await supabase.rpc(
    "fn_get_project_social_competitive_summary",
    {
      p_project_id: args.projectId,
      p_date_from: args.from ?? null,
      p_date_to: args.to ?? null,
      p_networks: args.networks?.length ? args.networks : null,
      p_entity_ids: args.entityIds?.length ? args.entityIds : null,
    },
  )

  if (error) throw error

  const record = asRecord(data) ?? {}
  const totals = asRecord(record.totals) ?? {}

  return {
    project_id: asNumber(record.project_id) ?? args.projectId,
    date_from: typeof record.date_from === "string" ? record.date_from : null,
    date_to: typeof record.date_to === "string" ? record.date_to : null,
    totals: {
      posts_count: asNumber(totals.posts_count) ?? 0,
      interactions_total: asNumber(totals.interactions_total),
      entities_count: asNumber(totals.entities_count) ?? 0,
    },
    entities: Array.isArray(record.entities)
      ? record.entities.map((row) => mapEntity(asRecord(row) ?? {}))
      : [],
    post_timeseries: Array.isArray(record.post_timeseries)
      ? record.post_timeseries.map((row) => {
          const point = asRecord(row) ?? {}
          return {
            date: String(point.date ?? ""),
            entity_id: String(point.entity_id ?? ""),
            posts_count: asNumber(point.posts_count) ?? 0,
            interactions_total: asNumber(point.interactions_total),
          }
        })
      : [],
    follower_timeseries: Array.isArray(record.follower_timeseries)
      ? record.follower_timeseries.map((row) => {
          const point = asRecord(row) ?? {}
          return {
            date: String(point.date ?? ""),
            entity_id: String(point.entity_id ?? ""),
            followers_count: asNumber(point.followers_count),
          }
        })
      : [],
  }
}
