/**
 * Rule-based competitive social summaries (no LLM).
 */

import { COMPETITOR_NETWORK_LABELS, type CompetitorSocialNetwork } from "./competitor-social"
import { computePublicInteractions } from "./project-social"

export type SocialSummaryEntityMetrics = {
  entity_id: string
  entity_name: string
  entity_type: "owned" | "competitor"
  is_owned: boolean
  posts_count: number
  posts_with_interactions: number
  interactions_total: number | null
  interactions_avg: number | null
  interactions_median: number | null
  reactions_total: number | null
  comments_total: number | null
  shares_total: number | null
  views_total: number | null
  share_of_posts_pct: number | null
  share_of_interactions_pct: number | null
  followers_latest: number | null
  followers_start: number | null
  followers_delta: number | null
  followers_delta_pct: number | null
  follower_snapshot_days: number | null
  networks: Array<{
    network: string
    posts_count: number
    interactions_total: number | null
    interactions_median: number | null
  }>
  top_posts?: Array<{
    id: number
    network: string
    post_url: string
    published_at: string | null
    text_content: string | null
    thumbnail_url: string | null
    reactions_count: number | null
    comments_count: number | null
    shares_count: number | null
    views_count: number | null
    interactions: number | null
  }>
}

export type SocialCompetitiveSummary = {
  project_id: number
  date_from: string | null
  date_to: string | null
  totals: {
    posts_count: number
    interactions_total: number | null
    /** Impressions/views, only reported by some networks. */
    views_total?: number | null
    entities_count: number
  }
  entities: SocialSummaryEntityMetrics[]
}

function formatInt(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return "—"
  return new Intl.NumberFormat("en-US").format(Math.round(value))
}

function formatPct(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return "—"
  return `${Number(value).toFixed(Number.isInteger(value) ? 0 : 1)}%`
}

function networkLabel(network: string): string {
  if (network in COMPETITOR_NETWORK_LABELS) {
    return COMPETITOR_NETWORK_LABELS[network as CompetitorSocialNetwork]
  }
  return network
}

function displayName(entity: SocialSummaryEntityMetrics): string {
  if (entity.is_owned) return entity.entity_name || "Our brand"
  return entity.entity_name
}

/**
 * Bullet points for a single entity card.
 * Prefer absolute metrics (posts, interactions, followers) over share-of-total %.
 */
export function buildEntitySummaryBullets(
  entity: SocialSummaryEntityMetrics,
): string[] {
  const name = displayName(entity)
  const bullets: string[] = []

  if (entity.posts_count === 0) {
    bullets.push(`${name} has no tracked posts in this period.`)
    if (
      entity.follower_snapshot_days == null ||
      entity.follower_snapshot_days < 2 ||
      entity.followers_delta == null
    ) {
      bullets.push("Follower growth: insufficient data.")
    }
    return bullets
  }

  bullets.push(
    `${name} published ${formatInt(entity.posts_count)} post${
      entity.posts_count === 1 ? "" : "s"
    }.`,
  )

  if (entity.interactions_total != null) {
    bullets.push(
      `Total public interactions: ${formatInt(entity.interactions_total)}.`,
    )
  }

  if (entity.interactions_median != null) {
    bullets.push(
      `Median public interactions: ${formatInt(entity.interactions_median)} (reactions + comments + shares).`,
    )
  } else if (entity.interactions_total == null) {
    bullets.push("Public interaction metrics are unavailable for these posts.")
  }

  if (
    entity.follower_snapshot_days == null ||
    entity.follower_snapshot_days < 2 ||
    entity.followers_delta == null
  ) {
    bullets.push("Follower growth: insufficient data.")
  } else {
    const sign = entity.followers_delta > 0 ? "+" : ""
    bullets.push(
      `Followers: ${formatInt(entity.followers_latest)} (${sign}${formatInt(
        entity.followers_delta,
      )}${
        entity.followers_delta_pct != null
          ? `, ${sign}${formatPct(entity.followers_delta_pct)}`
          : ""
      }).`,
    )
  }

  const topNetwork = [...entity.networks].sort(
    (a, b) => (b.posts_count ?? 0) - (a.posts_count ?? 0),
  )[0]
  if (topNetwork && topNetwork.posts_count > 0) {
    bullets.push(
      `Most active network: ${networkLabel(topNetwork.network)} (${formatInt(
        topNetwork.posts_count,
      )} posts).`,
    )
  }

  return bullets
}

/**
 * Cross-entity narrative lines for the overview header.
 */
export function buildCompetitiveNarrative(
  summary: SocialCompetitiveSummary,
): string[] {
  const lines: string[] = []
  const entities = summary.entities ?? []
  const owned = entities.find((row) => row.is_owned)
  const competitors = entities.filter((row) => !row.is_owned)
  const totalsPosts = summary.totals?.posts_count ?? 0

  if (totalsPosts === 0) {
    return [
      "No tracked posts in this period. Add brand or competitor profiles and sync to populate Competition.",
    ]
  }

  lines.push(
    `${formatInt(totalsPosts)} tracked post${totalsPosts === 1 ? "" : "s"} across ${formatInt(
      summary.totals.entities_count,
    )} entities.`,
  )

  if (summary.totals.interactions_total != null) {
    lines.push(
      `Combined public interactions: ${formatInt(summary.totals.interactions_total)}.`,
    )
  }

  if (owned && competitors.length > 0) {
    const ranked = [...competitors].sort((a, b) => {
      const aMed = a.interactions_median
      const bMed = b.interactions_median
      if (aMed == null && bMed == null) return b.posts_count - a.posts_count
      if (aMed == null) return 1
      if (bMed == null) return -1
      return bMed - aMed
    })
    const rival = ranked[0]
    if (rival) {
      if (owned.interactions_median != null && rival.interactions_median != null) {
        if (rival.interactions_median === 0) {
          lines.push(
            `${displayName(owned)} median interactions ${formatInt(
              owned.interactions_median,
            )} vs ${displayName(rival)} at ${formatInt(rival.interactions_median)}.`,
          )
        } else {
          const deltaPct =
            ((owned.interactions_median - rival.interactions_median) /
              rival.interactions_median) *
            100
          const direction = deltaPct >= 0 ? "above" : "below"
          lines.push(
            `${displayName(owned)} median interactions are ${formatPct(
              Math.abs(deltaPct),
            )} ${direction} ${displayName(rival)}.`,
          )
        }
      } else if (owned.posts_count >= rival.posts_count) {
        lines.push(
          `${displayName(owned)} posted at least as often as ${displayName(rival)} in this period.`,
        )
      } else {
        lines.push(
          `${displayName(rival)} posted more often than ${displayName(owned)} in this period.`,
        )
      }
    }
  } else if (owned && competitors.length === 0) {
    lines.push("No active competitors yet — add competitors to unlock comparative insights.")
  } else if (!owned) {
    lines.push("Brand social profiles are not configured yet.")
  }

  return lines
}

function pluralize(count: number, singular: string): string {
  return count === 1 ? singular : `${singular}s`
}

function joinList(items: string[]): string {
  if (items.length <= 1) return items[0] ?? ""
  if (items.length === 2) return `${items[0]} and ${items[1]}`
  return `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`
}

/** "2.4×" when the lead is meaningful, otherwise null. */
function ratioLabel(value: number, reference: number): string | null {
  if (!Number.isFinite(value) || !Number.isFinite(reference)) return null
  if (reference <= 0 || value <= reference * 1.15) return null
  return `${(value / reference).toFixed(1)}×`
}

export type CompetitiveOverviewInsights = {
  /** One-sentence framing of the period. */
  headline: string
  /** Short prose insights, already ordered by usefulness. */
  points: string[]
}

/**
 * Rule-based competitive read-out for the overview: who is winning the period,
 * where the gaps are and what is worth reacting to — rather than an inventory
 * of how many posts were collected.
 */
export function buildCompetitiveOverviewInsights(
  summary: SocialCompetitiveSummary,
): CompetitiveOverviewInsights {
  const entities = summary.entities ?? []
  const totalPosts = summary.totals?.posts_count ?? 0

  if (totalPosts === 0 || entities.length === 0) {
    return {
      headline: "No tracked posts in this period.",
      points: [
        "Connect your brand profiles, add competitors and run a sync to see how you compare.",
      ],
    }
  }

  const owned = entities.find((row) => row.is_owned) ?? null
  const activeEntities = entities.filter((row) => row.posts_count > 0)
  const competitors = activeEntities.filter((row) => !row.is_owned)
  const totalInteractions = summary.totals?.interactions_total ?? null
  const points: string[] = []

  const shareOfEngagement = (
    entity: SocialSummaryEntityMetrics | null,
  ): number | null => {
    if (!entity || entity.interactions_total == null) return null
    if (totalInteractions == null || totalInteractions <= 0) return null
    return (entity.interactions_total / totalInteractions) * 100
  }

  const byInteractions = activeEntities
    .filter((row) => row.interactions_total != null)
    .sort((a, b) => (b.interactions_total ?? 0) - (a.interactions_total ?? 0))
  const leader = byInteractions[0] ?? null
  const runnerUp = byInteractions[1] ?? null

  const headline = buildHeadline({
    totalPosts,
    activeEntities,
    competitors,
    owned,
    leader,
    runnerUp,
    leaderShare: shareOfEngagement(leader),
    ownedShare: shareOfEngagement(owned),
  })

  const bestPerPost = competitors
    .filter((row) => row.interactions_median != null)
    .sort((a, b) => (b.interactions_median ?? 0) - (a.interactions_median ?? 0))[0]

  if (owned?.interactions_median != null && bestPerPost?.interactions_median != null) {
    const ownedMedian = owned.interactions_median
    const rivalMedian = bestPerPost.interactions_median
    if (ownedMedian >= rivalMedian) {
      const ratio = ratioLabel(ownedMedian, rivalMedian)
      points.push(
        `Your posts convert best: a median of ${formatInt(
          ownedMedian,
        )} interactions against ${formatInt(rivalMedian)} for ${displayName(
          bestPerPost,
        )}${ratio ? ` — ${ratio} their rate` : ""}.`,
      )
    } else {
      const ratio = ratioLabel(rivalMedian, ownedMedian)
      points.push(
        `${displayName(
          bestPerPost,
        )} converts best per post with a median of ${formatInt(
          rivalMedian,
        )} interactions${ratio ? `, ${ratio} your ${formatInt(ownedMedian)}` : ` vs ${formatInt(ownedMedian)} for you`}.`,
      )
    }
  } else if (owned == null) {
    points.push(
      "Connect your brand's social profiles to see how you compare against these competitors.",
    )
  }

  const busiest = [...competitors].sort((a, b) => b.posts_count - a.posts_count)[0]
  if (owned && busiest) {
    const ownedMedian = owned.interactions_median
    const rivalMedian = busiest.interactions_median
    if (busiest.posts_count > owned.posts_count) {
      const qualifier =
        ownedMedian != null && rivalMedian != null && ownedMedian > rivalMedian
          ? " — their lead is volume, not per-post quality"
          : ownedMedian != null && rivalMedian != null && rivalMedian > ownedMedian
            ? " — they out-publish and out-convert you"
            : ""
      points.push(
        `${displayName(busiest)} publishes most, ${formatInt(
          busiest.posts_count,
        )} ${pluralize(busiest.posts_count, "post")} to your ${formatInt(
          owned.posts_count,
        )}${qualifier}.`,
      )
    } else if (owned.posts_count > busiest.posts_count) {
      const qualifier =
        ownedMedian != null && rivalMedian != null && ownedMedian < rivalMedian
          ? " — extra volume is not converting into engagement"
          : ""
      points.push(
        `You out-publish the field with ${formatInt(owned.posts_count)} ${pluralize(
          owned.posts_count,
          "post",
        )} against ${formatInt(busiest.posts_count)} for ${displayName(
          busiest,
        )}${qualifier}.`,
      )
    }
  }

  const byFollowers = entities
    .filter((row) => (row.followers_latest ?? 0) > 0)
    .sort((a, b) => (b.followers_latest ?? 0) - (a.followers_latest ?? 0))
  const audienceLeader = byFollowers[0]
  if (audienceLeader && owned && !audienceLeader.is_owned && owned.followers_latest) {
    const ratio = ratioLabel(
      audienceLeader.followers_latest ?? 0,
      owned.followers_latest,
    )
    points.push(
      `Audience gap: ${displayName(audienceLeader)} reaches ${formatInt(
        audienceLeader.followers_latest,
      )} followers${
        ratio
          ? `, ${ratio} your ${formatInt(owned.followers_latest)}`
          : ` vs ${formatInt(owned.followers_latest)} for you`
      }.`,
    )
  } else if (audienceLeader?.is_owned) {
    points.push(
      `You hold the largest tracked audience at ${formatInt(
        audienceLeader.followers_latest,
      )} followers.`,
    )
  }

  const fastestGrowing = entities
    .filter(
      (row) =>
        row.followers_delta_pct != null &&
        (row.follower_snapshot_days ?? 0) >= 2 &&
        row.followers_delta_pct > 0,
    )
    .sort((a, b) => (b.followers_delta_pct ?? 0) - (a.followers_delta_pct ?? 0))[0]
  if (fastestGrowing?.followers_delta_pct != null) {
    points.push(
      `Fastest audience growth: ${displayName(fastestGrowing)} at +${formatPct(
        fastestGrowing.followers_delta_pct,
      )} over the period.`,
    )
  }

  if (owned) {
    const ownedNetworks = new Set(
      owned.networks.filter((row) => row.posts_count > 0).map((row) => row.network),
    )
    const missingNetworks = [
      ...new Set(
        competitors.flatMap((row) =>
          row.networks.filter((net) => net.posts_count > 0).map((net) => net.network),
        ),
      ),
    ].filter((network) => !ownedNetworks.has(network))
    if (missingNetworks.length > 0) {
      points.push(
        `Coverage gap: competitors are publishing on ${joinList(
          missingNetworks.map(networkLabel),
        )} where ${displayName(owned)} has no tracked posts.`,
      )
    }
  }

  const benchmark = entities
    .flatMap((entity) =>
      (entity.top_posts ?? [])
        .filter((post) => post.interactions != null)
        .map((post) => ({ entity, post })),
    )
    .sort((a, b) => (b.post.interactions ?? 0) - (a.post.interactions ?? 0))[0]
  if (benchmark) {
    points.push(
      `Post to beat: ${displayName(benchmark.entity)} on ${networkLabel(
        benchmark.post.network,
      )} with ${formatInt(benchmark.post.interactions)} interactions.`,
    )
  }

  if (owned && competitors.length === 0) {
    points.push("Add competitors to unlock side-by-side comparisons.")
  }

  return { headline, points: points.slice(0, 5) }
}

function buildHeadline(args: {
  totalPosts: number
  activeEntities: SocialSummaryEntityMetrics[]
  competitors: SocialSummaryEntityMetrics[]
  owned: SocialSummaryEntityMetrics | null
  leader: SocialSummaryEntityMetrics | null
  runnerUp: SocialSummaryEntityMetrics | null
  leaderShare: number | null
  ownedShare: number | null
}): string {
  const { leader, runnerUp, owned, competitors, activeEntities, leaderShare } = args

  if (!leader) {
    return `${formatInt(args.totalPosts)} tracked ${pluralize(
      args.totalPosts,
      "post",
    )}, but no public engagement metrics came back for this period.`
  }

  const leaderVolume =
    leaderShare != null
      ? `${formatPct(leaderShare)} of all tracked engagement`
      : `${formatInt(leader.interactions_total)} interactions`

  if (competitors.length === 0) {
    return `${displayName(leader)} drove ${leaderVolume} this period, with no active competitors to compare against.`
  }

  if (leader.is_owned) {
    return runnerUp
      ? `You are winning the period with ${leaderVolume}, ahead of ${displayName(
          runnerUp,
        )} at ${formatInt(runnerUp.interactions_total)} interactions.`
      : `You are winning the period with ${leaderVolume}.`
  }

  if (owned) {
    return args.ownedShare != null
      ? `${displayName(
          leader,
        )} is setting the pace with ${leaderVolume}, against ${formatPct(
          args.ownedShare,
        )} for you.`
      : `${displayName(leader)} is setting the pace with ${leaderVolume}, ahead of you.`
  }

  return `${displayName(leader)} leads a field of ${formatInt(
    activeEntities.length,
  )} ${pluralize(activeEntities.length, "brand")} with ${leaderVolume}.`
}

export function rankEntitiesByEngagement(
  entities: SocialSummaryEntityMetrics[],
): SocialSummaryEntityMetrics[] {
  return [...entities].sort((a, b) => {
    if (a.is_owned !== b.is_owned) return a.is_owned ? -1 : 1
    const aTotal = a.interactions_total
    const bTotal = b.interactions_total
    if (aTotal == null && bTotal == null) return b.posts_count - a.posts_count
    if (aTotal == null) return 1
    if (bTotal == null) return -1
    return bTotal - aTotal
  })
}

/** Absolute metrics used on the competition radar (normalized 0–100 per axis). */
export const COMPETITIVE_RADAR_METRICS = [
  {
    key: "posts",
    label: "Posts",
    getValue: (entity: SocialSummaryEntityMetrics) => entity.posts_count,
  },
  {
    key: "likes",
    label: "Likes",
    getValue: (entity: SocialSummaryEntityMetrics) => entity.reactions_total,
  },
  {
    key: "comments",
    label: "Comments",
    getValue: (entity: SocialSummaryEntityMetrics) => entity.comments_total,
  },
  {
    key: "shares",
    label: "Shares",
    getValue: (entity: SocialSummaryEntityMetrics) => entity.shares_total,
  },
  {
    key: "followers",
    label: "Followers",
    getValue: (entity: SocialSummaryEntityMetrics) => entity.followers_latest,
  },
] as const

export type CompetitiveRadarMetricKey =
  (typeof COMPETITIVE_RADAR_METRICS)[number]["key"]

export type CompetitiveRadarEntitySeries = {
  entity_id: string
  entity_name: string
  is_owned: boolean
  /** Safe Recharts dataKey (alphanumeric + underscore). */
  dataKey: string
}

export type CompetitiveRadarChartPoint = {
  metric: CompetitiveRadarMetricKey
  metricLabel: string
  /** Raw absolute values keyed by entity dataKey (for tooltips). */
  raw: Record<string, number | null>
  /** Normalized 0–100 scores keyed by entity dataKey. */
  [entityDataKey: string]: string | number | null | Record<string, number | null>
}

export type CompetitiveRadarBuildResult = {
  hasComparableData: boolean
  entities: CompetitiveRadarEntitySeries[]
  /** One row per radar axis; entity fields hold normalized scores. */
  chartData: CompetitiveRadarChartPoint[]
  maxima: Record<CompetitiveRadarMetricKey, number>
}

function entitySeriesDataKey(entityId: string): string {
  return `e_${entityId.replace(/[^a-zA-Z0-9]/g, "_")}`
}

/**
 * Normalize absolute entity metrics onto a shared 0–100 radar per axis
 * (max across included entities). Owned brand is always included when present;
 * competitors are taken from engagement rank up to `maxCompetitors`.
 */
export function buildCompetitiveRadarData(
  entities: SocialSummaryEntityMetrics[],
  options?: { maxCompetitors?: number },
): CompetitiveRadarBuildResult {
  const maxCompetitors = options?.maxCompetitors ?? 5
  const ranked = rankEntitiesByEngagement(entities)
  const owned = ranked.filter((row) => row.is_owned)
  const competitors = ranked
    .filter((row) => !row.is_owned)
    .slice(0, Math.max(0, maxCompetitors))
  const selected = [...owned, ...competitors]

  const series: CompetitiveRadarEntitySeries[] = selected.map((entity) => ({
    entity_id: entity.entity_id,
    entity_name: displayName(entity),
    is_owned: entity.is_owned,
    dataKey: entitySeriesDataKey(entity.entity_id),
  }))

  const maxima = {} as Record<CompetitiveRadarMetricKey, number>
  for (const metric of COMPETITIVE_RADAR_METRICS) {
    let max = 0
    for (const entity of selected) {
      const value = metric.getValue(entity)
      if (value != null && Number.isFinite(value) && value > max) max = value
    }
    maxima[metric.key] = max
  }

  const hasComparableData =
    selected.length > 0 &&
    selected.some((entity) => entity.posts_count > 0) &&
    COMPETITIVE_RADAR_METRICS.some((metric) => maxima[metric.key] > 0)

  const chartData: CompetitiveRadarChartPoint[] = COMPETITIVE_RADAR_METRICS.map(
    (metric) => {
      const raw: Record<string, number | null> = {}
      const point: CompetitiveRadarChartPoint = {
        metric: metric.key,
        metricLabel: metric.label,
        raw,
      }
      const max = maxima[metric.key]
      for (const entity of selected) {
        const dataKey = entitySeriesDataKey(entity.entity_id)
        const value = metric.getValue(entity)
        const numeric =
          value != null && Number.isFinite(value) ? Number(value) : null
        raw[dataKey] = numeric
        point[dataKey] =
          numeric == null || max <= 0
            ? 0
            : Math.max(0, Math.min(100, (numeric / max) * 100))
      }
      return point
    },
  )

  return {
    hasComparableData,
    entities: series,
    chartData,
    maxima,
  }
}

export function interactionsFromPostMetrics(args: {
  reactionsCount: number | null | undefined
  commentsCount: number | null | undefined
  sharesCount: number | null | undefined
}): number | null {
  return computePublicInteractions(args)
}
