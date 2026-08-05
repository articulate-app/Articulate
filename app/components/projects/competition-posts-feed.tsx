"use client"

import { useMemo } from "react"
import { format } from "date-fns"
import { AlertCircle, ExternalLink, Loader2 } from "lucide-react"
import { Card } from "../ui/card"
import { Label } from "../ui/label"
import { DateRangePicker } from "../ui/date-range-picker"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../ui/select"
import {
  COMPETITOR_NETWORK_LABELS,
  COMPETITOR_SOCIAL_NETWORKS,
  type CompetitorSocialNetwork,
} from "@/lib/competitor-social"
import {
  dedupeCrossNetworkPosts,
  type DedupedSocialPost,
} from "@/lib/project-social-feed"
import type { ProjectSocialPost } from "@/lib/services/project-brand-social"
import type { ProjectCompetitorWithProfiles } from "@/lib/services/project-competitors"

type DateRangeValue = {
  from?: Date
  to?: Date
}

function formatCount(value: number | null | undefined): string {
  if (value == null) return "—"
  return new Intl.NumberFormat("en-US").format(value)
}

function PostCard({ post }: { post: DedupedSocialPost }) {
  const networkLabels = post.networks.map(
    (network) =>
      COMPETITOR_NETWORK_LABELS[network as CompetitorSocialNetwork] ?? network,
  )
  const isMultiNetwork = post.networks.length > 1
  const primaryNetworkLabel =
    COMPETITOR_NETWORK_LABELS[post.network as CompetitorSocialNetwork] ??
    post.network
  const publishedLabel = post.published_at
    ? format(new Date(post.published_at), "dd MMM yyyy")
    : null

  return (
    <Card className="flex flex-col overflow-hidden">
      {post.thumbnail_url ? (
        <div className="relative aspect-[16/10] bg-gray-100">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={post.thumbnail_url}
            alt=""
            className="absolute inset-0 h-full w-full object-cover"
          />
        </div>
      ) : null}

      <div className="flex min-w-0 flex-1 flex-col gap-3 p-3.5">
        <div className="space-y-1.5">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-sm font-medium text-gray-900">
              {post.entity_name ?? "—"}
            </span>
            {post.is_owned ? (
              <span className="rounded bg-sky-50 px-1.5 py-0.5 text-[11px] font-medium text-sky-700">
                Our brand
              </span>
            ) : null}
          </div>
          <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-gray-500">
            {isMultiNetwork ? (
              <span
                className="rounded bg-gray-100 px-1.5 py-0.5 text-[10px] text-gray-600"
                title={networkLabels.join(" · ")}
              >
                {post.networks.length} networks
              </span>
            ) : (
              <span>{networkLabels[0] ?? post.network}</span>
            )}
            {publishedLabel ? (
              <>
                <span aria-hidden className="text-gray-300">
                  ·
                </span>
                <time dateTime={post.published_at ?? undefined}>
                  {publishedLabel}
                </time>
              </>
            ) : null}
          </div>
        </div>

        <p className="line-clamp-4 flex-1 text-sm leading-relaxed text-gray-700">
          {post.text_content || "—"}
        </p>

        <a
          href={post.post_url}
          target="_blank"
          rel="noreferrer"
          className="inline-flex w-fit items-center gap-1 text-xs text-blue-600 hover:underline"
        >
          Open post
          <ExternalLink className="h-3 w-3" />
        </a>

        <div className="mt-auto space-y-1.5 border-t border-gray-100 pt-3">
          {isMultiNetwork ? (
            <p className="text-[10px] text-gray-500">
              Stats from {primaryNetworkLabel}
            </p>
          ) : null}
          <div className="flex flex-wrap gap-x-4 gap-y-2 text-xs text-gray-600">
            <span>
              <span className="text-gray-500">Likes </span>
              <span className="font-medium text-gray-900">
                {formatCount(post.reactions_count)}
              </span>
            </span>
            <span>
              <span className="text-gray-500">Comments </span>
              <span className="font-medium text-gray-900">
                {formatCount(post.comments_count)}
              </span>
            </span>
            <span>
              <span className="text-gray-500">Shares </span>
              <span className="font-medium text-gray-900">
                {formatCount(post.shares_count)}
              </span>
            </span>
            <span>
              <span className="text-gray-500">Views </span>
              <span className="font-medium text-gray-900">
                {formatCount(post.views_count)}
              </span>
            </span>
          </div>
        </div>
      </div>
    </Card>
  )
}

type CompetitionPostsFeedProps = {
  projectId: number
  ownedEntityId: string
  competitors: ProjectCompetitorWithProfiles[]
  posts: ProjectSocialPost[]
  isLoading: boolean
  error: Error | null
  dateRange: DateRangeValue
  onDateRangeChange: (range: DateRangeValue) => void
  filterEntityId: string
  onFilterEntityIdChange: (value: string) => void
  filterNetwork: string
  onFilterNetworkChange: (value: string) => void
  getDefaultDateRange: () => DateRangeValue
  hideFilters?: boolean
  /** Hide period control when the parent Competition header already owns date range. */
  hideDateRange?: boolean
  /** Hide network control when the parent Competition header already owns network filter. */
  hideNetworkFilter?: boolean
  /** Cap cards after cross-network dedupe (e.g. overview). */
  limitCards?: number
}

export function CompetitionPostsFeed({
  ownedEntityId,
  competitors,
  posts,
  isLoading,
  error,
  dateRange,
  onDateRangeChange,
  filterEntityId,
  onFilterEntityIdChange,
  filterNetwork,
  onFilterNetworkChange,
  getDefaultDateRange,
  hideFilters = false,
  hideDateRange = false,
  hideNetworkFilter = false,
  limitCards,
}: CompetitionPostsFeedProps) {
  const dedupedPosts = useMemo(() => {
    const list = dedupeCrossNetworkPosts(posts)
    return typeof limitCards === "number" ? list.slice(0, limitCards) : list
  }, [posts, limitCards])

  const showNetwork = !hideNetworkFilter
  const showDateRange = !hideDateRange

  return (
    <section className="space-y-3">
      {!hideFilters ? (
        <div className="flex flex-wrap items-end gap-3">
          <div className="min-w-[140px] flex-1 basis-[160px] sm:max-w-[200px] sm:flex-none">
            <Label>Entity</Label>
            <Select value={filterEntityId} onValueChange={onFilterEntityIdChange}>
              <SelectTrigger>
                <SelectValue placeholder="All" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All</SelectItem>
                <SelectItem value={ownedEntityId}>Our brand</SelectItem>
                {competitors.map((competitor) => (
                  <SelectItem
                    key={competitor.id}
                    value={`competitor:${competitor.id}`}
                  >
                    {competitor.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {showNetwork ? (
            <div className="min-w-[120px] flex-1 basis-[140px] sm:max-w-[160px] sm:flex-none">
              <Label>Network</Label>
              <Select value={filterNetwork} onValueChange={onFilterNetworkChange}>
                <SelectTrigger>
                  <SelectValue placeholder="All" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All</SelectItem>
                  {COMPETITOR_SOCIAL_NETWORKS.map((network) => (
                    <SelectItem key={network} value={network}>
                      {COMPETITOR_NETWORK_LABELS[network]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ) : null}
          {showDateRange ? (
            <div className="min-w-[180px] flex-1 basis-[200px] sm:flex-none">
              <Label>Date range</Label>
              <DateRangePicker
                value={dateRange}
                onChange={(range) => onDateRangeChange(range ?? getDefaultDateRange())}
              />
            </div>
          ) : null}
        </div>
      ) : null}

      {isLoading ? (
        <div className="flex h-28 items-center justify-center text-sm text-gray-500">
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          Loading posts…
        </div>
      ) : error ? (
        <div className="flex items-start gap-2 rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          Failed to load posts.
        </div>
      ) : dedupedPosts.length === 0 ? (
        <Card className="p-4 text-sm text-gray-500">
          No posts yet. Add brand or competitor profiles and sync.
        </Card>
      ) : (
        <div className="grid gap-3 [grid-template-columns:repeat(auto-fill,minmax(260px,1fr))]">
          {dedupedPosts.map((post) => (
            <PostCard key={post.source_post_ids.join("-")} post={post} />
          ))}
        </div>
      )}
    </section>
  )
}
