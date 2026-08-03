"use client"

import React, { useState, useCallback, useEffect, useMemo, useRef } from 'react'
import { Button } from '../../app/components/ui/button'
import { Input } from '../../app/components/ui/input'
import { Check, AlertCircle, Info, Star, X, ChevronDown, ChevronRight, Loader2, Globe2 } from 'lucide-react'
import { AddDashedButton } from '../../app/components/ui/add-dashed-button'
import { SeoKeywordResearchInline } from './components/seo-keyword-research-inline'
import { toast } from '../../app/components/ui/use-toast'
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs'
import debounce from 'lodash.debounce'
import { calculateKeywordDensity, countKeywordOccurrences, extractPlainText, getDensityColor } from './utils/keyword-density'
import { CTTVariantSEO } from './hooks/use-ctt-variant-seo'
import type { TaskChannelBootstrapSeo } from '../../app/lib/types/task-channel-bootstrap'
import type { CompetitorPageType, SnapshotCompetitorStructure } from '../../app/lib/types/seo-competitor-snapshot'
import { deriveKeywordsFromBootstrapSeo } from '../../app/lib/types/seo-competitor-snapshot'
import { regions } from '../../app/lib/geoLanguageMaps'
import { useSeoCompetitorSnapshot } from './hooks/use-seo-competitor-snapshot'
import { useKeywordIdeasMetrics } from './hooks/use-keyword-ideas-metrics'
import { Popover, PopoverContent, PopoverTrigger } from '../../app/components/ui/popover'
import { IconTooltip } from '../../app/components/ui/icon-tooltip'
import { useCurrentUserStore } from '../../app/store/current-user'
import { KeywordMetricSeparator, KeywordMetricStat } from './components/keyword-metric-stat'

interface SEOPanelProps {
  variantSEO: CTTVariantSEO | null | undefined
  isLoading: boolean
  onUpdateKeywords: (payload: { primaryKeyword: string; secondaryKeywords: string; seoRequiredOverride?: boolean | null }) => Promise<void>
  onToggleSEORequired: (seoRequired: boolean) => Promise<void>
  isUpdatingKeywords: boolean
  isTogglingSEO: boolean
  cttId: string | null
  channelId: number | null
  languageId: number | null
  variantId?: string | null
  variantBriefingTypeId?: number | null
  taskId?: number | null // For task channel SEO
  /** When provided (task channel), use for density instead of fetching; same content as Component Output fields */
  componentOutputTexts?: string[]
  /** Raw bootstrap SEO payload for task-channel mode. */
  taskChannelSeo?: TaskChannelBootstrapSeo | null
  /** Optional controlled selected keyword (task channel). */
  selectedKeyword?: string | null
  onSelectedKeywordChange?: (keyword: string | null) => void
}

const SEO_REGION_OPTIONS: Array<{ value: number; label: string }> = [
  { value: 0, label: "All countries" },
  ...regions
    .map((region) => {
      const parsedId = Number(region.id)
      if (!Number.isFinite(parsedId)) return null
      if (region.name.trim().toLowerCase() === "any") return null
      return { value: parsedId, label: region.name }
    })
    .filter((region): region is { value: number; label: string } => region !== null),
]

const DEFAULT_SEO_REGION_ID = 0

type SuggestedKeyword = {
  keyword: string
  volume?: number | null
  competitionIndex?: number | null
  source?: string | null
}

function normalizeKeywordValue(value: string): string {
  return value.trim().toLowerCase()
}

/** Parse persisted secondary keywords which may be stored as a string[] or a comma-separated string. */
function parseSecondaryKeywords(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.map((item) => String(item).trim()).filter(Boolean)
  }
  if (typeof value === "string") {
    return value.split(',').map((item) => item.trim()).filter(Boolean)
  }
  return []
}

function getDomainFromUrl(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return url
  }
}

function getFaviconUrl(url: string): string | null {
  try {
    const hostname = new URL(url).hostname
    if (!hostname) return null
    return `https://www.google.com/s2/favicons?domain=${encodeURIComponent(hostname)}&sz=32`
  } catch {
    return null
  }
}

type CompetitorStructureProps = {
  structure: SnapshotCompetitorStructure | null
  isLoading: boolean
  error: string | null
  hasTriedFallback: boolean
}

function CompetitorStructure({ structure, isLoading, error, hasTriedFallback }: CompetitorStructureProps) {
  const outlineRows = (structure?.flatHeadings ?? []).filter((row) => row.text?.trim().length > 0)
  if (structure?.error === 'unsupported_site') {
    return <p className="text-xs text-amber-600">Structure not available for this site</p>
  }
  if (structure?.error) {
    return <p className="text-xs text-amber-600">{structure.error}</p>
  }
  if (error) {
    return <p className="text-xs text-red-600">{error}</p>
  }
  if (isLoading) {
    return (
      <div className="flex items-center gap-2 text-xs text-gray-500">
        <Loader2 className="h-3.5 w-3.5 animate-spin text-gray-400" />
        Analyzing structure...
      </div>
    )
  }
  if (!structure && hasTriedFallback) {
    return <p className="text-xs text-gray-500">No structure available</p>
  }
  if (!structure) {
    return <p className="text-xs text-gray-500">Analyzing structure...</p>
  }
  if (outlineRows.length === 0) {
    return <p className="text-xs text-gray-500">No heading structure available for this page.</p>
  }
  return (
    <div className="space-y-1">
      {outlineRows.map((row, index) => (
        <div
          key={`${row.tag}-${index}-${row.text}`}
          className={`flex items-start gap-2 ${row.level === 2 ? 'pl-3' : row.level === 3 ? 'pl-6' : 'pl-0'}`}
        >
          <span className="mt-0.5 inline-flex min-w-7 items-center justify-center rounded border border-gray-200 bg-gray-100 px-1 text-[10px] font-semibold text-gray-600">
            H{row.level}
          </span>
          <p className={`min-w-0 flex-1 truncate ${row.level === 1 ? 'text-xs font-semibold text-gray-900' : row.level === 2 ? 'text-xs text-gray-800' : 'text-[11px] text-gray-500'}`}>
            {row.text}
          </p>
        </div>
      ))}
    </div>
  )
}

export function SEOPanel({ 
  variantSEO, 
  isLoading, 
  onUpdateKeywords, 
  onToggleSEORequired,
  isUpdatingKeywords,
  isTogglingSEO,
  cttId, 
  channelId, 
  languageId,
  variantId,
  variantBriefingTypeId,
  taskId,
  componentOutputTexts,
  taskChannelSeo,
  selectedKeyword: controlledSelectedKeyword,
  onSelectedKeywordChange,
}: SEOPanelProps) {
  // Use seo_required and seo_source from variantSEO (from merged view v_ctt_variant_seo_full)
  // No need for separate flags query - it's all included in variantSEO now
  
  const [primaryKeyword, setPrimaryKeyword] = useState('')
  const [secondaryKeywords, setSecondaryKeywords] = useState('')
  const [newKeywordValue, setNewKeywordValue] = useState('')
  const [internalSelectedKeyword, setInternalSelectedKeyword] = useState<string | null>(null)
  const isSelectedKeywordControlled = controlledSelectedKeyword !== undefined
  const selectedKeyword = isSelectedKeywordControlled ? (controlledSelectedKeyword ?? null) : internalSelectedKeyword
  const setSelectedKeyword = useCallback((value: string | null | ((prev: string | null) => string | null)) => {
    const next = typeof value === "function"
      ? value(isSelectedKeywordControlled ? (controlledSelectedKeyword ?? null) : internalSelectedKeyword)
      : value
    if (isSelectedKeywordControlled) {
      onSelectedKeywordChange?.(next)
      return
    }
    setInternalSelectedKeyword(next)
  }, [controlledSelectedKeyword, internalSelectedKeyword, isSelectedKeywordControlled, onSelectedKeywordChange])
  const [isEditingSelectedKeyword, setIsEditingSelectedKeyword] = useState(false)
  const [editingKeywordValue, setEditingKeywordValue] = useState('')
  const [editingOriginalValue, setEditingOriginalValue] = useState('')
  const [isCountryDropdownOpen, setIsCountryDropdownOpen] = useState(false)
  const [expandedTopResultsKeyword, setExpandedTopResultsKeyword] = useState<string | null>(null)
  const [expandedCompetitorByKeyword, setExpandedCompetitorByKeyword] = useState<Record<string, number | null>>({})
  const [seoRegionId, setSeoRegionId] = useState<number>(DEFAULT_SEO_REGION_ID)
  const [isSavingSeoRegion, setIsSavingSeoRegion] = useState(false)
  const [taskChannelSeoConfig, setTaskChannelSeoConfig] = useState<{
    primaryKeyword: string
    secondaryKeywords: string[]
    regionId: number | null
    seoRequiredOverride: boolean | null
  } | null>(null)
  const hasSeededTaskChannelConfigRef = useRef(false)
  const currentPublicUserId = useCurrentUserStore((state) => state.publicUserId)
  const [taskLanguageName, setTaskLanguageName] = useState<string | null>(null)
  const [taskLanguageCode, setTaskLanguageCode] = useState<string | null>(null)
  const [isKeywordSuggestionsOpen, setIsKeywordSuggestionsOpen] = useState(false)
  const [addKeywordMode, setAddKeywordMode] = useState<'type' | 'research'>('type')
  const [isLoadingKeywordSuggestions, setIsLoadingKeywordSuggestions] = useState(false)
  const [suggestedKeywords, setSuggestedKeywords] = useState<SuggestedKeyword[]>([])
  const [hasLoadedKeywordSuggestions, setHasLoadedKeywordSuggestions] = useState(false)
  const [countrySearchQuery, setCountrySearchQuery] = useState("")
  const loadKeywordCompetitorsRef = useRef<
    ((keyword: string, options?: { forceRefresh?: boolean; triggerPrefetch?: boolean; triggerSource?: "keyword_add" | "manual_refresh" | null }) => Promise<void>) | null
  >(null)
  const keywordTableRef = useRef<HTMLDivElement | null>(null)
  const addKeywordInputRef = useRef<HTMLInputElement | null>(null)
  const countryPopoverContentRef = useRef<HTMLDivElement | null>(null)
  const hasInitializedTaskChannelKeywordsRef = useRef(false)
  const supabase = useMemo(() => createClientComponentClient(), [])
  
  // Fetch all component outputs for this variation to calculate keyword density
  const [componentOutputs, setComponentOutputs] = useState<string[]>([])
  const [isLoadingContent, setIsLoadingContent] = useState(false)
  const clearComponentOutputs = useCallback(() => {
    setComponentOutputs((prev) => (prev.length === 0 ? prev : []))
  }, [])
  
  useEffect(() => {
    const loadComponentOutputs = async () => {
      // Task SEO is artifact-based now — never query deprecated task_component_outputs.
      if (taskId && channelId && !cttId) {
        clearComponentOutputs()
        setIsLoadingContent(false)
        return
      }

      // For CTT variants (original behavior)
      if (!cttId || languageId === null) {
        clearComponentOutputs()
        return
      }
      
      setIsLoadingContent(true)
      try {
        // If variant has a briefing type, fetch outputs from variant-specific components
        if (variantId && variantBriefingTypeId) {
          // Get variant components
          const { data: variantComponents, error: variantComponentsError } = await supabase.rpc('briefing_components_for_variant', {
            p_variant_id: variantId,
          })
          
          if (variantComponentsError) throw variantComponentsError
          
          // Get component IDs that are selected for this variant
          const selectedComponentIds = (variantComponents || [])
            .filter((comp: any) => comp.selected)
            .map((comp: any) => comp.component_id)
          
          if (selectedComponentIds.length === 0) {
            clearComponentOutputs()
            setIsLoadingContent(false)
            return
          }
          
          // Fetch outputs for variant's selected components
          let query = supabase
            .from('content_types_tasks_component_outputs')
            .select('content_html, content_text')
            .eq('ctt_id', cttId)
            .eq('language_id', languageId)
            .in('briefing_component_id', selectedComponentIds)
          
          if (channelId === null) {
            query = query.is('channel_id', null)
          } else {
            query = query.eq('channel_id', channelId)
          }
          
          const { data, error } = await query
          
          if (error) throw error
          
          const texts = (data || []).map(item => item.content_html || item.content_text || '').filter(Boolean)
          setComponentOutputs(texts)
        } else {
          // Fall back to CTT-level component outputs (old behavior)
          let query = supabase
            .from('content_types_tasks_component_outputs')
            .select('content_html, content_text')
            .eq('ctt_id', cttId)
            .eq('language_id', languageId)
          
          if (channelId === null) {
            query = query.is('channel_id', null)
          } else {
            query = query.eq('channel_id', channelId)
          }
          
          const { data, error } = await query
          
          if (error) throw error
          
          const texts = (data || []).map(item => item.content_html || item.content_text || '').filter(Boolean)
          setComponentOutputs(texts)
        }
      } catch (err: any) {
        console.error('Failed to load component outputs for density:', err)
        clearComponentOutputs()
      } finally {
        setIsLoadingContent(false)
      }
    }
    
    loadComponentOutputs()
  }, [cttId, channelId, languageId, variantId, variantBriefingTypeId, taskId, componentOutputTexts, supabase, clearComponentOutputs])

  // Immediately clear all task-channel SEO UI state when the task or channel changes, before the
  // async reads below complete. This prevents the previous channel's keywords/metrics/competitors
  // from lingering when switching to a channel that has no SEO config. Runs before the seeding
  // effects so a fresh channel's data is re-applied afterwards. (Competitor/top-result state lives
  // in useSeoCompetitorSnapshot and self-resets on the same task/channel change; keyword metrics
  // clear reactively once the keyword list empties.)
  useEffect(() => {
    if (cttId || !taskId || !channelId) return
    setPrimaryKeyword('')
    setSecondaryKeywords('')
    setSelectedKeyword(null)
    setSeoRegionId(DEFAULT_SEO_REGION_ID)
    setTaskChannelSeoConfig(null)
    setExpandedCompetitorByKeyword({})
    setExpandedTopResultsKeyword(null)
    setSuggestedKeywords([])
    setHasLoadedKeywordSuggestions(false)
    setNewKeywordValue('')
    setIsKeywordSuggestionsOpen(false)
    primaryKeywordRef.current = ''
    secondaryKeywordsRef.current = ''
    lastSyncedSeoDataRef.current = null
    pendingKeywordPersistenceRef.current = null
    hasSeededTaskChannelConfigRef.current = false
    hasInitializedTaskChannelKeywordsRef.current = false
  }, [taskId, channelId, cttId])

  // Load the full task-channel SEO config (not only region_id) so the keyword form state and
  // competitor snapshot work even when the task-channel bootstrap payload did not include SEO data.
  useEffect(() => {
    if (!taskId || !channelId || cttId) return
    let isCancelled = false
    const loadTaskChannelSeoConfig = async () => {
      const { data, error } = await supabase
        .from("task_channel_seo")
        .select("seo_required_override, primary_keyword, secondary_keywords, region_id")
        .eq("task_id", taskId)
        .eq("channel_id", channelId)
        .maybeSingle()
      if (isCancelled) return
      if (error) {
        console.error("Failed to load task channel SEO config:", error)
        return
      }

      // No SEO config for this channel: keep the SEO state empty and never reuse the
      // bootstrap or previous-channel keyword/region values.
      if (!data) {
        setSeoRegionId(DEFAULT_SEO_REGION_ID)
        setTaskChannelSeoConfig(null)
        setPrimaryKeyword('')
        setSecondaryKeywords('')
        setSelectedKeyword(null)
        primaryKeywordRef.current = ''
        secondaryKeywordsRef.current = ''
        hasSeededTaskChannelConfigRef.current = true
        return
      }

      const loadedRegionId = typeof data?.region_id === "number" && Number.isFinite(data.region_id)
        ? data.region_id
        : null
      const hasMatchingRegion = loadedRegionId != null
        && SEO_REGION_OPTIONS.some((option) => option.value === loadedRegionId)
      setSeoRegionId(hasMatchingRegion ? loadedRegionId : DEFAULT_SEO_REGION_ID)

      const loadedPrimary = typeof data?.primary_keyword === "string" ? data.primary_keyword.trim() : ""
      const loadedSecondary = parseSecondaryKeywords(data?.secondary_keywords)
      setTaskChannelSeoConfig({
        primaryKeyword: loadedPrimary,
        secondaryKeywords: loadedSecondary,
        regionId: loadedRegionId,
        seoRequiredOverride: typeof data?.seo_required_override === "boolean" ? data.seo_required_override : null,
      })

      // Seed keyword form state from the persisted config when nothing has been entered yet. This
      // covers task channels whose bootstrap payload did not include SEO keywords; never clobber
      // in-progress edits or an in-flight keyword add.
      if (
        !hasSeededTaskChannelConfigRef.current
        && !isUserTypingRef.current
        && !isKeywordAddInFlightRef.current
        && !primaryKeywordRef.current.trim()
        && !secondaryKeywordsRef.current.trim()
        && (loadedPrimary || loadedSecondary.length > 0)
      ) {
        const nextPrimary = loadedPrimary
        const nextSecondary = loadedSecondary.join(", ")
        setPrimaryKeyword(nextPrimary)
        setSecondaryKeywords(nextSecondary)
        primaryKeywordRef.current = nextPrimary
        secondaryKeywordsRef.current = nextSecondary
        hasInitializedTaskChannelKeywordsRef.current = true
      }
      hasSeededTaskChannelConfigRef.current = true
    }
    void loadTaskChannelSeoConfig()
    return () => {
      isCancelled = true
    }
  }, [taskId, channelId, cttId, supabase])

  useEffect(() => {
    if (languageId == null) {
      setTaskLanguageName(null)
      setTaskLanguageCode(null)
      return
    }
    let isCancelled = false
    const loadTaskLanguage = async () => {
      const { data, error } = await supabase
        .from("languages")
        .select("long_name, code")
        .eq("id", languageId)
        .maybeSingle()
      if (isCancelled) return
      if (error) {
        console.error("Failed to load task language:", error)
        return
      }
      const nextLanguage = (typeof data?.long_name === "string" && data.long_name.trim().length > 0)
        ? data.long_name
        : (typeof data?.code === "string" && data.code.trim().length > 0 ? data.code : null)
      const nextLanguageCode = (typeof data?.code === "string" && data.code.trim().length > 0)
        ? data.code
        : null
      setTaskLanguageName(nextLanguage)
      setTaskLanguageCode(nextLanguageCode)
    }
    void loadTaskLanguage()
    return () => {
      isCancelled = true
    }
  }, [languageId, supabase])

  // Use parent-provided outputs when available (task channel); otherwise use fetched componentOutputs
  const effectiveOutputTexts = (taskId && channelId && !cttId && componentOutputTexts != null)
    ? componentOutputTexts
    : componentOutputs

  // Calculate combined text from all component outputs (strip markup, join with space)
  const combinedText = React.useMemo(() => {
    return effectiveOutputTexts.map(extractPlainText).join(' ')
  }, [effectiveOutputTexts])
  
  // Parse secondary keywords
  const secondaryKeywordsArray = React.useMemo(() => {
    if (!secondaryKeywords) return []
    return secondaryKeywords.split(',').map(k => k.trim()).filter(k => k)
  }, [secondaryKeywords])

  const isTaskChannel = !cttId && !!taskId
  const inferredTaskLanguage = useMemo(() => taskLanguageCode ?? taskLanguageName ?? null, [taskLanguageCode, taskLanguageName])
  const bootstrapRegionId = useMemo(() => {
    if (!taskChannelSeo || typeof taskChannelSeo !== "object") return null
    const maybeRegionId = (taskChannelSeo as Record<string, unknown>).region_id
    return typeof maybeRegionId === "number" && Number.isFinite(maybeRegionId) ? maybeRegionId : null
  }, [taskChannelSeo])
  const {
    getKeywordMetric,
    fetchKeywordMetricsForKeyword,
    hydrateKeywordMetricsFromDb,
    syncKeywordKeys: syncKeywordMetricKeys,
  } = useKeywordIdeasMetrics({
    inferredTaskLanguage,
    regionId: isTaskChannel ? (bootstrapRegionId ?? seoRegionId) : null,
    taskId: isTaskChannel ? (taskId ?? null) : null,
    channelId: isTaskChannel ? (channelId ?? null) : null,
    userId: currentPublicUserId,
  })
  
  // Calculate densities
  const primaryDensity = React.useMemo(() => 
    primaryKeyword ? calculateKeywordDensity(combinedText, primaryKeyword) : 0,
    [combinedText, primaryKeyword]
  )
  
  const secondaryDensities = React.useMemo(() => 
    secondaryKeywordsArray.map(keyword => ({
      keyword,
      density: calculateKeywordDensity(combinedText, keyword)
    })),
    [combinedText, secondaryKeywordsArray]
  )
  const currentKeywordsSet = useMemo(() => {
    return new Set(
      [primaryKeyword.trim(), ...secondaryKeywordsArray]
        .filter(Boolean)
        .map((keyword) => normalizeKeywordValue(keyword)),
    )
  }, [primaryKeyword, secondaryKeywordsArray])
  
  const isUserTypingRef = useRef(false)
  const lastSyncedSeoDataRef = useRef<string | null>(null)
  const pendingKeywordPersistenceRef = useRef<string | null>(null)
  const isSeoHydratedRef = useRef(false)
  const isKeywordAddInFlightRef = useRef(false)
  const isTaskChannelRef = useRef(isTaskChannel)
  
  // Use refs to store latest values - updated immediately on change
  const primaryKeywordRef = useRef(primaryKeyword)
  const secondaryKeywordsRef = useRef(secondaryKeywords)
  const onUpdateKeywordsRef = useRef(onUpdateKeywords)
  
  // Keep refs in sync with state
  useEffect(() => {
    primaryKeywordRef.current = primaryKeyword
  }, [primaryKeyword])
  
  useEffect(() => {
    secondaryKeywordsRef.current = secondaryKeywords
  }, [secondaryKeywords])
  
  // Sync local state with variantSEO prop (only when data changes, not when user is typing)
  useEffect(() => {
    if (!variantSEO || isUserTypingRef.current || isKeywordAddInFlightRef.current) return
    
    // Create a key to track if variantSEO actually changed
    const seoDataKey = `${variantSEO.primary_keyword || ''}|${JSON.stringify(variantSEO.secondary_keywords)}`
    
    // Only sync if data changed
    if (seoDataKey !== lastSyncedSeoDataRef.current) {
      const newPrimary = variantSEO.primary_keyword || ''
      const secondaryStr = Array.isArray(variantSEO.secondary_keywords)
        ? variantSEO.secondary_keywords.join(', ')
        : (typeof variantSEO.secondary_keywords === 'string' ? variantSEO.secondary_keywords : '')

      // In task-channel mode, ignore payloads that belong to a different channel so a stale
      // variantSEO from the previously selected channel never bleeds into the current one.
      if (isTaskChannelRef.current && channelId != null && variantSEO.channel_id != null && variantSEO.channel_id !== channelId) {
        return
      }

      // In task-channel mode the bootstrap SEO may not carry the persisted keywords; never let an
      // empty payload clobber keywords seeded from the task_channel_seo DB config.
      if (isTaskChannelRef.current && !newPrimary.trim() && !secondaryStr.trim()) {
        return
      }

      setPrimaryKeyword(newPrimary)
      setSecondaryKeywords(secondaryStr)
      
      // Also update refs immediately
      primaryKeywordRef.current = newPrimary
      secondaryKeywordsRef.current = secondaryStr
      
      lastSyncedSeoDataRef.current = seoDataKey
    }
  }, [variantSEO])

  useEffect(() => {
    if (!isTaskChannel) {
      hasInitializedTaskChannelKeywordsRef.current = false
      return
    }
    if (isKeywordAddInFlightRef.current) return
    if (hasInitializedTaskChannelKeywordsRef.current) return
    const initialKeywords = deriveKeywordsFromBootstrapSeo(taskChannelSeo ?? null)
    if (initialKeywords.length === 0) {
      hasInitializedTaskChannelKeywordsRef.current = true
      return
    }
    const [firstKeyword, ...otherKeywords] = initialKeywords
    const nextPrimary = firstKeyword ?? ""
    const nextSecondary = otherKeywords.join(", ")
    setPrimaryKeyword(nextPrimary)
    setSecondaryKeywords(nextSecondary)
    primaryKeywordRef.current = nextPrimary
    secondaryKeywordsRef.current = nextSecondary
    hasInitializedTaskChannelKeywordsRef.current = true
  }, [isTaskChannel, taskChannelSeo])

  useEffect(() => {
    hasInitializedTaskChannelKeywordsRef.current = false
  }, [taskId, channelId])
  
  // Keep callback ref updated
  useEffect(() => {
    onUpdateKeywordsRef.current = onUpdateKeywords
  }, [onUpdateKeywords])

  useEffect(() => {
    isTaskChannelRef.current = isTaskChannel
  }, [isTaskChannel])

  useEffect(() => {
    isSeoHydratedRef.current = false
  }, [taskId, channelId, cttId, languageId])

  useEffect(() => {
    if (isLoading) return
    if (variantSEO !== undefined) {
      isSeoHydratedRef.current = true
    }
  }, [isLoading, variantSEO])

  // Debounced update function - reads from refs to get latest values
  const debouncedUpdateSEORef = useRef(
    debounce(() => {
      if (!isSeoHydratedRef.current) return
      if (isKeywordAddInFlightRef.current) return
      const primary = primaryKeywordRef.current
      const secondary = secondaryKeywordsRef.current
      if (isTaskChannelRef.current && !primary.trim() && !secondary.trim()) return
      console.log('=== Debounced update triggered ===')
      console.log('Reading from refs:', { 
        primary, 
        secondary,
        primaryType: typeof primary,
        secondaryType: typeof secondary,
        primaryLength: primary?.length,
        secondaryLength: secondary?.length
      })
      // The mutation expects an object { primaryKeyword, secondaryKeywords }
      const payload = { primaryKeyword: primary, secondaryKeywords: secondary }
      console.log('Calling onUpdateKeywordsRef.current with payload:', payload)
      if (onUpdateKeywordsRef.current) {
        onUpdateKeywordsRef.current(payload).catch(err => {
          console.error('Failed to update keywords:', err)
          toast({
            title: 'Error',
            description: 'Failed to save keywords',
            variant: 'destructive'
          })
        })
      } else {
        console.error('onUpdateKeywordsRef.current is null/undefined!')
      }
    }, 700)
  )

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      debouncedUpdateSEORef.current.cancel()
    }
  }, [])

  // Handle primary keyword change
  const handlePrimaryKeywordChange = useCallback((value: string) => {
    console.log('handlePrimaryKeywordChange called with value:', value)
    isUserTypingRef.current = true
    setPrimaryKeyword(value)
    // Update ref immediately so debounced function always has latest value
    primaryKeywordRef.current = value
    console.log('Updated primaryKeywordRef.current to:', primaryKeywordRef.current)
    // Trigger debounced update - it will read latest values from refs
    debouncedUpdateSEORef.current()
    // Reset typing flag after debounce delay
    setTimeout(() => {
      isUserTypingRef.current = false
    }, 800)
  }, [])

  // Handle secondary keywords change
  const handleSecondaryKeywordsChange = useCallback((value: string) => {
    isUserTypingRef.current = true
    setSecondaryKeywords(value)
    // Update ref immediately so debounced function always has latest value
    secondaryKeywordsRef.current = value
    // Trigger debounced update - it will read latest values from refs
    debouncedUpdateSEORef.current()
    // Reset typing flag after debounce delay
    setTimeout(() => {
      isUserTypingRef.current = false
    }, 800)
  }, [])

  const addKeywordAndRunAnalysis = useCallback(async (keywordInput: string): Promise<boolean> => {
    const nextKeyword = keywordInput.trim()
    if (!nextKeyword) return false
    const normalizedNextKeyword = normalizeKeywordValue(nextKeyword)
    const alreadyExists = currentKeywordsSet.has(normalizedNextKeyword)
    if (alreadyExists) return false

    const previousPrimary = primaryKeyword
    const previousSecondary = secondaryKeywords
    const previousSelectedKeyword = selectedKeyword
    const hadNone = !primaryKeyword.trim() && !secondaryKeywords.trim()

    const optimisticPrimary = !primaryKeyword.trim() ? nextKeyword : primaryKeyword
    const optimisticSecondary = !primaryKeyword.trim()
      ? secondaryKeywords
      : (secondaryKeywords ? `${secondaryKeywords}, ${nextKeyword}` : nextKeyword)

    isUserTypingRef.current = true
    pendingKeywordPersistenceRef.current = normalizedNextKeyword
    setPrimaryKeyword(optimisticPrimary)
    setSecondaryKeywords(optimisticSecondary)
    primaryKeywordRef.current = optimisticPrimary
    secondaryKeywordsRef.current = optimisticSecondary
    setSelectedKeyword(nextKeyword)

    try {
      isKeywordAddInFlightRef.current = true
      debouncedUpdateSEORef.current.cancel()
      await onUpdateKeywordsRef.current({
        primaryKeyword: optimisticPrimary,
        secondaryKeywords: optimisticSecondary,
        seoRequiredOverride: hadNone ? true : undefined,
      })

      pendingKeywordPersistenceRef.current = null
      setSelectedKeyword(nextKeyword)

      if (isTaskChannel) {
        await fetchKeywordMetricsForKeyword(nextKeyword)
        await loadKeywordCompetitorsRef.current?.(nextKeyword, {
          forceRefresh: true,
          triggerPrefetch: true,
          triggerSource: "keyword_add",
        })
      }

      return true
    } catch (error) {
      pendingKeywordPersistenceRef.current = null
      setPrimaryKeyword(previousPrimary)
      setSecondaryKeywords(previousSecondary)
      primaryKeywordRef.current = previousPrimary
      secondaryKeywordsRef.current = previousSecondary
      setSelectedKeyword(previousSelectedKeyword ?? null)
      toast({
        title: "Keyword add failed",
        description: error instanceof Error ? error.message : "Please try again.",
        variant: "destructive",
      })
      return false
    } finally {
      isKeywordAddInFlightRef.current = false
      setTimeout(() => { isUserTypingRef.current = false }, 800)
    }
  }, [
    currentKeywordsSet,
    primaryKeyword,
    secondaryKeywords,
    selectedKeyword,
    isTaskChannel,
    fetchKeywordMetricsForKeyword,
  ])

  // Add keyword (append to secondary or set as primary if none) with strict persistence-before-analysis ordering.
  const handleAddKeyword = useCallback(async (keywordInput?: string) => {
    const sourceValue = typeof keywordInput === 'string' ? keywordInput : newKeywordValue
    const wasAdded = await addKeywordAndRunAnalysis(sourceValue)
    if (!wasAdded) return false
    setNewKeywordValue('')
    setIsKeywordSuggestionsOpen(false)
    setIsCountryDropdownOpen(false)
    return true
  }, [newKeywordValue, addKeywordAndRunAnalysis])

  // Make a keyword the primary (default); reuses existing save path
  const handleMakeDefaultKeyword = useCallback((keyword: string) => {
    const currentPrimary = primaryKeyword.trim()
    const secondaries = secondaryKeywordsArray
    if (currentPrimary === keyword) return
    const rest = [currentPrimary, ...secondaries].filter((k) => k && k !== keyword)
    isUserTypingRef.current = true
    setPrimaryKeyword(keyword)
    setSecondaryKeywords(rest.join(', '))
    primaryKeywordRef.current = keyword
    secondaryKeywordsRef.current = rest.join(', ')
    debouncedUpdateSEORef.current()
    setTimeout(() => { isUserTypingRef.current = false }, 800)
  }, [primaryKeyword, secondaryKeywords, secondaryKeywordsArray])

  // Remove a keyword; if none left, turn SEO off
  const handleRemoveKeyword = useCallback((keyword: string) => {
    const previousPrimary = primaryKeyword
    const previousSecondary = secondaryKeywords
    const primary = primaryKeyword.trim()
    const secondaries = secondaryKeywordsArray
    const rest = [primary, ...secondaries].filter((k) => k && k !== keyword)
    const newPrimary = rest[0] ?? ''
    const newSecondary = rest.slice(1).join(', ')
    isUserTypingRef.current = true
    setPrimaryKeyword(newPrimary)
    setSecondaryKeywords(newSecondary)
    primaryKeywordRef.current = newPrimary
    secondaryKeywordsRef.current = newSecondary
    if (selectedKeyword === keyword) {
      setSelectedKeyword(newPrimary || (rest[1] ?? null))
    }
    debouncedUpdateSEORef.current.cancel()
    void onUpdateKeywordsRef.current({
      primaryKeyword: newPrimary,
      secondaryKeywords: newSecondary,
    })
      .then(() => {
        if (rest.length === 0) {
          return onToggleSEORequired(false)
        }
        return undefined
      })
      .catch((error) => {
        setPrimaryKeyword(previousPrimary)
        setSecondaryKeywords(previousSecondary)
        primaryKeywordRef.current = previousPrimary
        secondaryKeywordsRef.current = previousSecondary
        setSelectedKeyword((current) => current ?? keyword)
        toast({
          title: "Keyword removal failed",
          description: error instanceof Error ? error.message : "Please try again.",
        })
      })
    setTimeout(() => { isUserTypingRef.current = false }, 800)
  }, [primaryKeyword, secondaryKeywords, secondaryKeywordsArray, selectedKeyword, onToggleSEORequired])

  // Replace a keyword (edit); keep primary/secondary order
  const handleEditKeyword = useCallback((oldKeyword: string, newKeyword: string) => {
    const k = newKeyword.trim()
    if (!k || k === oldKeyword) return
    const primary = primaryKeyword.trim()
    const secondaries = secondaryKeywordsArray
    const list = [primary, ...secondaries]
    const idx = list.findIndex((x) => x === oldKeyword)
    if (idx < 0) return
    list[idx] = k
    const newPrimary = list[0] ?? ''
    const newSecondary = list.slice(1).join(', ')
    isUserTypingRef.current = true
    setPrimaryKeyword(newPrimary)
    setSecondaryKeywords(newSecondary)
    primaryKeywordRef.current = newPrimary
    secondaryKeywordsRef.current = newSecondary
    debouncedUpdateSEORef.current()
    setTimeout(() => { isUserTypingRef.current = false }, 800)
  }, [primaryKeyword, secondaryKeywords, secondaryKeywordsArray])

  const commitKeywordEdit = useCallback((oldKeyword: string, nextKeywordInput: string) => {
    const originalTrimmed = oldKeyword.trim()
    const nextKeyword = nextKeywordInput.trim()
    const normalizedOriginal = normalizeKeywordValue(originalTrimmed)
    const normalizedNext = normalizeKeywordValue(nextKeyword)

    if (!nextKeyword || normalizedNext === normalizedOriginal) {
      setEditingKeywordValue(oldKeyword)
      setIsEditingSelectedKeyword(false)
      return
    }

    const isDuplicate = currentKeywordsSet.has(normalizedNext) && normalizedNext !== normalizedOriginal
    if (isDuplicate) {
      setEditingKeywordValue(oldKeyword)
      setIsEditingSelectedKeyword(false)
      return
    }

    handleEditKeyword(oldKeyword, nextKeyword)
    if (selectedKeyword === oldKeyword) {
      setSelectedKeyword(nextKeyword)
    }
    if (isTaskChannel) {
      void fetchKeywordMetricsForKeyword(nextKeyword)
      void loadKeywordCompetitorsRef.current?.(nextKeyword, {
        forceRefresh: true,
        triggerPrefetch: true,
        triggerSource: "keyword_add",
      })
    }
    setEditingKeywordValue(nextKeyword)
    setIsEditingSelectedKeyword(false)
  }, [currentKeywordsSet, handleEditKeyword, selectedKeyword, isTaskChannel, fetchKeywordMetricsForKeyword])
  // For task channels, always show (don't require languageId check)
  // For CTT variants, require languageId
  const competitorSnapshotKeywords = useMemo(() => {
    const primary = primaryKeyword.trim()
    const merged = [primary, ...secondaryKeywordsArray].filter(Boolean)
    const seen = new Set<string>()
    const deduped: string[] = []
    for (const keyword of merged) {
      const key = keyword.toLowerCase()
      if (seen.has(key)) continue
      seen.add(key)
      deduped.push(keyword)
    }
    return deduped
  }, [primaryKeyword, secondaryKeywordsArray])
  const bootstrapSnapshotKeywords = useMemo(
    () => deriveKeywordsFromBootstrapSeo(taskChannelSeo ?? null),
    [taskChannelSeo],
  )
  // Persisted SEO keywords sourced from the DB config (task_channel_seo). Used as the source of
  // truth for the competitor snapshot so cached competitors load even when the bootstrap payload
  // had no SEO data. Falls back to the bootstrap-derived keywords when the DB config is unavailable.
  const persistedSnapshotKeywords = useMemo(() => {
    const fromConfig = taskChannelSeoConfig
      ? [taskChannelSeoConfig.primaryKeyword, ...taskChannelSeoConfig.secondaryKeywords].filter(Boolean)
      : []
    const source = fromConfig.length > 0 ? fromConfig : bootstrapSnapshotKeywords
    const seen = new Set<string>()
    const deduped: string[] = []
    for (const keyword of source) {
      const key = keyword.trim().toLowerCase()
      if (!key || seen.has(key)) continue
      seen.add(key)
      deduped.push(keyword.trim())
    }
    return deduped
  }, [taskChannelSeoConfig, bootstrapSnapshotKeywords])
  const selectedCountryByKeyword = useMemo(() => {
    const map: Record<string, string | number | null | undefined> = {}
    for (const keyword of competitorSnapshotKeywords) {
      map[keyword] = seoRegionId > 0 ? seoRegionId : null
    }
    return map
  }, [competitorSnapshotKeywords, seoRegionId])

  const refreshKeywordMetricsForKeywords = useCallback(
    async (keywords: string[], options?: { regionIdOverride?: number | null }) => {
      const normalized = Array.from(
        new Set(
          keywords
            .map((keyword) => keyword.trim())
            .filter(Boolean),
        ),
      )
      if (normalized.length === 0) return
      for (const keyword of normalized) {
        await fetchKeywordMetricsForKeyword(keyword, options)
      }
    },
    [fetchKeywordMetricsForKeyword],
  )
  const {
    isLoadingSnapshot,
    snapshotError,
    normalizedKeywords: snapshotKeywords,
    getKeywordState,
    loadKeywordCompetitors,
    startBackgroundPrefetch,
  } = useSeoCompetitorSnapshot({
    taskId: isTaskChannel ? (taskId ?? null) : null,
    channelId: isTaskChannel ? channelId : null,
    taskLanguage: taskLanguageName,
    keywords: competitorSnapshotKeywords,
    bootstrapKeywords: isTaskChannel ? persistedSnapshotKeywords : undefined,
    selectedCountryByKeyword,
    autoLoadOnKeywordAdd: false,
  })

  useEffect(() => {
    loadKeywordCompetitorsRef.current = loadKeywordCompetitors
  }, [loadKeywordCompetitors])

  useEffect(() => {
    setExpandedCompetitorByKeyword((prev) => {
      const next: Record<string, number | null> = {}
      for (const keyword of competitorSnapshotKeywords) {
        next[keyword] = prev[keyword] ?? null
      }
      return next
    })
  }, [competitorSnapshotKeywords])

  useEffect(() => {
    const allKeywords = competitorSnapshotKeywords
    syncKeywordMetricKeys(allKeywords)
  }, [competitorSnapshotKeywords, syncKeywordMetricKeys])

  useEffect(() => {
    if (!isTaskChannel) return
    if (competitorSnapshotKeywords.length === 0) return
    void hydrateKeywordMetricsFromDb(competitorSnapshotKeywords)
  }, [isTaskChannel, competitorSnapshotKeywords, hydrateKeywordMetricsFromDb])

  const buildSuggestedKeywordsFromSnapshot = useCallback((): SuggestedKeyword[] => {
    const collected: SuggestedKeyword[] = []
    const seen = new Set<string>()
    const addCandidate = (rawValue: string | null | undefined, source: string) => {
      if (typeof rawValue !== "string") return
      const value = rawValue.trim()
      if (!value || value.length < 2 || value.length > 90 || value.includes("://")) return
      const normalized = normalizeKeywordValue(value)
      if (!normalized || currentKeywordsSet.has(normalized) || seen.has(normalized)) return
      seen.add(normalized)
      const metric = getKeywordMetric(value)
      collected.push({
        keyword: value,
        volume: metric?.volume ?? null,
        competitionIndex: metric?.competition ?? null,
        source,
      })
    }

    for (const keyword of snapshotKeywords) {
      const state = getKeywordState(keyword)
      for (const competitor of state.competitors) {
        addCandidate(competitor.title, "competitor_title")
        const structure = competitor.structure
        if (!structure) continue
        addCandidate(structure.pageTitle, "page_title")
        for (const heading of structure.flatHeadings ?? []) {
          addCandidate(heading.text, "heading")
        }
      }
    }

    return collected.slice(0, 14)
  }, [snapshotKeywords, getKeywordState, getKeywordMetric, currentKeywordsSet])

  const loadKeywordSuggestionsIfNeeded = useCallback(async () => {
    if (hasLoadedKeywordSuggestions) {
      setSuggestedKeywords(buildSuggestedKeywordsFromSnapshot())
      return
    }

    setIsLoadingKeywordSuggestions(true)
    try {
      if (isTaskChannel && snapshotKeywords.length > 0) {
        await Promise.all(
          snapshotKeywords.map((keyword) =>
            loadKeywordCompetitors(keyword, {
              triggerPrefetch: false,
              triggerSource: null,
            }),
          ),
        )
      }
    } catch {
      // Suggestions are best-effort; keep the current UI stable.
    } finally {
      setSuggestedKeywords(buildSuggestedKeywordsFromSnapshot())
      setHasLoadedKeywordSuggestions(true)
      setIsLoadingKeywordSuggestions(false)
    }
  }, [
    hasLoadedKeywordSuggestions,
    buildSuggestedKeywordsFromSnapshot,
    isTaskChannel,
    snapshotKeywords,
    loadKeywordCompetitors,
  ])

  const handleSuggestedKeywordClick = useCallback(async (keyword: string) => {
    const wasAdded = await handleAddKeyword(keyword)
    if (!wasAdded) return
    setSuggestedKeywords((prev) => prev.filter((item) => normalizeKeywordValue(item.keyword) !== normalizeKeywordValue(keyword)))
  }, [handleAddKeyword])

  useEffect(() => {
    if (!isKeywordSuggestionsOpen) return
    setSuggestedKeywords((prev) =>
      prev.filter((item) => !currentKeywordsSet.has(normalizeKeywordValue(item.keyword))),
    )
  }, [isKeywordSuggestionsOpen, currentKeywordsSet])

  useEffect(() => {
    if (!isKeywordSuggestionsOpen || !hasLoadedKeywordSuggestions) return
    setSuggestedKeywords(buildSuggestedKeywordsFromSnapshot())
  }, [isKeywordSuggestionsOpen, hasLoadedKeywordSuggestions, buildSuggestedKeywordsFromSnapshot])

  useEffect(() => {
    if (!isKeywordSuggestionsOpen) return

    const handleDocumentMouseDown = (event: MouseEvent) => {
      const target = event.target
      if (target instanceof Node && keywordTableRef.current?.contains(target)) return
      setIsKeywordSuggestionsOpen(false)
    }

    const handleDocumentKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsKeywordSuggestionsOpen(false)
      }
    }

    document.addEventListener("mousedown", handleDocumentMouseDown)
    document.addEventListener("keydown", handleDocumentKeyDown)
    return () => {
      document.removeEventListener("mousedown", handleDocumentMouseDown)
      document.removeEventListener("keydown", handleDocumentKeyDown)
    }
  }, [isKeywordSuggestionsOpen])

  // NOTE: Do not early-return before the hooks below — that caused
  // "Rendered more hooks than during the previous render" when isLoading flipped.
  
  const keywordRows = useMemo(() => {
    if (isTaskChannel) {
      return snapshotKeywords.map((keyword, index) => ({
        keyword,
        isPrimary: index === 0,
        density: calculateKeywordDensity(combinedText, keyword),
        occurrences: countKeywordOccurrences(combinedText, keyword),
      }))
    }
    const primary = primaryKeyword.trim()
    const list: { keyword: string; isPrimary: boolean; density: number; occurrences: number }[] = []
    if (primary) {
      list.push({
        keyword: primary,
        isPrimary: true,
        density: primaryDensity,
        occurrences: countKeywordOccurrences(combinedText, primary),
      })
    }
    secondaryDensities.forEach((item) => {
      list.push({
        keyword: item.keyword,
        isPrimary: false,
        density: item.density,
        occurrences: countKeywordOccurrences(combinedText, item.keyword),
      })
    })
    return list
  }, [isTaskChannel, snapshotKeywords, combinedText, primaryKeyword, primaryDensity, secondaryDensities])

  useEffect(() => {
    const keywords = keywordRows.map((row) => row.keyword)
    if (keywords.length === 0) {
      setSelectedKeyword(null)
      return
    }
    if (!selectedKeyword || !keywords.includes(selectedKeyword)) {
      setSelectedKeyword(keywords[0] ?? null)
    }
  }, [keywordRows, selectedKeyword])

  useEffect(() => {
    if (!expandedTopResultsKeyword) return
    if (!keywordRows.some((row) => row.keyword === expandedTopResultsKeyword)) {
      setExpandedTopResultsKeyword(null)
    }
  }, [keywordRows, expandedTopResultsKeyword])

  useEffect(() => {
    if (!isTaskChannel || !expandedTopResultsKeyword) return
    // Wait for the cached snapshot (get_task_channel_seo_snapshot) to settle. It is the source of
    // truth for cached competitors/top results and carries each competitor's heading structure;
    // racing it with a plain top-results fetch would overwrite structured competitors.
    if (isLoadingSnapshot) return
    const normalizedSelected = normalizeKeywordValue(expandedTopResultsKeyword)
    if (pendingKeywordPersistenceRef.current && pendingKeywordPersistenceRef.current === normalizedSelected) return

    const keywordState = getKeywordState(expandedTopResultsKeyword)
    const hasCachedCompetitors = keywordState.hasLoadedCompetitors || keywordState.competitors.length > 0

    if (hasCachedCompetitors) {
      // Cached competitors already loaded from the snapshot. Never replace them with structure-less
      // top-results data. If some competitors are missing heading structure, prefetch only those.
      const hasMissingStructure = keywordState.competitors.some((competitor) => !competitor.structure)
      if (hasMissingStructure && !keywordState.isPrefetchingStructures && !keywordState.hasPrefetchStarted) {
        void startBackgroundPrefetch(expandedTopResultsKeyword, keywordState.competitors)
      }
      return
    }

    // No cached competitor data for this keyword: fetch top results to populate it.
    void loadKeywordCompetitors(expandedTopResultsKeyword)
  }, [isTaskChannel, expandedTopResultsKeyword, isLoadingSnapshot, loadKeywordCompetitors, getKeywordState, startBackgroundPrefetch])

  useEffect(() => {
    if (!isCountryDropdownOpen) {
      setCountrySearchQuery("")
    }
  }, [isCountryDropdownOpen])

  // Sync from server when variantSEO updates
  // without relying on isUserTypingRef being cleared before the update arrives
  const prevVariantSEORef = useRef<typeof variantSEO>(variantSEO)
  useEffect(() => {
    if (!variantSEO || variantSEO === prevVariantSEORef.current || isKeywordAddInFlightRef.current) return
    prevVariantSEORef.current = variantSEO
    const seoDataKey = `${variantSEO.primary_keyword || ''}|${JSON.stringify(variantSEO.secondary_keywords)}`
    if (seoDataKey === lastSyncedSeoDataRef.current) return
    const newPrimary = variantSEO.primary_keyword || ''
    const secondaryStr = Array.isArray(variantSEO.secondary_keywords)
      ? variantSEO.secondary_keywords.join(', ')
      : (typeof variantSEO.secondary_keywords === 'string' ? variantSEO.secondary_keywords : '')
    if (isTaskChannelRef.current && channelId != null && variantSEO.channel_id != null && variantSEO.channel_id !== channelId) {
      return
    }
    if (isTaskChannelRef.current && !newPrimary.trim() && !secondaryStr.trim()) {
      return
    }
    setPrimaryKeyword(newPrimary)
    setSecondaryKeywords(secondaryStr)
    primaryKeywordRef.current = newPrimary
    secondaryKeywordsRef.current = secondaryStr
    lastSyncedSeoDataRef.current = seoDataKey
  }, [variantSEO])

  const pageTypeBadgeClassNameByType: Record<CompetitorPageType, string> = {
    article: 'bg-slate-100 text-slate-700 border-slate-200',
    product: 'bg-indigo-100 text-indigo-700 border-indigo-200',
    homepage: 'bg-emerald-100 text-emerald-700 border-emerald-200',
    category: 'bg-amber-100 text-amber-700 border-amber-200',
    landing: 'bg-cyan-100 text-cyan-700 border-cyan-200',
    unknown: 'bg-gray-100 text-gray-600 border-gray-200',
  }

  const renderPageTypeBadge = (pageType: CompetitorPageType | null | undefined) => {
    if (!pageType) return null
    return (
      <span
        className={`inline-flex items-center rounded border px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide ${pageTypeBadgeClassNameByType[pageType]}`}
      >
        {pageType}
      </span>
    )
  }

  const formatMetricValue = useCallback((value: number | null | undefined) => {
    if (typeof value !== "number" || !Number.isFinite(value)) return "—"
    return value.toLocaleString()
  }, [])

  const getSearchVolumeTone = useCallback((value: number | null | undefined) => {
    if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
      return "text-gray-400"
    }
    if (value < 1000) return "text-slate-600"
    if (value < 10000) return "text-sky-700"
    if (value < 50000) return "text-blue-700"
    return "text-indigo-700"
  }, [])

  /** Soft chip styles for collapsed keyword metrics (density / SV). */
  const getDensityChipClass = useCallback((density: number) => {
    const tone = getDensityColor(density).color
    if (tone.includes("green")) return "bg-emerald-50 text-emerald-700"
    if (tone.includes("yellow")) return "bg-amber-50 text-amber-700"
    return "bg-red-50 text-red-700"
  }, [])

  const getSearchVolumeChipClass = useCallback((value: number | null | undefined) => {
    if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
      return "bg-gray-50 text-gray-400"
    }
    if (value < 1000) return "bg-slate-50 text-slate-600"
    if (value < 10000) return "bg-sky-50 text-sky-700"
    if (value < 50000) return "bg-blue-50 text-blue-700"
    return "bg-indigo-50 text-indigo-700"
  }, [])

  const getKeywordDifficultyTone = useCallback((value: number | null | undefined) => {
    if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
      return "text-gray-400"
    }
    if (value < 35) return "text-emerald-600"
    if (value < 70) return "text-amber-600"
    return "text-red-600"
  }, [])

  const handleSeoRegionChange = useCallback(async (nextRegionId: number) => {
    if (typeof nextRegionId !== "number" || !Number.isFinite(nextRegionId)) {
      throw new Error("Invalid region_id")
    }
    if (!taskId || !channelId || cttId) {
      setSeoRegionId(nextRegionId)
      return
    }
    setSeoRegionId(nextRegionId)
    setIsSavingSeoRegion(true)
    try {
      const regionValue = nextRegionId > 0 ? nextRegionId : null
      const { error } = await supabase
        .from("task_channel_seo")
        .upsert(
          {
            task_id: taskId,
            channel_id: channelId,
            region_id: regionValue,
          },
          { onConflict: "task_id,channel_id" },
        )
      if (error) throw error
      if (isTaskChannel && competitorSnapshotKeywords.length > 0) {
        await refreshKeywordMetricsForKeywords(competitorSnapshotKeywords, { regionIdOverride: nextRegionId })
      }
    } catch (error: any) {
      toast({
        title: "Error",
        description: error?.message || "Failed to save SEO region",
        variant: "destructive",
      })
    } finally {
      setIsSavingSeoRegion(false)
    }
  }, [taskId, channelId, cttId, supabase, isTaskChannel, competitorSnapshotKeywords, refreshKeywordMetricsForKeywords])

  const selectedCountryLabel = SEO_REGION_OPTIONS.find((option) => option.value === seoRegionId)?.label ?? "All countries"

  const researchRegionId = seoRegionId > 0 ? String(seoRegionId) : ""

  const addKeywordComposer = (
    <Popover
      open={isKeywordSuggestionsOpen}
      onOpenChange={(open) => {
        setIsKeywordSuggestionsOpen(open)
        if (open) {
          setAddKeywordMode("type")
          void loadKeywordSuggestionsIfNeeded()
          requestAnimationFrame(() => addKeywordInputRef.current?.focus())
        } else {
          setNewKeywordValue("")
          setAddKeywordMode("type")
        }
      }}
    >
      <PopoverTrigger asChild>
        <AddDashedButton
          label="Add keyword"
          className="mt-0"
          disabled={isUpdatingKeywords || isLoading}
        />
      </PopoverTrigger>
      <PopoverContent
        align="start"
        sideOffset={6}
        className="w-[var(--radix-popover-trigger-width)] rounded-lg border border-gray-200 bg-white p-0 shadow-lg"
        onOpenAutoFocus={(event) => {
          event.preventDefault()
          addKeywordInputRef.current?.focus()
        }}
        onCloseAutoFocus={(event) => event.preventDefault()}
      >
        {/* Keep both modes mounted so switching tabs does not dismiss the popover. */}
        <div className={addKeywordMode === "type" ? "block" : "hidden"}>
          <div className="space-y-3 p-3">
            <div className="flex items-center justify-between gap-2">
              <div className="text-sm font-medium text-gray-900">Add keyword</div>
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="h-7 px-2 text-xs"
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => setAddKeywordMode("research")}
              >
                Search for keywords
              </Button>
            </div>
            <div className="flex items-center gap-2">
              <Input
                ref={addKeywordInputRef}
                placeholder="Type a keyword"
                value={newKeywordValue}
                onChange={(event) => setNewKeywordValue(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault()
                    void handleAddKeyword()
                  }
                  if (event.key === "Escape") {
                    event.preventDefault()
                    setIsKeywordSuggestionsOpen(false)
                    setNewKeywordValue("")
                  }
                }}
                className="h-8 min-w-0 flex-1 text-sm"
                disabled={isUpdatingKeywords || isLoading}
              />
              <Button
                type="button"
                size="sm"
                className="h-8 shrink-0 px-3 text-xs"
                disabled={isUpdatingKeywords || isLoading || !newKeywordValue.trim()}
                onClick={() => { void handleAddKeyword() }}
              >
                Add
              </Button>
            </div>
          </div>
          <div className="border-t border-gray-100">
            {isLoadingKeywordSuggestions ? (
              <div className="flex items-center gap-1.5 px-3 py-3 text-xs text-gray-500">
                <Loader2 className="h-3.5 w-3.5 animate-spin text-gray-400" />
                Loading suggestions…
              </div>
            ) : suggestedKeywords.length > 0 ? (
              <div className="max-h-56 overflow-y-auto py-1">
                {suggestedKeywords.map((suggestion) => (
                  <button
                    key={`${suggestion.keyword}-${suggestion.source ?? "local"}`}
                    type="button"
                    className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm text-gray-700 transition-colors hover:bg-gray-50"
                    onMouseDown={(event) => {
                      event.preventDefault()
                    }}
                    onClick={() => {
                      void handleSuggestedKeywordClick(suggestion.keyword)
                    }}
                  >
                    <span className="min-w-0 flex-1 truncate">{suggestion.keyword}</span>
                    {(suggestion.volume != null || suggestion.competitionIndex != null) ? (
                      <span className="inline-flex shrink-0 items-center gap-1 text-xs text-gray-500">
                        <KeywordMetricStat metric="volume">{formatMetricValue(suggestion.volume)}</KeywordMetricStat>
                        <KeywordMetricSeparator />
                        <KeywordMetricStat metric="difficulty">
                          {formatMetricValue(suggestion.competitionIndex)}
                        </KeywordMetricStat>
                      </span>
                    ) : null}
                  </button>
                ))}
              </div>
            ) : (
              <p className="px-3 py-3 text-xs text-gray-500">No keyword suggestions yet. Type one above to add it.</p>
            )}
          </div>
        </div>

        <div className={addKeywordMode === "research" ? "block" : "hidden"}>
          <div className="flex items-center justify-between gap-2 border-b border-gray-100 px-3 py-2.5">
            <div className="text-sm font-medium text-gray-900">Search for keywords</div>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="h-7 px-2 text-xs"
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => {
                setAddKeywordMode("type")
                requestAnimationFrame(() => addKeywordInputRef.current?.focus())
              }}
            >
              Type a keyword
            </Button>
          </div>
          <SeoKeywordResearchInline
            initialRegionId={researchRegionId}
            existingKeywords={currentKeywordsSet}
            disabled={isUpdatingKeywords || isLoading}
            autoFocus={addKeywordMode === "research"}
            onSelectKeyword={async (keyword) => {
              await handleAddKeyword(keyword)
            }}
          />
        </div>
      </PopoverContent>
    </Popover>
  )

  const toggleKeywordTopResults = useCallback((keyword: string) => {
    setExpandedTopResultsKeyword((current) => {
      const next = current === keyword ? null : keyword
      if (next) setSelectedKeyword(keyword)
      return next
    })
  }, [setSelectedKeyword])

  const renderTopResultsContent = useCallback((keyword: string) => {
    const keywordState = getKeywordState(keyword)
    const expandedCompetitorId = expandedCompetitorByKeyword[keyword] ?? null

    if (isLoadingSnapshot) {
      return (
        <div className="space-y-1.5 py-1">
          <div className="h-6 w-full animate-pulse rounded bg-gray-100" />
          <div className="h-6 w-full animate-pulse rounded bg-gray-100" />
        </div>
      )
    }

    if (keywordState.competitorsError) {
      return (
        <div className="flex items-start justify-between gap-2 rounded border border-red-100 bg-red-50 px-2 py-1.5">
          <p className="text-[11px] text-red-600">{keywordState.competitorsError}</p>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-6 px-2 text-xs"
            onClick={() => { void loadKeywordCompetitors(keyword) }}
          >
            Retry
          </Button>
        </div>
      )
    }

    if (keywordState.isLoadingCompetitors) {
      return (
        <div className="space-y-1.5 py-1">
          <div className="h-6 w-full animate-pulse rounded bg-gray-100" />
          <div className="h-6 w-full animate-pulse rounded bg-gray-100" />
        </div>
      )
    }

    if (keywordState.competitors.length === 0) {
      return (
        <p className="py-2 text-center text-[11px] text-gray-500">
          No top results found for this keyword.
        </p>
      )
    }

    return (
      <div className="space-y-1.5">
        {keywordState.competitors.map((competitor, index) => {
          const isExpandedCompetitor = expandedCompetitorId === competitor.id
          const domain = getDomainFromUrl(competitor.url)
          const faviconUrl = getFaviconUrl(competitor.url)
          const pageType = competitor.structure?.pageType ?? null
          return (
            <div
              key={competitor.id}
              className={`overflow-hidden rounded border bg-white transition-colors ${
                isExpandedCompetitor ? "border-gray-300 bg-gray-50/80" : "border-gray-100"
              }`}
            >
              <button
                type="button"
                className="flex w-full items-center gap-2 px-2 py-1.5 text-left"
                onClick={() => {
                  if (isExpandedCompetitor) {
                    setExpandedCompetitorByKeyword((prev) => ({ ...prev, [keyword]: null }))
                    return
                  }
                  setExpandedCompetitorByKeyword((prev) => ({ ...prev, [keyword]: competitor.id }))
                }}
              >
                <span className="w-4 shrink-0 text-[10px] tabular-nums text-gray-400">{index + 1}</span>
                {faviconUrl ? (
                  <img src={faviconUrl} alt="" className="h-3.5 w-3.5 shrink-0 rounded-sm" loading="lazy" />
                ) : (
                  <span className="inline-flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-sm bg-gray-100 text-[8px] text-gray-400">•</span>
                )}
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[10px] text-gray-400">{domain}</div>
                  <div className="mt-0.5 flex min-w-0 items-center gap-1.5">
                    <a
                      href={competitor.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="min-w-0 flex-1 truncate text-xs font-medium text-blue-700 hover:underline"
                      onClick={(event) => event.stopPropagation()}
                    >
                      {competitor.title}
                    </a>
                    {renderPageTypeBadge(pageType)}
                  </div>
                </div>
                <ChevronRight
                  className={`h-3.5 w-3.5 shrink-0 text-gray-400 transition-transform ${
                    isExpandedCompetitor ? "rotate-90" : ""
                  }`}
                />
              </button>
              {isExpandedCompetitor ? (
                <div className="border-t border-gray-100 px-2 py-2">
                  <CompetitorStructure
                    structure={competitor.structure}
                    isLoading={!!keywordState.loadingStructureByCompetitorId[competitor.id]}
                    error={keywordState.structureErrorByCompetitorId[competitor.id] ?? null}
                    hasTriedFallback={!!keywordState.fallbackTriedByCompetitorId[competitor.id]}
                  />
                </div>
              ) : null}
            </div>
          )
        })}
      </div>
    )
  }, [
    expandedCompetitorByKeyword,
    getKeywordState,
    isLoadingSnapshot,
    loadKeywordCompetitors,
    renderPageTypeBadge,
  ])

  if (!isTaskChannel && languageId === null) {
    return (
      <div className="p-4 text-center text-gray-500 bg-gray-50 rounded-lg">
        <Info className="w-5 h-5 mx-auto mb-2 text-gray-400" />
        <div className="text-sm">Select a variation to configure SEO.</div>
      </div>
    )
  }

  if (isLoading) {
    return (
      <div className="p-4 text-center">
        <div className="text-sm text-gray-500">Loading SEO settings...</div>
      </div>
    )
  }

  // For task channels, always show the panel (can override)
  // For CTT variants, only show if SEO is required
  if (!isTaskChannel && (!variantSEO || !variantSEO.seo_required)) {
    return (
      <div className="p-4 text-center text-gray-500 bg-gray-50 rounded-lg">
        <Info className="w-5 h-5 mx-auto mb-2 text-gray-400" />
        <div className="text-sm">SEO not required for this variation.</div>
      </div>
    )
  }

  return (
    <div ref={keywordTableRef} className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-sm font-normal text-gray-400">SEO</span>
        {isTaskChannel ? (
          <Popover open={isCountryDropdownOpen} onOpenChange={setIsCountryDropdownOpen}>
            <PopoverTrigger asChild>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-8 gap-1.5 text-xs"
                disabled={isSavingSeoRegion}
              >
                <Globe2 className="h-3.5 w-3.5" />
                <span className="max-w-[140px] truncate">{selectedCountryLabel}</span>
                <ChevronDown className={`h-3.5 w-3.5 text-gray-400 transition-transform ${isCountryDropdownOpen ? "rotate-180" : ""}`} />
              </Button>
            </PopoverTrigger>
            <PopoverContent
              ref={countryPopoverContentRef}
              align="end"
              side="bottom"
              sideOffset={6}
              className="z-50 w-64 p-0"
            >
              <div className="border-b border-gray-100 p-2">
                <Input
                  value={countrySearchQuery}
                  onChange={(event) => setCountrySearchQuery(event.target.value)}
                  placeholder="Search country..."
                  className="h-8 text-xs"
                />
              </div>
              <div className="max-h-56 overflow-auto">
                {SEO_REGION_OPTIONS.filter((option) => {
                  const query = countrySearchQuery.trim().toLowerCase()
                  if (!query) return true
                  return option.label.toLowerCase().includes(query)
                }).map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    className="flex w-full items-center justify-between px-3 py-2 text-left text-xs text-gray-700 hover:bg-gray-50"
                    onClick={() => {
                      void handleSeoRegionChange(option.value)
                      setIsCountryDropdownOpen(false)
                    }}
                  >
                    <span className="truncate">{option.label}</span>
                    {seoRegionId === option.value ? <Check className="h-3.5 w-3.5 text-gray-500" /> : null}
                  </button>
                ))}
              </div>
            </PopoverContent>
          </Popover>
        ) : null}
      </div>

      {keywordRows.length === 0 ? (
        addKeywordComposer
      ) : (
        <div className="space-y-1.5">
          {keywordRows.map((row) => {
            const metric = getKeywordMetric(row.keyword)
            const isEditingRow = isEditingSelectedKeyword && editingOriginalValue === row.keyword
            const isKeywordExpanded = expandedTopResultsKeyword === row.keyword
            const densityChipClass = getDensityChipClass(row.density)
            const volumeChipClass = getSearchVolumeChipClass(metric?.volume)
            return (
              <div
                key={row.keyword}
                className={`group relative overflow-hidden rounded-md border border-border/80 bg-background transition-colors ${
                  isKeywordExpanded ? "border-border ring-1 ring-border/30" : ""
                }`}
              >
                <div className="flex min-w-0 items-center gap-1.5 px-3 py-2">
                  <button
                    type="button"
                    className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded text-muted-foreground hover:bg-accent hover:text-gray-600"
                    aria-label={isKeywordExpanded ? "Collapse keyword details" : "Expand keyword details"}
                    aria-expanded={isKeywordExpanded}
                    onClick={(event) => {
                      event.stopPropagation()
                      toggleKeywordTopResults(row.keyword)
                    }}
                  >
                    <ChevronDown
                      className={`h-4 w-4 transition-transform duration-150 ${
                        isKeywordExpanded ? "rotate-0" : "-rotate-90"
                      }`}
                    />
                  </button>
                  <div
                    className="flex h-8 min-w-0 flex-1 items-center"
                    onDoubleClick={() => {
                      setEditingOriginalValue(row.keyword)
                      setEditingKeywordValue(row.keyword)
                      setIsEditingSelectedKeyword(true)
                    }}
                  >
                    {isEditingRow ? (
                      <Input
                        value={editingKeywordValue}
                        onChange={(event) => setEditingKeywordValue(event.target.value)}
                        onKeyDown={(event) => {
                          if (event.key === "Enter") {
                            event.preventDefault()
                            commitKeywordEdit(editingOriginalValue || row.keyword, editingKeywordValue)
                          }
                          if (event.key === "Escape") {
                            event.preventDefault()
                            setEditingKeywordValue(editingOriginalValue || row.keyword)
                            setIsEditingSelectedKeyword(false)
                          }
                        }}
                        onBlur={() => {
                          commitKeywordEdit(editingOriginalValue || row.keyword, editingKeywordValue)
                        }}
                        onClick={(event) => event.stopPropagation()}
                        className="h-8 min-h-0 w-full border-0 bg-transparent px-0 py-0 text-sm font-normal leading-5 shadow-none focus-visible:ring-0 focus-visible:outline-none"
                        autoFocus
                      />
                    ) : (
                      <span className="block truncate text-sm font-normal leading-5 text-gray-900">{row.keyword}</span>
                    )}
                  </div>
                  {!isEditingRow ? (
                    <div className="flex shrink-0 items-center gap-1">
                      <IconTooltip label="Share of words in content that match this keyword" side="top">
                        <span
                          className={`inline-flex min-w-[2.25rem] items-center justify-center rounded-md px-1.5 py-0.5 text-[11px] font-medium tabular-nums ${densityChipClass}`}
                        >
                          {row.density.toFixed(0)}%
                        </span>
                      </IconTooltip>
                      {metric?.isLoading ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin text-gray-300" />
                      ) : (
                        <IconTooltip label="Average monthly search volume" side="top">
                          <span
                            className={`inline-flex min-w-[2.5rem] items-center justify-center rounded-md px-1.5 py-0.5 text-[11px] font-medium tabular-nums ${volumeChipClass}`}
                          >
                            {formatMetricValue(metric?.volume)}
                          </span>
                        </IconTooltip>
                      )}
                    </div>
                  ) : null}
                  <button
                    type="button"
                    className="rounded p-1 text-gray-400 opacity-50 transition-opacity hover:text-red-500 group-hover:opacity-100"
                    title="Remove keyword"
                    aria-label="Remove keyword"
                    onClick={(event) => {
                      event.stopPropagation()
                      handleRemoveKeyword(row.keyword)
                    }}
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
                {isKeywordExpanded ? (
                  <div className="space-y-2 border-t border-gray-100 px-3 pb-2 pt-1.5">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <KeywordMetricStat metric="uses">{row.occurrences.toLocaleString()}</KeywordMetricStat>
                      <KeywordMetricSeparator />
                      <KeywordMetricStat metric="density" valueClassName={getDensityColor(row.density).color}>
                        {row.density.toFixed(0)}%
                      </KeywordMetricStat>
                      <KeywordMetricSeparator />
                      {metric?.isLoading ? (
                        <Loader2 className="h-3 w-3 animate-spin text-gray-300" />
                      ) : (
                        <>
                          <KeywordMetricStat metric="volume" valueClassName={getSearchVolumeTone(metric?.volume)}>
                            {formatMetricValue(metric?.volume)}
                          </KeywordMetricStat>
                          <KeywordMetricSeparator />
                          <KeywordMetricStat metric="difficulty" valueClassName={getKeywordDifficultyTone(metric?.competition)}>
                            {formatMetricValue(metric?.competition)}
                          </KeywordMetricStat>
                        </>
                      )}
                      <button
                        type="button"
                        className="ml-auto inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-xs text-gray-500 hover:bg-gray-50 hover:text-gray-700"
                        title="Make primary"
                        aria-label="Make primary"
                        onClick={(event) => {
                          event.stopPropagation()
                          handleMakeDefaultKeyword(row.keyword)
                        }}
                      >
                        <Star className={`h-3.5 w-3.5 ${row.isPrimary ? "fill-gray-600 text-gray-600" : "text-gray-300"}`} />
                        {row.isPrimary ? "Primary" : "Make primary"}
                      </button>
                    </div>
                    {isTaskChannel ? renderTopResultsContent(row.keyword) : null}
                  </div>
                ) : null}
              </div>
            )
          })}
          {addKeywordComposer}
        </div>
      )}

      {snapshotError ? (
        <div className="flex items-center gap-2 text-xs text-red-600">
          <AlertCircle className="h-3.5 w-3.5" />
          {snapshotError}
        </div>
      ) : null}

      <div className="flex items-center justify-between text-sm">
        {isUpdatingKeywords ? (
          <div className="flex items-center gap-2 text-gray-500">
            <div className="w-4 h-4 border-2 border-gray-300 border-t-gray-600 rounded-full animate-spin" />
            Saving...
          </div>
        ) : variantSEO?.updated_at ? (
          <div className="flex items-center gap-2 text-green-600">
            <Check className="w-4 h-4" />
            Saved {new Date(variantSEO.updated_at).toLocaleTimeString()}
          </div>
        ) : null}
      </div>
    </div>
  )
}
