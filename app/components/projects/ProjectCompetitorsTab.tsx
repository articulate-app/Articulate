"use client"

import { useMemo, useState, type Dispatch, type SetStateAction } from "react"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { format, subDays } from "date-fns"
import { getPreviousPeriodRange } from "@/lib/competition-previous-period"
import {
  AlertCircle,
  ExternalLink,
  Loader2,
  Pencil,
  RefreshCw,
  Trash2,
} from "lucide-react"
import { Button } from "../ui/button"
import { Card } from "../ui/card"
import { Input } from "../ui/input"
import { Label } from "../ui/label"
import { DateRangePicker } from "../ui/date-range-picker"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../ui/select"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../ui/tabs"
import { toast } from "../ui/use-toast"
import { cn } from "@/lib/utils"
import {
  COMPETITOR_NETWORK_LABELS,
  COMPETITOR_SOCIAL_NETWORKS,
  type CompetitorSocialNetwork,
} from "@/lib/competitor-social"
import { ownedEntityId } from "@/lib/project-social"
import { faviconUrlForSite } from "@/lib/favicon"
import {
  PROJECT_COMPETITORS_QUERY_KEY,
  createCompetitorSocialProfile,
  deleteCompetitorSocialProfile,
  deleteProjectCompetitor,
  listProjectCompetitors,
  syncCompetitorSocialPosts,
  updateCompetitorSocialProfile,
  updateProjectCompetitor,
  type ProjectCompetitorWithProfiles,
} from "@/lib/services/project-competitors"
import {
  PROJECT_BRAND_SOCIAL_PROFILES_QUERY_KEY,
  PROJECT_SOCIAL_POSTS_QUERY_KEY,
  createBrandSocialProfile,
  deleteBrandSocialProfile,
  listProjectBrandSocialProfiles,
  listProjectSocialPosts,
  updateBrandSocialProfile,
  type ProjectBrandSocialProfile,
} from "@/lib/services/project-brand-social"
import {
  PROJECT_SOCIAL_SUMMARY_QUERY_KEY,
  getProjectSocialCompetitiveSummary,
} from "@/lib/services/project-social-analytics"
import {
  PROJECT_COMPETITIVE_ARTICLES_QUERY_KEY,
  PROJECT_COMPETITIVE_CONTENT_SUMMARY_QUERY_KEY,
  PROJECT_KEYWORD_GAP_QUERY_KEY,
  PROJECT_OWNED_CONTENT_PERFORMANCE_QUERY_KEY,
  getOwnedContentPerformance,
  getProjectCompetitiveContentSummary,
  getProjectKeywordGap,
  listProjectCompetitiveArticles,
} from "@/lib/services/project-competitive-content"
import {
  AddCompetitorCard,
  BrandSocialConnectCard,
  DiscoverCompetitorSocialButton,
} from "./competition-connect-cards"
import { CompetitionOverviewPanel } from "./competition-overview-panel"
import { CompetitionPostsFeed } from "./competition-posts-feed"
import { CompetitionCompareDashboard } from "./competition-compare-dashboard"
import { CompetitionArticlesFeed } from "./competition-articles-feed"
import { CompetitionContentCompare } from "./competition-content-compare"
import { CompetitionContentSourcesPanel } from "./competition-content-sources-panel"
import {
  ChartPreviewDateRangeButton,
  ChartPreviewHoverActions,
} from "./chart-preview-hover-actions"

type DateRangeValue = {
  from?: Date
  to?: Date
}

interface ProjectCompetitorsTabProps {
  projectId: number
  variant?: "full" | "preview" | "manage"
}

function getDefaultDateRange(days = 29): DateRangeValue {
  const today = new Date()
  return { from: subDays(today, days), to: today }
}

function syncStatusLabel(status: string | null | undefined): string {
  if (!status || status === "idle") return "Never synced"
  switch (status) {
    case "running":
    case "queued":
      return "Syncing…"
    case "succeeded":
      return "Synced"
    case "partial":
      return "Partial"
    case "failed":
      return "Failed"
    default:
      return status
  }
}

/** Networks not yet linked for an entity — adding a duplicate is rejected by the DB. */
function unusedNetworks(
  used: Iterable<CompetitorSocialNetwork>,
): CompetitorSocialNetwork[] {
  const taken = new Set(used)
  return COMPETITOR_SOCIAL_NETWORKS.filter((network) => !taken.has(network))
}

function toRangeEndIso(date: Date): string {
  return new Date(
    date.getFullYear(),
    date.getMonth(),
    date.getDate(),
    23,
    59,
    59,
  ).toISOString()
}

export function ProjectCompetitorsTab({
  projectId,
  variant = "full",
}: ProjectCompetitorsTabProps) {
  const queryClient = useQueryClient()
  const isPreview = variant === "preview"
  const isManage = variant === "manage"
  const showAnalytics = !isManage

  const [activeTab, setActiveTab] = useState("overview")
  const [dateRange, setDateRange] = useState<DateRangeValue>(getDefaultDateRange)
  const [comparePreviousPeriod, setComparePreviousPeriod] = useState(false)
  const [filterEntityId, setFilterEntityId] = useState<string>("all")
  const [filterNetwork, setFilterNetwork] = useState<string>("all")
  const [filterSourceType, setFilterSourceType] = useState<string>("all")
  const [isSyncing, setIsSyncing] = useState(false)

  // Manage-only state
  const [brandDraft, setBrandDraft] = useState<{
    network: CompetitorSocialNetwork
    profileUrl: string
  }>({ network: "linkedin", profileUrl: "" })
  const [isSavingBrandProfile, setIsSavingBrandProfile] = useState(false)
  const [profileDrafts, setProfileDrafts] = useState<
    Record<number, { network: CompetitorSocialNetwork; profileUrl: string }>
  >({})
  const [editingCompetitorId, setEditingCompetitorId] = useState<number | null>(null)
  const [editName, setEditName] = useState("")
  const [editWebsite, setEditWebsite] = useState("")
  const [syncingProfileId, setSyncingProfileId] = useState<number | null>(null)
  const [syncingBrandProfileId, setSyncingBrandProfileId] = useState<number | null>(
    null,
  )

  const ownedEntity = ownedEntityId(projectId)
  const fromIso = dateRange.from?.toISOString() ?? null
  const toIso = dateRange.to ? toRangeEndIso(dateRange.to) : null

  const previousPeriod = useMemo(() => {
    if (!dateRange.from || !dateRange.to) return null
    return getPreviousPeriodRange({ from: dateRange.from, to: dateRange.to })
  }, [dateRange.from, dateRange.to])

  const previousFromIso = previousPeriod?.from.toISOString() ?? null
  const previousToIso = previousPeriod
    ? toRangeEndIso(previousPeriod.to)
    : null
  const networkFilter =
    filterNetwork === "all" ? null : ([filterNetwork] as CompetitorSocialNetwork[])
  const entityFilter = filterEntityId === "all" ? null : [filterEntityId]

  const {
    data: competitors = [],
    isLoading: competitorsLoading,
    error: competitorsError,
    refetch: refetchCompetitors,
  } = useQuery({
    queryKey: [PROJECT_COMPETITORS_QUERY_KEY, projectId],
    queryFn: () => listProjectCompetitors(projectId),
  })

  const {
    data: brandProfiles = [],
    isLoading: brandProfilesLoading,
    error: brandProfilesError,
    refetch: refetchBrandProfiles,
  } = useQuery({
    queryKey: [PROJECT_BRAND_SOCIAL_PROFILES_QUERY_KEY, projectId],
    queryFn: () => listProjectBrandSocialProfiles(projectId),
  })

  const {
    data: summary,
    isLoading: summaryLoading,
    error: summaryError,
    refetch: refetchSummary,
  } = useQuery({
    queryKey: [
      PROJECT_SOCIAL_SUMMARY_QUERY_KEY,
      projectId,
      fromIso,
      toIso,
      filterNetwork,
    ],
    queryFn: () =>
      getProjectSocialCompetitiveSummary({
        projectId,
        from: fromIso,
        to: toIso,
        networks: networkFilter,
      }),
    enabled: showAnalytics,
  })

  const {
    data: previousSummary,
    isLoading: previousSummaryLoading,
  } = useQuery({
    queryKey: [
      PROJECT_SOCIAL_SUMMARY_QUERY_KEY,
      "previous",
      projectId,
      previousFromIso,
      previousToIso,
      filterNetwork,
    ],
    queryFn: () =>
      getProjectSocialCompetitiveSummary({
        projectId,
        from: previousFromIso,
        to: previousToIso,
        networks: networkFilter,
      }),
    enabled:
      showAnalytics &&
      comparePreviousPeriod &&
      Boolean(previousFromIso && previousToIso) &&
      (isPreview || activeTab === "overview"),
  })

  const {
    data: posts = [],
    isLoading: postsLoading,
    error: postsError,
    refetch: refetchPosts,
  } = useQuery({
    queryKey: [
      PROJECT_SOCIAL_POSTS_QUERY_KEY,
      projectId,
      filterEntityId,
      filterNetwork,
      fromIso,
      toIso,
    ],
    queryFn: () =>
      listProjectSocialPosts({
        projectId,
        entityIds: entityFilter,
        networks: networkFilter,
        from: fromIso,
        to: toIso,
        limit: isPreview ? 24 : 100,
      }),
    enabled: showAnalytics && (isPreview || activeTab === "posts" || activeTab === "overview"),
  })

  const overviewPosts = useMemo(
    () => posts.slice(0, isPreview ? 12 : 24),
    [posts, isPreview],
  )

  const sourceTypeFilter =
    filterSourceType === "all" ? null : [filterSourceType]

  const {
    data: articles = [],
    isLoading: articlesLoading,
    error: articlesError,
  } = useQuery({
    queryKey: [
      PROJECT_COMPETITIVE_ARTICLES_QUERY_KEY,
      projectId,
      filterEntityId,
      filterSourceType,
      fromIso,
      toIso,
    ],
    queryFn: () =>
      listProjectCompetitiveArticles({
        projectId,
        dateFrom: fromIso,
        dateTo: toIso,
        entityIds: entityFilter,
        sourceTypes: sourceTypeFilter,
        limit: 100,
      }),
    enabled: showAnalytics && activeTab === "articles",
  })

  const {
    data: contentSummary,
    isLoading: contentSummaryLoading,
    error: contentSummaryError,
    refetch: refetchContentSummary,
  } = useQuery({
    queryKey: [
      PROJECT_COMPETITIVE_CONTENT_SUMMARY_QUERY_KEY,
      projectId,
      fromIso,
      toIso,
    ],
    queryFn: () =>
      getProjectCompetitiveContentSummary({
        projectId,
        dateFrom: fromIso,
        dateTo: toIso,
      }),
    enabled: showAnalytics && activeTab === "content",
  })

  const {
    data: keywordGap = [],
    isLoading: keywordGapLoading,
  } = useQuery({
    queryKey: [PROJECT_KEYWORD_GAP_QUERY_KEY, projectId, fromIso, toIso],
    queryFn: () =>
      getProjectKeywordGap({
        projectId,
        dateFrom: fromIso,
        dateTo: toIso,
      }),
    enabled: showAnalytics && activeTab === "content",
  })

  const {
    data: ownedPerformance,
    isLoading: ownedPerformanceLoading,
  } = useQuery({
    queryKey: [
      PROJECT_OWNED_CONTENT_PERFORMANCE_QUERY_KEY,
      projectId,
      dateRange.from ? format(dateRange.from, "yyyy-MM-dd") : null,
      dateRange.to ? format(dateRange.to, "yyyy-MM-dd") : null,
    ],
    queryFn: () =>
      getOwnedContentPerformance({
        projectId,
        dateFrom: dateRange.from ? format(dateRange.from, "yyyy-MM-dd") : null,
        dateTo: dateRange.to ? format(dateRange.to, "yyyy-MM-dd") : null,
      }),
    enabled: showAnalytics && activeTab === "content",
  })

  const activeCompetitors = useMemo(
    () => competitors.filter((row) => row.is_active),
    [competitors],
  )
  const activeBrandProfiles = useMemo(
    () => brandProfiles.filter((row) => row.is_active),
    [brandProfiles],
  )
  const canSync = activeCompetitors.length > 0 || activeBrandProfiles.length > 0

  const invalidateAll = async () => {
    await Promise.all([
      queryClient.invalidateQueries({
        queryKey: [PROJECT_COMPETITORS_QUERY_KEY, projectId],
      }),
      queryClient.invalidateQueries({
        queryKey: [PROJECT_BRAND_SOCIAL_PROFILES_QUERY_KEY, projectId],
      }),
      queryClient.invalidateQueries({
        queryKey: [PROJECT_SOCIAL_POSTS_QUERY_KEY, projectId],
      }),
      queryClient.invalidateQueries({
        queryKey: [PROJECT_SOCIAL_SUMMARY_QUERY_KEY, projectId],
      }),
    ])
  }

  const handleSync = async (scope?: {
    competitorId?: number
    socialProfileId?: number
    brandSocialProfileId?: number
    entityType?: "owned" | "competitor" | "all"
  }) => {
    if (scope?.socialProfileId) setSyncingProfileId(scope.socialProfileId)
    else if (scope?.brandSocialProfileId) {
      setSyncingBrandProfileId(scope.brandSocialProfileId)
    } else setIsSyncing(true)
    try {
      // One profile per invoke — Bright Data polls can take ~90s each, and a
      // multi-profile batch exceeds the Edge Function wall-clock (non-2xx).
      const isSingleProfile = Boolean(
        scope?.socialProfileId || scope?.brandSocialProfileId,
      )
      const entityType = scope?.entityType ?? "all"
      const jobs: Array<{
        competitorId?: number
        socialProfileId?: number
        brandSocialProfileId?: number
        entityType?: "owned" | "competitor" | "all"
      }> = []

      if (isSingleProfile) {
        jobs.push({
          competitorId: scope?.competitorId,
          socialProfileId: scope?.socialProfileId,
          brandSocialProfileId: scope?.brandSocialProfileId,
          entityType,
        })
      } else if (scope?.competitorId) {
        const profiles = competitors
          .find((row) => row.id === scope.competitorId)
          ?.profiles?.filter((p) => p.is_active) ?? []
        for (const profile of profiles) {
          jobs.push({
            competitorId: scope.competitorId,
            socialProfileId: profile.id,
            entityType: "competitor",
          })
        }
      } else {
        if (entityType !== "competitor") {
          for (const profile of activeBrandProfiles) {
            jobs.push({
              brandSocialProfileId: profile.id,
              entityType: "owned",
            })
          }
        }
        if (entityType !== "owned") {
          for (const competitor of activeCompetitors) {
            for (const profile of competitor.profiles ?? []) {
              if (!profile.is_active) continue
              jobs.push({
                competitorId: competitor.id,
                socialProfileId: profile.id,
                entityType: "competitor",
              })
            }
          }
        }
      }

      if (jobs.length === 0) {
        toast({
          title: "Nothing to sync",
          description: "Add an active brand or competitor profile first.",
        })
        return
      }

      let succeeded = 0
      let failed = 0
      let lastError: string | undefined

      for (const job of jobs) {
        const result = await syncCompetitorSocialPosts({
          projectId,
          competitorId: job.competitorId,
          socialProfileId: job.socialProfileId,
          brandSocialProfileId: job.brandSocialProfileId,
          entityType: job.entityType ?? "all",
          trigger: "manual",
        })
        if (result.ok) succeeded += result.profiles_succeeded ?? 1
        else {
          failed += Math.max(1, result.profiles_failed ?? 1)
          lastError = result.error
        }
      }

      await invalidateAll()
      if (failed > 0) {
        toast({
          title: succeeded > 0 ? "Sync finished with errors" : "Sync failed",
          description:
            lastError ||
            `${failed} profile(s) failed${succeeded ? `, ${succeeded} succeeded` : ""}. Check profile status.`,
          variant: "destructive",
        })
        return
      }
      toast({
        title: "Sync complete",
        description: `${succeeded} profile(s) updated.`,
      })
      await Promise.all([
        refetchCompetitors(),
        refetchBrandProfiles(),
        refetchSummary(),
        refetchPosts(),
      ])
    } catch (error: any) {
      toast({
        title: "Sync failed",
        description: error?.message || "Please try again.",
        variant: "destructive",
      })
    } finally {
      setIsSyncing(false)
      setSyncingProfileId(null)
      setSyncingBrandProfileId(null)
    }
  }

  if (competitorsLoading || brandProfilesLoading) {
    return (
      <div className="flex h-40 items-center justify-center text-sm text-gray-500">
        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
        Loading competition…
      </div>
    )
  }

  if (competitorsError || brandProfilesError) {
    return (
      <div className="flex items-start gap-2 rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-700">
        <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
        <div>
          Failed to load competition data.{" "}
          <button
            className="underline"
            onClick={() => {
              void refetchCompetitors()
              void refetchBrandProfiles()
            }}
          >
            Retry
          </button>
        </div>
      </div>
    )
  }

  if (isPreview) {
    const previewReady = !summaryLoading && !summaryError && Boolean(summary)
    const hasBrandProfiles = brandProfiles.length > 0
    const hasCompetitors = competitors.length > 0
    const setupCards =
      hasBrandProfiles && hasCompetitors ? null : (
        <div className="grid gap-3 md:grid-cols-2">
          {hasBrandProfiles ? null : (
            <BrandSocialConnectCard
              projectId={projectId}
              onDone={() => void refetchBrandProfiles()}
            />
          )}
          {hasCompetitors ? null : (
            <AddCompetitorCard
              projectId={projectId}
              onDone={() => void refetchCompetitors()}
            />
          )}
        </div>
      )

    if (!hasBrandProfiles && !hasCompetitors) return setupCards

    const previewPanel = (
      <ChartPreviewHoverActions
        enabled={previewReady}
        actions={
          <ChartPreviewDateRangeButton
            value={dateRange}
            onChange={(range) => setDateRange(range ?? getDefaultDateRange())}
          />
        }
      >
        <CompetitionOverviewPanel
          summary={summary}
          isLoading={summaryLoading}
          error={summaryError as Error | null}
          compact={false}
          onRetry={() => void refetchSummary()}
          recentPosts={overviewPosts}
          recentPostsLoading={postsLoading}
          recentPostsError={postsError as Error | null}
          ownedEntityId={ownedEntity}
          competitors={competitors}
        />
      </ChartPreviewHoverActions>
    )

    if (!setupCards) return previewPanel

    return (
      <div className="space-y-4">
        {setupCards}
        {previewPanel}
      </div>
    )
  }

  if (isManage) {
    return (
      <CompetitionManageContent
        projectId={projectId}
        competitors={competitors}
        brandProfiles={brandProfiles}
        canSync={canSync}
        isSyncing={isSyncing}
        syncingProfileId={syncingProfileId}
        syncingBrandProfileId={syncingBrandProfileId}
        onSync={handleSync}
        brandDraft={brandDraft}
        setBrandDraft={setBrandDraft}
        isSavingBrandProfile={isSavingBrandProfile}
        setIsSavingBrandProfile={setIsSavingBrandProfile}
        profileDrafts={profileDrafts}
        setProfileDrafts={setProfileDrafts}
        editingCompetitorId={editingCompetitorId}
        setEditingCompetitorId={setEditingCompetitorId}
        editName={editName}
        setEditName={setEditName}
        editWebsite={editWebsite}
        setEditWebsite={setEditWebsite}
        refetchCompetitors={refetchCompetitors}
        refetchBrandProfiles={refetchBrandProfiles}
        invalidateAll={invalidateAll}
      />
    )
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-gray-900">Competition</h2>
          <p className="mt-1 text-sm text-gray-500">
            Compare your brand and competitors across social posts, articles, and SEO.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="min-w-[11rem] w-44">
            <DateRangePicker
              value={dateRange}
              onChange={(range) => setDateRange(range ?? getDefaultDateRange())}
            />
          </div>
          {activeTab === "overview" || activeTab === "posts" || activeTab === "compare" ? (
            <Select value={filterNetwork} onValueChange={setFilterNetwork}>
              <SelectTrigger className="w-[140px]">
                <SelectValue placeholder="Network" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All networks</SelectItem>
                {COMPETITOR_SOCIAL_NETWORKS.map((network) => (
                  <SelectItem key={network} value={network}>
                    {COMPETITOR_NETWORK_LABELS[network]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : null}
          <Button onClick={() => void handleSync()} disabled={isSyncing || !canSync}>
            {isSyncing ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="mr-2 h-4 w-4" />
            )}
            Sync social
          </Button>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="posts">Posts</TabsTrigger>
          <TabsTrigger value="compare">Compare</TabsTrigger>
          <TabsTrigger value="articles">Articles</TabsTrigger>
          <TabsTrigger value="content">Content & SEO</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="mt-4">
          <CompetitionOverviewPanel
            summary={summary}
            isLoading={summaryLoading}
            error={summaryError as Error | null}
            onRetry={() => void refetchSummary()}
            recentPosts={overviewPosts}
            recentPostsLoading={postsLoading}
            recentPostsError={postsError as Error | null}
            ownedEntityId={ownedEntity}
            competitors={competitors}
            previousSummary={previousSummary}
            previousSummaryLoading={previousSummaryLoading}
            comparePreviousPeriod={comparePreviousPeriod}
            onComparePreviousPeriodChange={setComparePreviousPeriod}
          />
        </TabsContent>

        <TabsContent value="posts" className="mt-4">
          <CompetitionPostsFeed
            projectId={projectId}
            ownedEntityId={ownedEntity}
            competitors={competitors}
            posts={posts}
            isLoading={postsLoading}
            error={postsError as Error | null}
            dateRange={dateRange}
            onDateRangeChange={setDateRange}
            filterEntityId={filterEntityId}
            onFilterEntityIdChange={setFilterEntityId}
            filterNetwork={filterNetwork}
            onFilterNetworkChange={setFilterNetwork}
            getDefaultDateRange={getDefaultDateRange}
            hideDateRange
            hideNetworkFilter
          />
        </TabsContent>

        <TabsContent value="compare" className="mt-4">
          <CompetitionCompareDashboard
            summary={summary}
            isLoading={summaryLoading}
            error={summaryError as Error | null}
            onRetry={() => void refetchSummary()}
          />
        </TabsContent>

        <TabsContent value="articles" className="mt-4">
          <CompetitionArticlesFeed
            projectId={projectId}
            ownedEntityId={ownedEntity}
            competitors={competitors}
            articles={articles}
            isLoading={articlesLoading}
            error={articlesError as Error | null}
            filterEntityId={filterEntityId}
            onFilterEntityIdChange={setFilterEntityId}
            filterSourceType={filterSourceType}
            onFilterSourceTypeChange={setFilterSourceType}
          />
        </TabsContent>

        <TabsContent value="content" className="mt-4">
          <CompetitionContentCompare
            summary={contentSummary}
            keywordGap={keywordGap}
            ownedPerformance={ownedPerformance}
            isLoading={
              contentSummaryLoading || keywordGapLoading || ownedPerformanceLoading
            }
            error={contentSummaryError as Error | null}
            onRetry={() => void refetchContentSummary()}
          />
        </TabsContent>
      </Tabs>
    </div>
  )
}

type ManageContentProps = {
  projectId: number
  competitors: ProjectCompetitorWithProfiles[]
  brandProfiles: ProjectBrandSocialProfile[]
  canSync: boolean
  isSyncing: boolean
  syncingProfileId: number | null
  syncingBrandProfileId: number | null
  onSync: (scope?: {
    competitorId?: number
    socialProfileId?: number
    brandSocialProfileId?: number
    entityType?: "owned" | "competitor" | "all"
  }) => Promise<void>
  brandDraft: { network: CompetitorSocialNetwork; profileUrl: string }
  setBrandDraft: Dispatch<
    SetStateAction<{ network: CompetitorSocialNetwork; profileUrl: string }>
  >
  isSavingBrandProfile: boolean
  setIsSavingBrandProfile: (value: boolean) => void
  profileDrafts: Record<number, { network: CompetitorSocialNetwork; profileUrl: string }>
  setProfileDrafts: Dispatch<
    SetStateAction<
      Record<number, { network: CompetitorSocialNetwork; profileUrl: string }>
    >
  >
  editingCompetitorId: number | null
  setEditingCompetitorId: (value: number | null) => void
  editName: string
  setEditName: (value: string) => void
  editWebsite: string
  setEditWebsite: (value: string) => void
  refetchCompetitors: () => Promise<unknown>
  refetchBrandProfiles: () => Promise<unknown>
  invalidateAll: () => Promise<void>
}

function CompetitionManageContent(props: ManageContentProps) {
  const {
    projectId,
    competitors,
    brandProfiles,
    canSync,
    isSyncing,
    syncingProfileId,
    syncingBrandProfileId,
    onSync,
  } = props

  const brandNetworkOptions = unusedNetworks(
    brandProfiles.map((profile) => profile.network),
  )
  const brandNetwork = brandNetworkOptions.includes(props.brandDraft.network)
    ? props.brandDraft.network
    : brandNetworkOptions[0] ?? props.brandDraft.network

  const handleAddBrandProfile = async () => {
    if (!props.brandDraft.profileUrl.trim()) {
      toast({
        title: "Profile URL required",
        description: "Paste your public brand profile or page URL.",
        variant: "destructive",
      })
      return
    }
    props.setIsSavingBrandProfile(true)
    try {
      await createBrandSocialProfile({
        projectId,
        network: brandNetwork,
        profileUrl: props.brandDraft.profileUrl,
      })
      props.setBrandDraft({ network: "linkedin", profileUrl: "" })
      await props.refetchBrandProfiles()
      toast({ title: "Brand social profile added" })
    } catch (error: any) {
      toast({
        title: "Could not add brand profile",
        description: error?.message || "Please try again.",
        variant: "destructive",
      })
    } finally {
      props.setIsSavingBrandProfile(false)
    }
  }

  const handleToggleBrandProfile = async (profile: ProjectBrandSocialProfile) => {
    try {
      await updateBrandSocialProfile({
        profileId: profile.id,
        isActive: !profile.is_active,
      })
      await props.refetchBrandProfiles()
    } catch (error: any) {
      toast({
        title: "Could not update brand profile",
        description: error?.message || "Please try again.",
        variant: "destructive",
      })
    }
  }

  const handleDeleteBrandProfile = async (profileId: number) => {
    if (!window.confirm("Remove this brand social profile and its synced posts?")) {
      return
    }
    try {
      await deleteBrandSocialProfile(profileId)
      await props.invalidateAll()
      toast({ title: "Brand profile removed" })
    } catch (error: any) {
      toast({
        title: "Delete failed",
        description: error?.message || "Please try again.",
        variant: "destructive",
      })
    }
  }

  return (
    <div className="min-w-0 space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-base font-semibold text-gray-900">Competition</h2>
          <p className="mt-1 text-sm text-gray-500">
            Paste a website URL for your brand and each competitor — we link their
            social profiles and track their content.
          </p>
        </div>
        <Button
          className="w-full sm:w-auto"
          onClick={() => void onSync()}
          disabled={isSyncing || !canSync}
        >
          {isSyncing ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <RefreshCw className="mr-2 h-4 w-4" />
          )}
          Sync social
        </Button>
      </div>

      <section className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 className="text-sm font-medium text-gray-900">Our brand</h3>
            <p className="text-xs text-gray-500">
              Your project&apos;s own social profiles — not a competitor.
            </p>
          </div>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => void onSync({ entityType: "owned" })}
            disabled={isSyncing || brandProfiles.every((p) => !p.is_active)}
          >
            <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
            Sync brand
          </Button>
        </div>

        {brandProfiles.length === 0 ? (
          <BrandSocialConnectCard
            projectId={projectId}
            onDone={() => void props.refetchBrandProfiles()}
          />
        ) : (
          <div className="space-y-2">
            {brandProfiles.map((profile) => (
              <Card
                key={profile.id}
                className="flex min-w-0 flex-col gap-2 p-3 sm:flex-row sm:items-start sm:justify-between"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2 text-sm">
                    <span className="rounded bg-sky-50 px-1.5 py-0.5 text-[11px] font-medium text-sky-700">
                      Our brand
                    </span>
                    <span className="font-medium text-gray-900">
                      {COMPETITOR_NETWORK_LABELS[profile.network]}
                    </span>
                    <span
                      className={cn(
                        "rounded px-1.5 py-0.5 text-[11px]",
                        profile.is_active
                          ? "bg-emerald-50 text-emerald-700"
                          : "bg-gray-100 text-gray-500",
                      )}
                    >
                      {profile.is_active ? "Active" : "Inactive"}
                    </span>
                    <span className="text-xs text-gray-500">
                      {syncStatusLabel(profile.last_sync_status)}
                      {profile.last_synced_at
                        ? ` · ${format(
                            new Date(profile.last_synced_at),
                            "dd MMM yyyy HH:mm",
                          )}`
                        : ""}
                    </span>
                  </div>
                  <a
                    href={profile.profile_url}
                    target="_blank"
                    rel="noreferrer"
                    className="mt-0.5 block break-all text-xs text-blue-600 hover:underline sm:truncate sm:break-normal"
                  >
                    {profile.profile_url}
                  </a>
                  {profile.last_sync_error ? (
                    <p className="mt-1 text-xs text-red-600">{profile.last_sync_error}</p>
                  ) : null}
                </div>
                <div className="flex flex-wrap items-center gap-1">
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={syncingBrandProfileId === profile.id}
                    onClick={() =>
                      void onSync({
                        brandSocialProfileId: profile.id,
                        entityType: "owned",
                      })
                    }
                  >
                    {syncingBrandProfileId === profile.id ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <RefreshCw className="h-4 w-4" />
                    )}
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => void handleToggleBrandProfile(profile)}
                  >
                    {profile.is_active ? "Deactivate" : "Activate"}
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="text-red-600"
                    onClick={() => void handleDeleteBrandProfile(profile.id)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </Card>
            ))}
          </div>
        )}

        <details className="text-xs text-gray-500">
          <summary className="cursor-pointer text-gray-600">
            Advanced: add a profile URL manually
          </summary>
          <div className="mt-2 grid min-w-0 gap-2 sm:grid-cols-[minmax(0,160px)_minmax(0,1fr)_auto]">
            <Select
              value={brandNetwork}
              disabled={brandNetworkOptions.length === 0}
              onValueChange={(value) =>
                props.setBrandDraft((prev) => ({
                  ...prev,
                  network: value as CompetitorSocialNetwork,
                }))
              }
            >
              <SelectTrigger className="w-full min-w-0">
                <SelectValue placeholder="Network" />
              </SelectTrigger>
              <SelectContent>
                {brandNetworkOptions.map((network) => (
                  <SelectItem key={network} value={network}>
                    {COMPETITOR_NETWORK_LABELS[network]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Input
              className="min-w-0"
              value={props.brandDraft.profileUrl}
              disabled={brandNetworkOptions.length === 0}
              onChange={(event) =>
                props.setBrandDraft((prev) => ({
                  ...prev,
                  profileUrl: event.target.value,
                }))
              }
              placeholder="https://www.linkedin.com/company/…"
            />
            <Button
              className="w-full sm:w-auto"
              onClick={() => void handleAddBrandProfile()}
              disabled={props.isSavingBrandProfile || brandNetworkOptions.length === 0}
            >
              {props.isSavingBrandProfile ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : null}
              Add brand profile
            </Button>
          </div>
        </details>
      </section>

      <section className="space-y-3">
        <h3 className="text-sm font-medium text-gray-900">Competitors</h3>
        {competitors.length === 0 ? null : (
          <div className="space-y-3">
            {competitors.map((competitor) => {
              const draft = props.profileDrafts[competitor.id] ?? {
                network: "linkedin" as CompetitorSocialNetwork,
                profileUrl: "",
              }
              const isEditing = props.editingCompetitorId === competitor.id
              const networkOptions = unusedNetworks(
                competitor.profiles.map((profile) => profile.network),
              )
              const draftNetwork = networkOptions.includes(draft.network)
                ? draft.network
                : networkOptions[0] ?? draft.network
              const allNetworksLinked = networkOptions.length === 0
              const favicon = faviconUrlForSite(competitor.website_url)
              return (
                <Card key={competitor.id} className="space-y-3 p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0 flex-1 space-y-2">
                      {isEditing ? (
                        <div className="grid gap-2 sm:grid-cols-2">
                          <div>
                            <Label>Name</Label>
                            <Input
                              value={props.editName}
                              onChange={(event) =>
                                props.setEditName(event.target.value)
                              }
                            />
                          </div>
                          <div>
                            <Label>Website</Label>
                            <Input
                              value={props.editWebsite}
                              onChange={(event) =>
                                props.setEditWebsite(event.target.value)
                              }
                              placeholder="https://…"
                            />
                          </div>
                        </div>
                      ) : (
                        <div>
                          <div className="flex flex-wrap items-center gap-2">
                            {favicon ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img
                                src={favicon}
                                alt=""
                                width={20}
                                height={20}
                                loading="lazy"
                                className="h-5 w-5 shrink-0 rounded"
                              />
                            ) : (
                              <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded bg-gray-100 text-[10px] font-semibold uppercase text-gray-500">
                                {competitor.name.charAt(0)}
                              </span>
                            )}
                            <p className="font-medium text-gray-900">
                              {competitor.name}
                            </p>
                            <span
                              className={cn(
                                "rounded px-1.5 py-0.5 text-[11px]",
                                competitor.is_active
                                  ? "bg-emerald-50 text-emerald-700"
                                  : "bg-gray-100 text-gray-500",
                              )}
                            >
                              {competitor.is_active ? "Active" : "Inactive"}
                            </span>
                          </div>
                          {competitor.website_url ? (
                            <a
                              href={competitor.website_url}
                              target="_blank"
                              rel="noreferrer"
                              className="mt-1 inline-flex items-center gap-1 text-xs text-blue-600 hover:underline"
                            >
                              {competitor.website_url}
                              <ExternalLink className="h-3 w-3" />
                            </a>
                          ) : null}
                        </div>
                      )}
                    </div>
                    <div className="flex flex-wrap items-center gap-1">
                      {isEditing ? (
                        <>
                          <Button
                            size="sm"
                            onClick={async () => {
                              try {
                                await updateProjectCompetitor({
                                  competitorId: competitor.id,
                                  name: props.editName,
                                  websiteUrl: props.editWebsite || null,
                                })
                                props.setEditingCompetitorId(null)
                                await props.refetchCompetitors()
                                toast({ title: "Competitor updated" })
                              } catch (error: any) {
                                toast({
                                  title: "Update failed",
                                  description: error?.message || "Please try again.",
                                  variant: "destructive",
                                })
                              }
                            }}
                          >
                            Save
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => props.setEditingCompetitorId(null)}
                          >
                            Cancel
                          </Button>
                        </>
                      ) : (
                        <>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => {
                              props.setEditingCompetitorId(competitor.id)
                              props.setEditName(competitor.name)
                              props.setEditWebsite(competitor.website_url ?? "")
                            }}
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={async () => {
                              try {
                                await updateProjectCompetitor({
                                  competitorId: competitor.id,
                                  isActive: !competitor.is_active,
                                })
                                await props.refetchCompetitors()
                              } catch (error: any) {
                                toast({
                                  title: "Could not update competitor",
                                  description: error?.message || "Please try again.",
                                  variant: "destructive",
                                })
                              }
                            }}
                          >
                            {competitor.is_active ? "Deactivate" : "Activate"}
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() =>
                              void onSync({ competitorId: competitor.id })
                            }
                            disabled={isSyncing}
                          >
                            <RefreshCw className="h-4 w-4" />
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="text-red-600"
                            onClick={async () => {
                              if (
                                !window.confirm(
                                  "Remove this competitor and all linked profiles/posts?",
                                )
                              ) {
                                return
                              }
                              try {
                                await deleteProjectCompetitor(competitor.id)
                                await props.invalidateAll()
                                toast({ title: "Competitor removed" })
                              } catch (error: any) {
                                toast({
                                  title: "Delete failed",
                                  description: error?.message || "Please try again.",
                                  variant: "destructive",
                                })
                              }
                            }}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </>
                      )}
                    </div>
                  </div>

                  <div className="space-y-2 border-t border-gray-100 pt-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="text-xs font-medium uppercase tracking-wide text-gray-500">
                        Social profiles
                      </p>
                      {competitor.website_url && !allNetworksLinked ? (
                        <DiscoverCompetitorSocialButton
                          projectId={projectId}
                          competitorId={competitor.id}
                          websiteUrl={competitor.website_url}
                          onDone={() => props.refetchCompetitors()}
                        />
                      ) : null}
                    </div>
                    {competitor.profiles.length === 0 ? (
                      <p className="text-sm text-gray-500">
                        No profiles linked yet.
                      </p>
                    ) : (
                      <div className="space-y-2">
                        {competitor.profiles.map((profile) => (
                          <div
                            key={profile.id}
                            className="flex flex-wrap items-start justify-between gap-2 rounded-md border border-gray-100 bg-gray-50/70 px-3 py-2"
                          >
                            <div className="min-w-0">
                              <div className="flex flex-wrap items-center gap-2 text-sm">
                                <span className="font-medium text-gray-900">
                                  {COMPETITOR_NETWORK_LABELS[profile.network]}
                                </span>
                                <span className="text-xs text-gray-500">
                                  {syncStatusLabel(profile.last_sync_status)}
                                </span>
                              </div>
                              <a
                                href={profile.profile_url}
                                target="_blank"
                                rel="noreferrer"
                                className="mt-0.5 block truncate text-xs text-blue-600 hover:underline"
                              >
                                {profile.profile_url}
                              </a>
                            </div>
                            <div className="flex items-center gap-1">
                              <Button
                                size="sm"
                                variant="ghost"
                                disabled={syncingProfileId === profile.id}
                                onClick={() =>
                                  void onSync({ socialProfileId: profile.id })
                                }
                              >
                                {syncingProfileId === profile.id ? (
                                  <Loader2 className="h-4 w-4 animate-spin" />
                                ) : (
                                  <RefreshCw className="h-4 w-4" />
                                )}
                              </Button>
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={async () => {
                                  try {
                                    await updateCompetitorSocialProfile({
                                      profileId: profile.id,
                                      isActive: !profile.is_active,
                                    })
                                    await props.refetchCompetitors()
                                  } catch (error: any) {
                                    toast({
                                      title: "Could not update profile",
                                      description:
                                        error?.message || "Please try again.",
                                      variant: "destructive",
                                    })
                                  }
                                }}
                              >
                                {profile.is_active ? "Deactivate" : "Activate"}
                              </Button>
                              <Button
                                size="sm"
                                variant="ghost"
                                className="text-red-600"
                                onClick={async () => {
                                  if (!window.confirm("Remove this social profile?")) {
                                    return
                                  }
                                  try {
                                    await deleteCompetitorSocialProfile(profile.id)
                                    await props.invalidateAll()
                                    toast({ title: "Profile removed" })
                                  } catch (error: any) {
                                    toast({
                                      title: "Delete failed",
                                      description:
                                        error?.message || "Please try again.",
                                      variant: "destructive",
                                    })
                                  }
                                }}
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}

                    <details className="text-xs text-gray-500">
                      <summary className="cursor-pointer text-gray-600">
                        Advanced: add a profile URL manually
                      </summary>
                      <div className="mt-2 grid min-w-0 gap-2 sm:grid-cols-[minmax(0,160px)_minmax(0,1fr)_auto]">
                        <Select
                          value={draftNetwork}
                          disabled={allNetworksLinked}
                          onValueChange={(value) =>
                            props.setProfileDrafts((prev) => ({
                              ...prev,
                              [competitor.id]: {
                                ...draft,
                                network: value as CompetitorSocialNetwork,
                              },
                            }))
                          }
                        >
                          <SelectTrigger className="w-full min-w-0">
                            <SelectValue placeholder="Network" />
                          </SelectTrigger>
                          <SelectContent>
                            {networkOptions.map((network) => (
                              <SelectItem key={network} value={network}>
                                {COMPETITOR_NETWORK_LABELS[network]}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <Input
                          className="min-w-0"
                          value={draft.profileUrl}
                          disabled={allNetworksLinked}
                          onChange={(event) =>
                            props.setProfileDrafts((prev) => ({
                              ...prev,
                              [competitor.id]: {
                                ...draft,
                                profileUrl: event.target.value,
                              },
                            }))
                          }
                          placeholder="https://www.linkedin.com/in/… or company/…"
                        />
                        <Button
                          className="w-full sm:w-auto"
                          disabled={allNetworksLinked}
                          onClick={async () => {
                            if (!draft.profileUrl.trim()) {
                              toast({
                                title: "Profile URL required",
                                description: "Paste the public profile or page URL.",
                                variant: "destructive",
                              })
                              return
                            }
                            try {
                              await createCompetitorSocialProfile({
                                projectId,
                                competitorId: competitor.id,
                                network: draftNetwork,
                                profileUrl: draft.profileUrl,
                              })
                              props.setProfileDrafts((prev) => {
                                const next = { ...prev }
                                delete next[competitor.id]
                                return next
                              })
                              await props.refetchCompetitors()
                              toast({ title: "Social profile added" })
                            } catch (error: any) {
                              toast({
                                title: "Could not add profile",
                                description: error?.message || "Please try again.",
                                variant: "destructive",
                              })
                            }
                          }}
                        >
                          Add profile
                        </Button>
                      </div>
                    </details>
                  </div>
                </Card>
              )
            })}
          </div>
        )}

        <AddCompetitorCard
          projectId={projectId}
          onDone={() => void props.refetchCompetitors()}
        />
      </section>

      <CompetitionContentSourcesPanel
        projectId={projectId}
        competitors={competitors}
      />
    </div>
  )
}
