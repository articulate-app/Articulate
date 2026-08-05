"use client"

import { AlertCircle, Loader2 } from "lucide-react"
import { Card } from "../ui/card"
import {
  buildContentEntitySummaryBullets,
  buildContentEntitySummaryText,
  type ContentCompetitiveSummary,
} from "@/lib/project-competitive-content-summary"
import type { KeywordGapRow } from "@/lib/services/project-competitive-content"
import type { OwnedContentPerformance } from "@/lib/services/project-competitive-content"

function formatInt(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return "—"
  return new Intl.NumberFormat("en-US").format(Math.round(value))
}

function formatPct(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return "—"
  const pct = value > 1 ? value : value * 100
  return `${pct.toFixed(1)}%`
}

const OPPORTUNITY_LABELS: Record<string, string> = {
  not_covered: "Not covered",
  covered_not_ranking: "Covered, not ranking",
  ranking_below_competitors: "Ranking below competitors",
  owned_advantage: "Owned advantage",
  insufficient_data: "Insufficient data",
}

export function CompetitionContentCompare({
  summary,
  keywordGap,
  ownedPerformance,
  isLoading,
  error,
  onRetry,
}: {
  summary: ContentCompetitiveSummary | null | undefined
  keywordGap: KeywordGapRow[]
  ownedPerformance: OwnedContentPerformance | null | undefined
  isLoading: boolean
  error: Error | null
  onRetry: () => void
}) {
  if (isLoading) {
    return (
      <div className="flex items-center gap-2 py-10 text-sm text-gray-500">
        <Loader2 className="h-4 w-4 animate-spin" />
        Loading content comparison…
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex items-start gap-2 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
        <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
        <div>
          <p>{error.message || "Failed to load content comparison."}</p>
          <button
            type="button"
            className="mt-1 text-xs font-medium underline"
            onClick={onRetry}
          >
            Retry
          </button>
        </div>
      </div>
    )
  }

  const entities = summary?.entities ?? []
  const periodDays = summary?.period_days ?? 30

  if (entities.length === 0) {
    return (
      <div className="rounded-md border border-dashed border-gray-200 px-4 py-10 text-center text-sm text-gray-500">
        No competitive content data yet.
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {entities.map((entity) => {
          const bullets = buildContentEntitySummaryBullets(entity)
          return (
            <Card key={entity.entity_id} className="space-y-3 p-4">
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="text-sm font-semibold text-gray-900">
                  {entity.entity_name}
                </h3>
                {entity.is_owned ? (
                  <span className="rounded bg-sky-50 px-1.5 py-0.5 text-[11px] font-medium text-sky-700">
                    Our brand
                  </span>
                ) : null}
              </div>
              <p className="text-xs leading-relaxed text-gray-600">
                {buildContentEntitySummaryText(entity, periodDays)}
              </p>
              <ul className="space-y-1 text-xs text-gray-700">
                {bullets.map((bullet) => (
                  <li key={bullet}>• {bullet}</li>
                ))}
              </ul>
              {entity.share_of_articles_pct != null ? (
                <p className="text-xs text-gray-500">
                  Share of articles: {entity.share_of_articles_pct}%
                </p>
              ) : null}
            </Card>
          )
        })}
      </div>

      <Card className="space-y-3 p-4">
        <div>
          <h3 className="text-sm font-semibold text-gray-900">Keyword gap</h3>
          <p className="mt-0.5 text-xs text-gray-500">
            Keywords competitors cover that may be opportunities for our brand.
          </p>
        </div>
        {keywordGap.length === 0 ? (
          <p className="text-sm text-gray-500">
            No keyword gap opportunities yet. Sync articles and enrich keywords first.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-xs">
              <thead className="text-gray-500">
                <tr>
                  <th className="px-2 py-1.5 font-medium">Keyword</th>
                  <th className="px-2 py-1.5 font-medium">Volume</th>
                  <th className="px-2 py-1.5 font-medium">Competitors</th>
                  <th className="px-2 py-1.5 font-medium">Best pos.</th>
                  <th className="px-2 py-1.5 font-medium">Owned</th>
                  <th className="px-2 py-1.5 font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {keywordGap.slice(0, 40).map((row) => (
                  <tr key={row.normalized_keyword} className="border-t border-gray-100">
                    <td className="px-2 py-1.5 font-medium text-gray-900">{row.keyword}</td>
                    <td className="px-2 py-1.5">{formatInt(row.search_volume)}</td>
                    <td className="px-2 py-1.5">{formatInt(row.competitors_count)}</td>
                    <td className="px-2 py-1.5">
                      {row.best_competitor_position == null
                        ? "—"
                        : row.best_competitor_position.toFixed(1)}
                    </td>
                    <td className="px-2 py-1.5">{formatInt(row.owned_articles_count)}</td>
                    <td className="px-2 py-1.5">
                      {OPPORTUNITY_LABELS[row.opportunity_status] ?? row.opportunity_status}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Card className="space-y-3 p-4">
        <div>
          <h3 className="text-sm font-semibold text-gray-900">
            Dados próprios adicionais
          </h3>
          <p className="mt-0.5 text-xs text-gray-500">
            Owned-only Search Console and Analytics metrics. Not used in competitive rankings.
          </p>
        </div>

        {!ownedPerformance?.search_console_connected &&
        !ownedPerformance?.analytics_connected ? (
          <div className="space-y-1 text-sm text-gray-500">
            <p>
              Connect Google Search Console to view real queries, clicks and impressions.
            </p>
            <p>
              Connect Google Analytics to view traffic and engagement for your articles.
            </p>
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-md border border-gray-100 p-3">
              <p className="text-xs font-medium uppercase tracking-wide text-gray-500">
                Search Console
              </p>
              {ownedPerformance.search_console_connected ? (
                <dl className="mt-2 grid grid-cols-2 gap-2 text-sm">
                  <div>
                    <dt className="text-xs text-gray-500">Clicks</dt>
                    <dd className="font-medium">
                      {formatInt(ownedPerformance.search_console?.clicks)}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs text-gray-500">Impressions</dt>
                    <dd className="font-medium">
                      {formatInt(ownedPerformance.search_console?.impressions)}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs text-gray-500">CTR</dt>
                    <dd className="font-medium">
                      {ownedPerformance.search_console?.ctr == null
                        ? "—"
                        : `${(ownedPerformance.search_console.ctr * 100).toFixed(1)}%`}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs text-gray-500">Avg position</dt>
                    <dd className="font-medium">
                      {ownedPerformance.search_console?.position_avg == null
                        ? "—"
                        : ownedPerformance.search_console.position_avg.toFixed(1)}
                    </dd>
                  </div>
                </dl>
              ) : (
                <p className="mt-2 text-sm text-gray-500">Not connected.</p>
              )}
            </div>
            <div className="rounded-md border border-gray-100 p-3">
              <p className="text-xs font-medium uppercase tracking-wide text-gray-500">
                Google Analytics
              </p>
              {ownedPerformance.analytics_connected ? (
                <dl className="mt-2 grid grid-cols-2 gap-2 text-sm">
                  <div>
                    <dt className="text-xs text-gray-500">Page views</dt>
                    <dd className="font-medium">
                      {formatInt(ownedPerformance.analytics?.page_views)}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs text-gray-500">Users</dt>
                    <dd className="font-medium">
                      {formatInt(ownedPerformance.analytics?.users)}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs text-gray-500">Sessions</dt>
                    <dd className="font-medium">
                      {formatInt(ownedPerformance.analytics?.sessions)}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs text-gray-500">Engagement</dt>
                    <dd className="font-medium">
                      {formatPct(ownedPerformance.analytics?.engagement_rate ?? null)}
                    </dd>
                  </div>
                </dl>
              ) : (
                <p className="mt-2 text-sm text-gray-500">Not connected.</p>
              )}
            </div>
          </div>
        )}
      </Card>
    </div>
  )
}
