/**
 * Rule-based competitive content summaries (no LLM).
 */

export type ContentSummaryEntityMetrics = {
  entity_id: string
  entity_name: string
  entity_type: "owned" | "competitor"
  is_owned: boolean
  articles_count: number
  articles_per_week: number | null
  articles_per_month: number | null
  days_since_last_publish: number | null
  languages_count: number
  sources_count: number
  unique_keywords: number
  keyword_volume_total: number | null
  ranking_keywords_count: number
  ranking_position_avg: number | null
  share_of_articles_pct: number | null
  by_language?: Record<string, number>
  by_source_type?: Record<string, number>
}

export type ContentCompetitiveSummary = {
  project_id: number
  date_from: string | null
  date_to: string | null
  period_days?: number
  totals: {
    articles_count: number
    entities_count: number
  }
  entities: ContentSummaryEntityMetrics[]
}

function formatInt(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return "—"
  return new Intl.NumberFormat("en-US").format(Math.round(value))
}

function displayName(entity: ContentSummaryEntityMetrics): string {
  if (entity.is_owned) return entity.entity_name || "Our brand"
  return entity.entity_name
}

function topKeys(record: Record<string, number> | undefined, limit = 3): string[] {
  if (!record) return []
  return Object.entries(record)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, limit)
    .map(([key]) => key)
}

/**
 * Objective template summary for a single entity.
 */
export function buildContentEntitySummaryText(
  entity: ContentSummaryEntityMetrics,
  periodDays = 30,
): string {
  const name = displayName(entity)
  if (entity.articles_count === 0) {
    return `${name} has no tracked articles in this period.`
  }

  const sources = entity.sources_count
  const languages = entity.languages_count
  const perWeek =
    entity.articles_per_week != null ? entity.articles_per_week.toFixed(1) : "—"
  const themes = topKeys(entity.by_source_type)
  const themeClause =
    themes.length > 0 ? ` with greater concentration in ${themes.join(", ")}` : ""

  const daysClause =
    entity.days_since_last_publish == null
      ? "The most recent article date is unavailable."
      : `The most recent article was published ${entity.days_since_last_publish} day${
          entity.days_since_last_publish === 1 ? "" : "s"
        } ago.`

  return (
    `${name} published ${formatInt(entity.articles_count)} article${
      entity.articles_count === 1 ? "" : "s"
    } in the last ${formatInt(periodDays)} days, ` +
    `across ${formatInt(sources)} editorial source${sources === 1 ? "" : "s"} ` +
    `and ${formatInt(languages)} language${languages === 1 ? "" : "s"}. ` +
    `The average was ${perWeek} articles per week. ` +
    `${formatInt(entity.unique_keywords)} primary or secondary keywords were identified` +
    `${themeClause}. ${daysClause}`
  )
}

export function buildContentEntitySummaryBullets(
  entity: ContentSummaryEntityMetrics,
): string[] {
  const name = displayName(entity)
  const bullets: string[] = []

  if (entity.articles_count === 0) {
    bullets.push(`${name} has no tracked articles in this period.`)
    return bullets
  }

  bullets.push(
    `${formatInt(entity.articles_count)} articles` +
      (entity.articles_per_week != null
        ? ` · ${entity.articles_per_week.toFixed(1)}/week`
        : ""),
  )

  if (entity.sources_count > 0 || entity.languages_count > 0) {
    bullets.push(
      `${formatInt(entity.sources_count)} sources · ${formatInt(entity.languages_count)} languages`,
    )
  }

  if (entity.unique_keywords > 0) {
    bullets.push(
      `${formatInt(entity.unique_keywords)} keywords` +
        (entity.keyword_volume_total != null
          ? ` · volume ${formatInt(entity.keyword_volume_total)}`
          : ""),
    )
  }

  if (entity.ranking_keywords_count > 0) {
    bullets.push(
      `${formatInt(entity.ranking_keywords_count)} ranking keywords` +
        (entity.ranking_position_avg != null
          ? ` · avg position ${entity.ranking_position_avg.toFixed(1)}`
          : ""),
    )
  }

  if (entity.days_since_last_publish != null) {
    bullets.push(`Last publish ${formatInt(entity.days_since_last_publish)} days ago`)
  }

  return bullets
}
