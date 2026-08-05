"use client"

import { format } from "date-fns"
import { AlertCircle, ExternalLink, Loader2 } from "lucide-react"
import { Card } from "../ui/card"
import { Label } from "../ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../ui/select"
import {
  CONTENT_SOURCE_TYPE_LABELS,
  type ContentSourceType,
} from "@/lib/competitive-content"
import type { ProjectCompetitiveArticle } from "@/lib/services/project-competitive-content"
import type { ProjectCompetitorWithProfiles } from "@/lib/services/project-competitors"

function ArticleCard({ article }: { article: ProjectCompetitiveArticle }) {
  const publishedLabel = article.published_at
    ? format(new Date(article.published_at), "dd MMM yyyy")
    : null
  const sourceLabel = article.content_source_type
    ? CONTENT_SOURCE_TYPE_LABELS[article.content_source_type as ContentSourceType] ??
      article.content_source_type
    : null

  return (
    <Card className="flex flex-col overflow-hidden">
      {article.image_url ? (
        <div className="relative aspect-[16/10] bg-gray-100">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={article.image_url}
            alt=""
            className="absolute inset-0 h-full w-full object-cover"
          />
        </div>
      ) : null}

      <div className="flex flex-1 flex-col gap-3 p-3.5">
        <div className="space-y-1.5">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-sm font-medium text-gray-900">
              {article.entity_name ?? "—"}
            </span>
            {article.is_owned ? (
              <span className="rounded bg-sky-50 px-1.5 py-0.5 text-[11px] font-medium text-sky-700">
                Our brand
              </span>
            ) : null}
          </div>
          <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-gray-500">
            {sourceLabel ? <span>{sourceLabel}</span> : null}
            {article.language_code ? <span>{article.language_code}</span> : null}
            {publishedLabel ? <span>{publishedLabel}</span> : <span>No date</span>}
          </div>
        </div>

        <a
          href={article.url}
          target="_blank"
          rel="noreferrer"
          className="group inline-flex items-start gap-1 text-sm font-semibold text-gray-900 hover:underline"
        >
          <span className="line-clamp-3">
            {article.title?.trim() || article.canonical_url}
          </span>
          <ExternalLink className="mt-0.5 h-3.5 w-3.5 shrink-0 opacity-0 transition group-hover:opacity-60" />
        </a>

        {article.description ? (
          <p className="line-clamp-3 text-sm text-gray-600">{article.description}</p>
        ) : null}

        <div className="mt-auto space-y-1 border-t border-gray-100 pt-2 text-xs text-gray-500">
          {article.primary_keyword ? (
            <p>
              Primary keyword:{" "}
              <span className="font-medium text-gray-800">{article.primary_keyword}</span>
            </p>
          ) : (
            <p>Primary keyword not determined yet.</p>
          )}
          {article.author ? <p>Author: {article.author}</p> : null}
        </div>
      </div>
    </Card>
  )
}

export function CompetitionArticlesFeed({
  projectId: _projectId,
  ownedEntityId,
  competitors,
  articles,
  isLoading,
  error,
  filterEntityId,
  onFilterEntityIdChange,
  filterSourceType,
  onFilterSourceTypeChange,
}: {
  projectId: number
  ownedEntityId: string
  competitors: ProjectCompetitorWithProfiles[]
  articles: ProjectCompetitiveArticle[]
  isLoading: boolean
  error: Error | null
  /** @deprecated Period is controlled by the Competition tab header DateRangePicker. */
  dateRange?: { from?: Date; to?: Date }
  onDateRangeChange?: (value: { from?: Date; to?: Date }) => void
  filterEntityId: string
  onFilterEntityIdChange: (value: string) => void
  filterSourceType: string
  onFilterSourceTypeChange: (value: string) => void
  getDefaultDateRange?: () => { from?: Date; to?: Date }
}) {
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <div className="min-w-[140px] flex-1 basis-[160px] sm:max-w-[200px] sm:flex-none">
          <Label className="text-xs text-gray-500">Entity</Label>
          <Select value={filterEntityId} onValueChange={onFilterEntityIdChange}>
            <SelectTrigger className="w-full">
              <SelectValue placeholder="Entity" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All entities</SelectItem>
              <SelectItem value={ownedEntityId}>Our brand</SelectItem>
              {competitors.map((competitor) => (
                <SelectItem key={competitor.id} value={`competitor:${competitor.id}`}>
                  {competitor.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="min-w-[120px] flex-1 basis-[140px] sm:max-w-[160px] sm:flex-none">
          <Label className="text-xs text-gray-500">Source type</Label>
          <Select value={filterSourceType} onValueChange={onFilterSourceTypeChange}>
            <SelectTrigger className="w-full">
              <SelectValue placeholder="Source" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All sources</SelectItem>
              {Object.entries(CONTENT_SOURCE_TYPE_LABELS).map(([value, label]) => (
                <SelectItem key={value} value={value}>
                  {label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {isLoading ? (
        <div className="flex items-center gap-2 py-10 text-sm text-gray-500">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading articles…
        </div>
      ) : error ? (
        <div className="flex items-start gap-2 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{error.message || "Failed to load articles."}</span>
        </div>
      ) : articles.length === 0 ? (
        <div className="rounded-md border border-dashed border-gray-200 px-4 py-10 text-center text-sm text-gray-500">
          No articles found in this period.
          <p className="mt-1 text-xs text-gray-400">
            Confirm editorial sources and run a content sync to populate the feed.
          </p>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {articles.map((article) => (
            <ArticleCard key={article.id} article={article} />
          ))}
        </div>
      )}
    </div>
  )
}
