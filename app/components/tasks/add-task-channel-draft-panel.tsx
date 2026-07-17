"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs"
import { ChevronDown, ChevronLeft, ChevronRight, GripVertical, Loader2, Plus, Sparkles, X } from "lucide-react"
import { Button } from "../ui/button"
import { Input } from "../ui/input"
import { Popover, PopoverContent, PopoverTrigger } from "../ui/popover"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "../ui/dropdown-menu"
import { toast } from "../ui/use-toast"
import { cn } from "@/lib/utils"
import {
  ensureBriefingTypeAssignedToChannel,
  mapProjectChannelBriefingTypeOptions,
  splitBriefingTypeOptions,
  type ProjectChannelBriefingTypeOption,
} from "../../lib/channel-briefing-types"

type ChannelOption = {
  id: string
  label: string
  isDefault: boolean
}

type DraftComponent = {
  key: string
  title: string
  description: string | null
  custom_title: string | null
  custom_description: string | null
  tag: string | null
  kind: DraftComponentKind
  selected: boolean
  position: number | null
  briefing_component_id: number | null
  project_component_id: number | null
  purpose: string | null
  guidance: string | null
  suggested_word_count: number | null
  subheads: any[] | null
}

type DraftComponentKind = "global" | "project" | "task_ad_hoc" | "ai_suggestion"

type BriefingTypeOption = ProjectChannelBriefingTypeOption

type ChannelDraftState = {
  briefingTypeId: number | null
  primaryKeyword: string
  secondaryKeywords: string[]
  seoRequiredOverride: boolean | null
  briefingTypes: BriefingTypeOption[]
  selectedComponents: DraftComponent[]
  availableComponents: DraftComponent[]
  aiSuggestions: DraftComponent[]
  isLoading: boolean
  hasLoaded: boolean
  hasLoadedAi: boolean
  isRunningAi: boolean
}

type DraftPayloadComponentBase = {
  selected: boolean
  position: number | null
  custom_title: string | null
  custom_description: string | null
  purpose: string | null
  guidance: string | null
  suggested_word_count: number | null
  subheads: any[] | null
}

type DraftPayloadGlobalComponent = DraftPayloadComponentBase & {
  kind: "global"
  briefing_component_id: number
  project_component_id: null
}

type DraftPayloadProjectComponent = DraftPayloadComponentBase & {
  kind: "project"
  briefing_component_id: null
  project_component_id: number
}

type DraftPayloadAdHocComponent = DraftPayloadComponentBase & {
  kind: "task_ad_hoc" | "ai_suggestion"
  briefing_component_id: null
  project_component_id: null
}

type DraftPayloadComponent =
  | DraftPayloadGlobalComponent
  | DraftPayloadProjectComponent
  | DraftPayloadAdHocComponent

type DraftPayloadChannel = {
  channel_id: number
  briefing_type_id: number | null
  primary_keyword: string | null
  secondary_keywords: string[] | null
  seo_required_override: boolean | null
  components: DraftPayloadComponent[]
}

type AddTaskChannelDraftPanelProps = {
  channels: ChannelOption[]
  activeChannelIds: string[]
  selectedTab: "all" | string
  onSelectedTabChange: (tab: "all" | string) => void
  onRemoveChannel: (channelId: string) => void
  onAddChannel: (channelId: string) => void
  projectId: number | null
  contentTypeId: number | null
  contentTypeTitle: string
  languageCode: string
  title: string
  briefing: string
  notes: string
  onDraftPayloadChange: (payload: DraftPayloadChannel[] | null) => void
}

const COMPONENT_CARD_HEIGHT_CLASS = "h-[88px]"

function toNumber(value: unknown): number | null {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

function normalizeTag(value: unknown): string | null {
  if (typeof value !== "string") return null
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : null
}

function firstNonEmptyString(...values: unknown[]): string | null {
  for (const value of values) {
    if (typeof value !== "string") continue
    const trimmed = value.trim()
    if (trimmed.length > 0) return trimmed
  }
  return null
}

function normalizeComponentKind(rawKind: unknown, rawOrigin: unknown): DraftComponentKind {
  const kindValue = typeof rawKind === "string" ? rawKind.trim().toLowerCase() : ""
  const originValue = typeof rawOrigin === "string" ? rawOrigin.trim().toLowerCase() : ""

  if (
    kindValue === "project" ||
    kindValue.endsWith("_project") ||
    kindValue.includes("project") ||
    originValue === "project" ||
    originValue.endsWith("_project") ||
    originValue.includes("project")
  ) {
    return "project"
  }
  if (
    kindValue === "global" ||
    kindValue.endsWith("_global") ||
    kindValue.includes("global") ||
    originValue === "global" ||
    originValue.endsWith("_global") ||
    originValue.includes("global")
  ) {
    return "global"
  }
  if (kindValue === "ai_suggestion") return "ai_suggestion"
  return "task_ad_hoc"
}

function mapComponentRow(raw: any, index: number): DraftComponent {
  const rawBriefingComponentId = toNumber(raw?.briefing_component_id)
  const rawProjectComponentId = toNumber(raw?.project_component_id)
  const rawGenericComponentId = toNumber(raw?.component_id)
  const kind = normalizeComponentKind(raw?.kind, raw?.origin)
  const projectComponentId =
    kind === "project"
      ? rawProjectComponentId ?? rawBriefingComponentId ?? rawGenericComponentId
      : null
  const briefingComponentId =
    kind === "global"
      ? rawBriefingComponentId ?? rawGenericComponentId
      : null
  const key =
    (typeof raw?.component_key === "string" && raw.component_key) ||
    (typeof raw?.key === "string" && raw.key) ||
    `${kind}:${briefingComponentId ?? projectComponentId ?? "adhoc"}:${index}`
  return {
    key,
    title:
      firstNonEmptyString(raw?.title, raw?.template_title, raw?.project_template_title) ??
      "Untitled component",
    description:
      firstNonEmptyString(raw?.description, raw?.template_description, raw?.project_template_description),
    custom_title: typeof raw?.custom_title === "string" ? raw.custom_title : null,
    custom_description: typeof raw?.custom_description === "string" ? raw.custom_description : null,
    tag: normalizeTag(raw?.tag),
    kind,
    selected: raw?.selected == null ? true : Boolean(raw.selected),
    position: toNumber(raw?.position),
    briefing_component_id: briefingComponentId,
    project_component_id: projectComponentId,
    purpose: typeof raw?.purpose === "string" ? raw.purpose : null,
    guidance: typeof raw?.guidance === "string" ? raw.guidance : null,
    suggested_word_count: toNumber(raw?.suggested_word_count),
    subheads: Array.isArray(raw?.subheads) ? raw.subheads : null,
  }
}

function toDraftPayloadComponent(component: DraftComponent, index: number): DraftPayloadComponent | null {
  const base = {
    selected: true,
    position: index + 1,
    custom_title: component.custom_title ?? component.title ?? null,
    custom_description: component.custom_description ?? component.description ?? null,
    purpose: component.purpose,
    guidance: component.guidance,
    suggested_word_count: component.suggested_word_count,
    subheads: component.subheads,
  } as const

  if (component.kind === "project") {
    const projectComponentId = component.project_component_id ?? component.briefing_component_id
    if (projectComponentId == null) return null
    return {
      ...base,
      kind: "project",
      briefing_component_id: null,
      project_component_id: projectComponentId,
    }
  }

  if (component.kind === "global") {
    const briefingComponentId = component.briefing_component_id ?? component.project_component_id
    if (briefingComponentId == null) return null
    return {
      ...base,
      kind: "global",
      briefing_component_id: briefingComponentId,
      project_component_id: null,
    }
  }

  return {
    ...base,
    kind: component.kind === "ai_suggestion" ? "ai_suggestion" : "task_ad_hoc",
    briefing_component_id: null,
    project_component_id: null,
  }
}

function mapBriefingTypes(rows: any[]): { options: BriefingTypeOption[]; defaultBriefingTypeId: number | null } {
  const { options, effectiveDefaultBriefingTypeId } = mapProjectChannelBriefingTypeOptions(rows || [])
  const defaultBriefingTypeId = effectiveDefaultBriefingTypeId ?? options[0]?.id ?? null
  return { options, defaultBriefingTypeId }
}

function categoryForComponent(component: DraftComponent): string {
  if ((component.tag || "").length > 0) return component.tag || "System"
  if ((component.tag || "").toLowerCase() === "recommended") return "Recommended"
  if ((component.tag || "").toLowerCase() === "removed") return "Removed"
  if ((component.tag || "").toLowerCase() === "ai suggestions" || component.kind === "ai_suggestion") return "AI suggestions"
  if (component.kind === "project" || (component.tag || "").toLowerCase() === "custom") return "Custom"
  return "System"
}

function tagBadgeClass(tag: string): string {
  const normalized = tag.toLowerCase()
  if (normalized === "recommended") return "border-emerald-200 bg-emerald-50 text-emerald-700"
  if (normalized === "removed") return "border-gray-200 bg-gray-50 text-gray-600"
  if (normalized === "system" || normalized === "system (other briefings)") return "border-gray-200 bg-gray-50 text-gray-700"
  if (normalized === "custom") return "border-blue-200 bg-blue-50 text-blue-700"
  if (normalized === "ai suggestions") return "border-violet-200 bg-violet-50 text-violet-700"
  return "border-gray-200 bg-gray-50 text-gray-700"
}

function buildDraftPayload(drafts: Record<string, ChannelDraftState>): DraftPayloadChannel[] {
  const rows: DraftPayloadChannel[] = []
  for (const [channelId, draft] of Object.entries(drafts)) {
    const numericChannelId = toNumber(channelId)
    if (!numericChannelId) continue
    const components = draft.selectedComponents
      .filter((component) => component.selected)
      .map((component, index) => toDraftPayloadComponent(component, index))
      .filter((component): component is DraftPayloadComponent => component !== null)
    rows.push({
      channel_id: numericChannelId,
      briefing_type_id: draft.briefingTypeId,
      primary_keyword: draft.primaryKeyword.trim() || null,
      secondary_keywords: draft.secondaryKeywords.map((keyword) => keyword.trim()).filter((keyword) => keyword.length > 0),
      seo_required_override: draft.seoRequiredOverride,
      components,
    })
  }
  return rows
}

const EMPTY_DRAFT: ChannelDraftState = {
  briefingTypeId: null,
  primaryKeyword: "",
  secondaryKeywords: [],
  seoRequiredOverride: null,
  briefingTypes: [],
  selectedComponents: [],
  availableComponents: [],
  aiSuggestions: [],
  isLoading: false,
  hasLoaded: false,
  hasLoadedAi: false,
  isRunningAi: false,
}

export function AddTaskChannelDraftPanel({
  channels,
  activeChannelIds,
  selectedTab,
  onSelectedTabChange,
  onRemoveChannel,
  onAddChannel,
  projectId,
  contentTypeId,
  contentTypeTitle,
  languageCode,
  title,
  briefing,
  notes,
  onDraftPayloadChange,
}: AddTaskChannelDraftPanelProps) {
  const router = useRouter()
  const supabase = React.useMemo(() => createClientComponentClient(), [])
  const railRef = React.useRef<HTMLDivElement | null>(null)
  const inflightLoadRef = React.useRef<Set<string>>(new Set())
  const inflightAiRef = React.useRef<Set<string>>(new Set())
  const latestLoadTokenByChannelRef = React.useRef<Record<string, symbol>>({})
  const latestContextRef = React.useRef<{ projectId: number | null; contentTypeId: number | null }>({
    projectId,
    contentTypeId,
  })
  const customCardRef = React.useRef<HTMLDivElement | null>(null)
  const [canScrollLeft, setCanScrollLeft] = React.useState(false)
  const [canScrollRight, setCanScrollRight] = React.useState(false)
  const [draftsByChannel, setDraftsByChannel] = React.useState<Record<string, ChannelDraftState>>({})
  const [customTitle, setCustomTitle] = React.useState("")
  const [customDescription, setCustomDescription] = React.useState("")
  const [draggingSelectedKey, setDraggingSelectedKey] = React.useState<string | null>(null)
  const [componentEdits, setComponentEdits] = React.useState<Record<string, { title: string; description: string }>>({})
  const [editingComponent, setEditingComponent] = React.useState<{ key: string; field: "title" | "description" } | null>(null)

  React.useEffect(() => {
    latestContextRef.current = { projectId, contentTypeId }
  }, [projectId, contentTypeId])

  const updateScrollState = React.useCallback(() => {
    const node = railRef.current
    if (!node) return
    setCanScrollLeft(node.scrollLeft > 8)
    setCanScrollRight(node.scrollLeft + node.clientWidth < node.scrollWidth - 8)
  }, [])

  React.useEffect(() => {
    updateScrollState()
    const node = railRef.current
    if (!node) return
    node.addEventListener("scroll", updateScrollState)
    window.addEventListener("resize", updateScrollState)
    return () => {
      node.removeEventListener("scroll", updateScrollState)
      window.removeEventListener("resize", updateScrollState)
    }
  }, [updateScrollState])

  React.useEffect(() => {
    if (channels.length === 0 && selectedTab !== "all") onSelectedTabChange("all")
  }, [channels, selectedTab, onSelectedTabChange])

  React.useEffect(() => {
    if (selectedTab === "all") return
    if (!activeChannelIds.includes(selectedTab)) onSelectedTabChange("all")
  }, [activeChannelIds, onSelectedTabChange, selectedTab])

  React.useEffect(() => {
    setComponentEdits({})
    setEditingComponent(null)
  }, [selectedTab])

  React.useEffect(() => {
    updateScrollState()
  }, [channels.length, activeChannelIds.length, selectedTab, updateScrollState])

  React.useEffect(() => {
    const payload = buildDraftPayload(draftsByChannel)
    onDraftPayloadChange(payload.length > 0 ? payload : null)
  }, [draftsByChannel, onDraftPayloadChange])

  const loadDraftForChannel = React.useCallback(
    async (channelId: string, overrideBriefingTypeId?: number | null) => {
      if (!projectId || !contentTypeId) return
      const requestProjectId = projectId
      const requestContentTypeId = contentTypeId
      const requestToken = Symbol(`load-${channelId}`)
      latestLoadTokenByChannelRef.current[channelId] = requestToken
      const requestKey = `${projectId}:${contentTypeId}:${channelId}:${overrideBriefingTypeId ?? "default"}`
      if (inflightLoadRef.current.has(requestKey)) return
      inflightLoadRef.current.add(requestKey)
      setDraftsByChannel((prev) => ({
        ...prev,
        [channelId]: {
          ...(prev[channelId] || EMPTY_DRAFT),
          isLoading: true,
          hasLoaded: false,
          hasLoadedAi: false,
        },
      }))

      try {
        const { data: briefingRows, error: briefingError } = await supabase.rpc("project_channel_briefing_types", {
          p_project_id: requestProjectId,
          p_content_type_id: requestContentTypeId,
          p_channel_id: Number(channelId),
        })
        if (briefingError) throw briefingError
        if (latestLoadTokenByChannelRef.current[channelId] !== requestToken) return
        if (
          latestContextRef.current.projectId !== requestProjectId ||
          latestContextRef.current.contentTypeId !== requestContentTypeId
        ) {
          return
        }

        const { options, defaultBriefingTypeId } = mapBriefingTypes((briefingRows || []) as any[])
        const effectiveBriefingTypeId = overrideBriefingTypeId ?? defaultBriefingTypeId

        const [selectedRes, availableRes] = await Promise.all([
          supabase.rpc("tc_components_for_draft_channel", {
            p_project_id: requestProjectId,
            p_content_type_id: requestContentTypeId,
            p_channel_id: Number(channelId),
            p_briefing_type_id: effectiveBriefingTypeId,
          }),
          supabase.rpc("tc_available_components_for_draft_channel", {
            p_project_id: requestProjectId,
            p_content_type_id: requestContentTypeId,
            p_channel_id: Number(channelId),
            p_briefing_type_id: effectiveBriefingTypeId,
          }),
        ])
        if (selectedRes.error) throw selectedRes.error
        if (availableRes.error) throw availableRes.error
        if (latestLoadTokenByChannelRef.current[channelId] !== requestToken) return
        if (
          latestContextRef.current.projectId !== requestProjectId ||
          latestContextRef.current.contentTypeId !== requestContentTypeId
        ) {
          return
        }

        const selectedComponents = ((selectedRes.data || []) as any[]).map((row, index) => {
          const mapped = mapComponentRow(row, index)
          return { ...mapped, selected: mapped.selected !== false }
        })
        const availableComponents = ((availableRes.data || []) as any[]).map((row, index) => ({
          ...mapComponentRow(row, index),
          selected: false,
        }))

        setDraftsByChannel((prev) => {
          const previous = prev[channelId] || EMPTY_DRAFT
          return {
            ...prev,
            [channelId]: {
              ...previous,
              briefingTypeId: effectiveBriefingTypeId,
              briefingTypes: options,
              selectedComponents,
              availableComponents,
              aiSuggestions: [],
              isLoading: false,
              hasLoaded: true,
              hasLoadedAi: false,
            },
          }
        })
      } catch (error) {
        console.error("Failed to load draft channel components:", error)
        setDraftsByChannel((prev) => ({
          ...prev,
          [channelId]: {
            ...(prev[channelId] || EMPTY_DRAFT),
            isLoading: false,
            hasLoaded: true,
          },
        }))
      } finally {
        inflightLoadRef.current.delete(requestKey)
        if (latestLoadTokenByChannelRef.current[channelId] === requestToken) {
          delete latestLoadTokenByChannelRef.current[channelId]
        }
      }
    },
    [contentTypeId, projectId, supabase]
  )

  React.useEffect(() => {
    if (selectedTab === "all") return
    if (!projectId || !contentTypeId) return
    const existing = draftsByChannel[selectedTab]
    if (!existing) {
      loadDraftForChannel(selectedTab)
      return
    }
    if (existing.isLoading) return
    if (existing.hasLoaded) return
    loadDraftForChannel(selectedTab)
  }, [selectedTab, draftsByChannel, loadDraftForChannel, projectId, contentTypeId])

  React.useEffect(() => {
    setDraftsByChannel({})
    latestLoadTokenByChannelRef.current = {}
    inflightLoadRef.current = new Set()
  }, [projectId, contentTypeId])

  const selectedDraft = selectedTab === "all" ? null : draftsByChannel[selectedTab] || EMPTY_DRAFT
  const groupedBriefingTypes = React.useMemo(
    () => splitBriefingTypeOptions(selectedDraft?.briefingTypes || []),
    [selectedDraft?.briefingTypes]
  )
  const mergedAvailable = React.useMemo(() => {
    if (!selectedDraft) return []
    const selectedKeys = new Set(selectedDraft.selectedComponents.map((item) => item.key))
    const all = [...selectedDraft.availableComponents, ...selectedDraft.aiSuggestions]
    return all.filter((item) => !selectedKeys.has(item.key))
  }, [selectedDraft])
  const activeChannels = React.useMemo(
    () => channels.filter((channel) => activeChannelIds.includes(channel.id)),
    [activeChannelIds, channels]
  )
  const inactiveChannels = React.useMemo(
    () => channels.filter((channel) => !activeChannelIds.includes(channel.id)),
    [activeChannelIds, channels]
  )

  const setChannelDraft = React.useCallback((channelId: string, updater: (state: ChannelDraftState) => ChannelDraftState) => {
    setDraftsByChannel((prev) => ({
      ...prev,
      [channelId]: updater(prev[channelId] || EMPTY_DRAFT),
    }))
  }, [])

  const handleBriefingTypeSelection = React.useCallback(
    async (channelId: string, option: BriefingTypeOption) => {
      if (!projectId || !contentTypeId) return

      try {
        const didAdd = await ensureBriefingTypeAssignedToChannel({
          supabase,
          projectId,
          contentTypeId,
          channelId: Number(channelId),
          option,
        })

        setChannelDraft(channelId, (draft) => ({ ...draft, briefingTypeId: option.id }))
        await loadDraftForChannel(channelId, option.id)

        if (didAdd) {
          toast({
            title: "Briefing added to channel",
            description: "This briefing is now assigned to the selected channel.",
          })
        }
      } catch (error: any) {
        console.error("Failed to set briefing type on draft channel:", error)
        toast({
          title: "Failed to set briefing type",
          description: error?.message || "Could not update the briefing type for this channel.",
          variant: "destructive",
        })
      }
    },
    [contentTypeId, loadDraftForChannel, projectId, setChannelDraft, supabase]
  )

  const runAiSuggestions = React.useCallback(async (channelId: string, append: boolean) => {
    if (!projectId || !contentTypeId) return
    const draft = draftsByChannel[channelId]
    if (!draft) return
    const requestKey = `${projectId}:${contentTypeId}:${channelId}`
    if (inflightAiRef.current.has(requestKey)) return
    inflightAiRef.current.add(requestKey)
    setChannelDraft(channelId, (current) => ({ ...current, isRunningAi: true }))
    try {
      const body = {
        project_id: projectId,
        content_type_id: contentTypeId,
        channel_id: Number(channelId),
        briefing_type_id: draft.briefingTypeId,
        title,
        briefing,
        notes,
        content_type_title: contentTypeTitle,
        language_code: languageCode,
        current_components: draft.selectedComponents,
        existing_suggestions: draft.aiSuggestions,
      }
      const response = await supabase.functions.invoke("ai-draft-task-component-suggestions-run", {
        body,
      })
      if (response.error) throw response.error
      const rawSuggestions = Array.isArray(response.data)
        ? response.data
        : Array.isArray((response.data as any)?.suggestions)
          ? (response.data as any).suggestions
          : Array.isArray((response.data as any)?.data)
            ? (response.data as any).data
            : []
      const mappedSuggestions: DraftComponent[] = rawSuggestions.map((row: any, index: number) => ({
        ...mapComponentRow(
          {
            ...row,
            kind: "ai_suggestion",
            tag: row?.tag || "AI suggestions",
          },
          index
        ),
        selected: false,
      }))
      setChannelDraft(channelId, (current) => {
        const nextSuggestions = append ? [...current.aiSuggestions, ...mappedSuggestions] : mappedSuggestions
        const deduped: DraftComponent[] = Array.from(
          new Map(nextSuggestions.map((item: DraftComponent) => [item.key, item])).values()
        )
        return {
          ...current,
          aiSuggestions: deduped,
          isRunningAi: false,
          hasLoadedAi: true,
        }
      })
    } catch (err) {
      console.error("Failed to run AI suggestions:", err)
      setChannelDraft(channelId, (current) => ({ ...current, isRunningAi: false, hasLoadedAi: true }))
    } finally {
      inflightAiRef.current.delete(requestKey)
    }
  }, [
    briefing,
    contentTypeId,
    contentTypeTitle,
    draftsByChannel,
    inflightAiRef,
    languageCode,
    notes,
    projectId,
    setChannelDraft,
    supabase,
    title,
  ])

  React.useEffect(() => {
    if (selectedTab === "all" || !selectedDraft) return
    if (!selectedDraft.hasLoaded || selectedDraft.hasLoadedAi || selectedDraft.isRunningAi) return
    runAiSuggestions(selectedTab, false)
  }, [runAiSuggestions, selectedDraft, selectedTab])

  const handleRunAiSuggestions = React.useCallback(async () => {
    if (selectedTab === "all") return
    await runAiSuggestions(selectedTab, true)
  }, [runAiSuggestions, selectedTab])

  const addAvailableComponent = React.useCallback(
    (component: DraftComponent) => {
      if (selectedTab === "all") return
      setChannelDraft(selectedTab, (draft) => {
        if (draft.selectedComponents.some((existing) => existing.key === component.key)) return draft
        const asSelected: DraftComponent =
          component.kind === "ai_suggestion"
            ? {
                ...component,
                kind: "task_ad_hoc",
                briefing_component_id: null,
                project_component_id: null,
                tag: "Custom",
              }
            : component
        return {
          ...draft,
          selectedComponents: [
            ...draft.selectedComponents,
            {
              ...asSelected,
              selected: true,
              position: draft.selectedComponents.length + 1,
            },
          ],
          availableComponents: draft.availableComponents.filter((item) => item.key !== component.key),
          aiSuggestions: draft.aiSuggestions.filter((item) => item.key !== component.key),
        }
      })
    },
    [selectedTab, setChannelDraft]
  )

  const excludeSelectedComponent = React.useCallback(
    (componentKey: string) => {
      if (selectedTab === "all") return
      setChannelDraft(selectedTab, (draft) => {
        const component = draft.selectedComponents.find((item) => item.key === componentKey)
        if (!component) return draft
        return {
          ...draft,
          selectedComponents: draft.selectedComponents
            .filter((item) => item.key !== componentKey)
            .map((item, idx) => ({ ...item, position: idx + 1 })),
          availableComponents: [
            { ...component, selected: false, tag: component.tag || "Removed", position: null },
            ...draft.availableComponents.filter((item) => item.key !== componentKey),
          ],
        }
      })
    },
    [selectedTab, setChannelDraft]
  )

  const reorderSelectedComponents = React.useCallback(
    (sourceKey: string, targetKey: string) => {
      if (selectedTab === "all" || sourceKey === targetKey) return
      setChannelDraft(selectedTab, (draft) => {
        const sourceIndex = draft.selectedComponents.findIndex((item) => item.key === sourceKey)
        const targetIndex = draft.selectedComponents.findIndex((item) => item.key === targetKey)
        if (sourceIndex < 0 || targetIndex < 0) return draft
        const next = [...draft.selectedComponents]
        const [moved] = next.splice(sourceIndex, 1)
        next.splice(targetIndex, 0, moved)
        return {
          ...draft,
          selectedComponents: next.map((item, idx) => ({ ...item, position: idx + 1 })),
        }
      })
    },
    [selectedTab, setChannelDraft]
  )

  const commitComponentEdit = React.useCallback(
    (componentKey: string) => {
      if (selectedTab === "all") return
      const edit = componentEdits[componentKey]
      if (!edit) return
      setChannelDraft(selectedTab, (draft) => ({
        ...draft,
        selectedComponents: draft.selectedComponents.map((component) =>
          component.key === componentKey
            ? {
                ...component,
                custom_title: edit.title.trim() || component.custom_title || component.title,
                custom_description: edit.description.trim() || null,
              }
            : component
        ),
      }))
      setComponentEdits((prev) => {
        const next = { ...prev }
        delete next[componentKey]
        return next
      })
    },
    [componentEdits, selectedTab, setChannelDraft]
  )

  const addSecondaryKeyword = React.useCallback(() => {
    if (selectedTab === "all") return
    setChannelDraft(selectedTab, (draft) => ({
      ...draft,
      secondaryKeywords: [...draft.secondaryKeywords, ""],
    }))
  }, [selectedTab, setChannelDraft])

  const updateSecondaryKeyword = React.useCallback(
    (index: number, value: string) => {
      if (selectedTab === "all") return
      setChannelDraft(selectedTab, (draft) => ({
        ...draft,
        secondaryKeywords: draft.secondaryKeywords.map((keyword, idx) => (idx === index ? value : keyword)),
      }))
    },
    [selectedTab, setChannelDraft]
  )

  const removeSecondaryKeyword = React.useCallback(
    (keywordIndex: number) => {
      if (selectedTab === "all") return
      setChannelDraft(selectedTab, (draft) => ({
        ...draft,
        secondaryKeywords: draft.secondaryKeywords.filter((_, idx) => idx !== keywordIndex),
      }))
    },
    [selectedTab, setChannelDraft]
  )

  const addCustomComponent = React.useCallback(() => {
    if (selectedTab === "all") return
    const trimmedTitle = customTitle.trim()
    if (!trimmedTitle) return
    setChannelDraft(selectedTab, (draft) => ({
      ...draft,
      selectedComponents: [
        ...draft.selectedComponents,
        {
          key: `custom:${Date.now()}:${Math.random()}`,
          title: trimmedTitle,
          description: customDescription.trim() || null,
          custom_title: trimmedTitle,
          custom_description: customDescription.trim() || null,
          tag: "Custom",
          kind: "task_ad_hoc",
          selected: true,
          position: draft.selectedComponents.length + 1,
          briefing_component_id: null,
          project_component_id: null,
          purpose: null,
          guidance: null,
          suggested_word_count: null,
          subheads: null,
        },
      ],
    }))
    setCustomTitle("")
    setCustomDescription("")
  }, [customDescription, customTitle, selectedTab, setChannelDraft])

  return (
    <div className={cn("w-full space-y-3", selectedTab !== "all" && "h-full min-h-0 flex flex-col")}>
      <div className="flex items-center gap-2">
        {canScrollLeft ? (
          <Button
            type="button"
            size="icon"
            variant="ghost"
            className="h-7 w-7 shrink-0"
            onClick={() => railRef.current?.scrollBy({ left: -180, behavior: "smooth" })}
            aria-label="Scroll channels left"
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
        ) : null}
        <div ref={railRef} className="flex-1 min-w-0 overflow-x-auto scrollbar-hide">
          <div className="inline-flex items-center gap-1.5 min-w-max">
            <button
              type="button"
              onClick={() => onSelectedTabChange("all")}
              className={cn(
                "inline-flex items-center gap-1 h-7 px-2.5 rounded-full text-sm transition-colors",
                selectedTab === "all" ? "bg-gray-100 text-gray-900" : "text-gray-500"
              )}
            >
              All
            </button>
            {activeChannels.map((channel) => (
              <span
                key={channel.id}
                className={cn(
                  "inline-flex items-center gap-1 h-7 px-2.5 rounded-full text-sm transition-colors",
                  selectedTab === channel.id ? "bg-gray-100 text-gray-900" : "text-gray-500"
                )}
              >
                <button type="button" onClick={() => onSelectedTabChange(channel.id)} className="leading-none">
                  {channel.label}
                </button>
                {activeChannelIds.includes(channel.id) ? (
                  <button
                    type="button"
                    onClick={(event) => {
                      event.stopPropagation()
                      onRemoveChannel(channel.id)
                    }}
                    className="text-gray-500 hover:text-red-600 p-0.5 -mr-0.5"
                    aria-label={`Remove ${channel.label}`}
                    title={`Remove ${channel.label}`}
                  >
                    ×
                  </button>
                ) : null}
              </span>
            ))}
            {inactiveChannels.length > 0 ? (
              <Popover>
                <PopoverTrigger asChild>
                  <button
                    type="button"
                    className="inline-flex items-center gap-1 h-7 px-2 rounded-full text-sm text-gray-500 hover:bg-gray-100"
                    aria-label="Add channel"
                    title="Add channel"
                  >
                    <Plus className="w-3.5 h-3.5" />
                  </button>
                </PopoverTrigger>
                <PopoverContent
                  side="bottom"
                  align="start"
                  sideOffset={6}
                  collisionPadding={12}
                  className="z-[1200] w-56 p-2"
                >
                  <div className="space-y-1 max-h-56 overflow-y-auto">
                    {inactiveChannels.map((channel) => (
                      <button
                        key={`inactive-${channel.id}`}
                        type="button"
                        className="w-full text-left px-2 py-1.5 text-sm rounded hover:bg-gray-50"
                        onClick={() => {
                          onAddChannel(channel.id)
                          onSelectedTabChange(channel.id)
                        }}
                      >
                        {channel.label}
                      </button>
                    ))}
                  </div>
                </PopoverContent>
              </Popover>
            ) : null}
          </div>
        </div>
        {canScrollRight ? (
          <Button
            type="button"
            size="icon"
            variant="ghost"
            className="h-7 w-7 shrink-0"
            onClick={() => railRef.current?.scrollBy({ left: 180, behavior: "smooth" })}
            aria-label="Scroll channels right"
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        ) : null}
      </div>

      {selectedTab !== "all" && selectedDraft ? (
        <div className="min-h-0 flex-1 overflow-hidden">
          <div className="h-full min-h-0 flex flex-col">
            <div className="min-h-0 flex-1 overflow-y-auto pr-1 space-y-3">
              <div className="space-y-1">
                <label className="text-xs text-gray-500">Briefing type</label>
                <div className="flex items-center gap-1">
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <div
                        role="button"
                        tabIndex={0}
                        onKeyDown={(event) => {
                          if (event.key === "Enter" || event.key === " ") {
                            event.preventDefault()
                            ;(event.currentTarget as HTMLDivElement).click()
                          }
                        }}
                        className="h-10 min-h-10 w-full rounded-md border border-gray-200 text-sm leading-none px-3 flex items-center justify-between bg-white cursor-pointer"
                      >
                        <span className="truncate">
                          {selectedDraft.briefingTypes.find((option) => option.id === selectedDraft.briefingTypeId)?.title || "Select"}
                        </span>
                        <span className="flex items-center gap-1 shrink-0">
                          {selectedDraft.briefingTypeId != null ? (
                            <span
                              role="button"
                              tabIndex={0}
                              onClick={(event) => {
                                event.stopPropagation()
                                setChannelDraft(selectedTab, (draft) => ({
                                  ...draft,
                                  briefingTypeId: null,
                                  selectedComponents: [],
                                  availableComponents: [],
                                  aiSuggestions: [],
                                  isLoading: false,
                                  hasLoaded: true,
                                  hasLoadedAi: false,
                                }))
                              }}
                              onKeyDown={(event) => {
                                if (event.key !== "Enter" && event.key !== " ") return
                                event.preventDefault()
                                event.stopPropagation()
                                setChannelDraft(selectedTab, (draft) => ({
                                  ...draft,
                                  briefingTypeId: null,
                                  selectedComponents: [],
                                  availableComponents: [],
                                  aiSuggestions: [],
                                  isLoading: false,
                                  hasLoaded: true,
                                  hasLoadedAi: false,
                                }))
                              }}
                              className="p-0.5 rounded hover:bg-gray-100 text-gray-400 hover:text-gray-600"
                              aria-label="Reset briefing type"
                            >
                              <X className="w-3.5 h-3.5" />
                            </span>
                          ) : null}
                          <ChevronDown className="w-3.5 h-3.5" />
                        </span>
                      </div>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent className="z-[1400] w-[min(90vw,24rem)] max-w-full">
                      {groupedBriefingTypes.assigned.length > 0 ? (
                        <>
                          <DropdownMenuItem disabled className="text-xs font-medium text-gray-500 opacity-100">
                            Assigned to this channel
                          </DropdownMenuItem>
                          {groupedBriefingTypes.assigned.map((option) => (
                            <DropdownMenuItem
                              key={option.id}
                              onClick={() => {
                                if (option.id === selectedDraft.briefingTypeId) return
                                void handleBriefingTypeSelection(selectedTab, option)
                              }}
                            >
                              <div className="flex w-full items-center justify-between gap-2">
                                <span className="truncate">{option.title}</span>
                                {option.isDefaultForChannel ? (
                                  <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[10px] uppercase tracking-wide text-gray-600">
                                    Default
                                  </span>
                                ) : null}
                              </div>
                            </DropdownMenuItem>
                          ))}
                        </>
                      ) : null}
                      {groupedBriefingTypes.available.length > 0 ? (
                        <>
                          <DropdownMenuItem disabled className="text-xs font-medium text-gray-500 opacity-100">
                            Available in project
                          </DropdownMenuItem>
                          {groupedBriefingTypes.available.map((option) => (
                            <DropdownMenuItem
                              key={option.id}
                              onClick={() => {
                                if (option.id === selectedDraft.briefingTypeId) return
                                void handleBriefingTypeSelection(selectedTab, option)
                              }}
                            >
                              <div className="flex min-w-0 flex-col">
                                <span className="truncate">{option.title}</span>
                                <span className="text-xs text-gray-500">Will be added to this channel</span>
                              </div>
                            </DropdownMenuItem>
                          ))}
                        </>
                      ) : null}
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        onClick={() => {
                          if (!projectId) return
                          router.push(`/projects/${projectId}/briefings`)
                        }}
                      >
                        Manage briefings
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onClick={() =>
                          toast({
                            title: "Import briefing",
                            description: "Use project briefings to import and manage templates.",
                          })
                        }
                      >
                        Import briefing
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onClick={() => {
                          if (selectedDraft.briefingTypeId == null) return
                          loadDraftForChannel(selectedTab, selectedDraft.briefingTypeId)
                        }}
                      >
                        Refresh components
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </div>
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-gray-500">Selected components</span>
                </div>
                {selectedDraft.selectedComponents.length === 0 ? (
                  <div className="border border-dashed rounded-md px-3 py-2 text-xs text-gray-500">No components selected.</div>
                ) : (
                  <div className="space-y-2">
                    {selectedDraft.selectedComponents.map((component) => (
                      (() => {
                        const isEditingThis = editingComponent?.key === component.key
                        return (
                      <div
                        key={component.key}
                        onDragOver={(event) => event.preventDefault()}
                        onDrop={() => {
                          if (!draggingSelectedKey) return
                          reorderSelectedComponents(draggingSelectedKey, component.key)
                          setDraggingSelectedKey(null)
                        }}
                        className={cn(
                          "border rounded-md px-1.5 py-2 bg-white",
                          isEditingThis ? "min-h-[96px] h-auto" : COMPONENT_CARD_HEIGHT_CLASS,
                          draggingSelectedKey === component.key && "opacity-60"
                        )}
                      >
                        <div className="flex items-start gap-2 h-full">
                          <button
                            type="button"
                            draggable
                            onDragStart={() => setDraggingSelectedKey(component.key)}
                            onDragEnd={() => setDraggingSelectedKey(null)}
                            className="mt-0.5 p-1 text-gray-400 cursor-grab active:cursor-grabbing"
                            aria-label="Reorder component"
                            title="Drag to reorder"
                          >
                            <GripVertical className="w-4 h-4" />
                          </button>
                          <div className={cn("min-w-0 flex-1 h-full", isEditingThis ? "overflow-visible" : "overflow-hidden")}>
                            {editingComponent?.key === component.key && editingComponent.field === "title" ? (
                              <Input
                                autoFocus
                                value={componentEdits[component.key]?.title ?? component.custom_title ?? component.title}
                                onChange={(event) =>
                                  setComponentEdits((prev) => ({
                                    ...prev,
                                    [component.key]: {
                                      title: event.target.value,
                                      description:
                                        prev[component.key]?.description ??
                                        component.custom_description ??
                                        component.description ??
                                        "",
                                    },
                                  }))
                                }
                                onBlur={() => {
                                  commitComponentEdit(component.key)
                                  setEditingComponent((prev) =>
                                    prev?.key === component.key && prev.field === "title" ? null : prev
                                  )
                                }}
                                className="text-sm font-medium border-none p-0 h-auto focus-visible:ring-1 focus-visible:ring-black focus-visible:border-none bg-transparent"
                              />
                            ) : (
                              <button
                                type="button"
                                onClick={() => setEditingComponent({ key: component.key, field: "title" })}
                                className="w-full text-left"
                              >
                                <div className="text-sm font-medium text-gray-900 truncate">
                                  {component.custom_title || component.title}
                                </div>
                              </button>
                            )}
                            {editingComponent?.key === component.key && editingComponent.field === "description" ? (
                              <textarea
                                autoFocus
                                value={componentEdits[component.key]?.description ?? component.custom_description ?? component.description ?? ""}
                                onChange={(event) =>
                                  setComponentEdits((prev) => ({
                                    ...prev,
                                    [component.key]: {
                                      title: prev[component.key]?.title ?? component.custom_title ?? component.title,
                                      description: event.target.value,
                                    },
                                  }))
                                }
                                onBlur={() => {
                                  commitComponentEdit(component.key)
                                  setEditingComponent((prev) =>
                                    prev?.key === component.key && prev.field === "description" ? null : prev
                                  )
                                }}
                                className="w-full text-xs text-gray-500 mt-1 bg-transparent border-none resize-none p-0 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-black focus-visible:border-none overflow-y-auto"
                                rows={2}
                              />
                            ) : (
                              <button
                                type="button"
                                onClick={() => setEditingComponent({ key: component.key, field: "description" })}
                                className="w-full text-left mt-1"
                              >
                                <div className="text-xs text-gray-500 line-clamp-2">
                                  {(component.custom_description || component.description || "").trim() || "Add description..."}
                                </div>
                              </button>
                            )}
                          </div>
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            className="h-7 text-xs"
                            onClick={() => excludeSelectedComponent(component.key)}
                          >
                            Exclude
                          </Button>
                        </div>
                      </div>
                        )
                      })()
                    ))}
                  </div>
                )}
              </div>

              <div className="space-y-2">
                <div
                  ref={customCardRef}
                  className={cn("border rounded-lg px-2 py-2 bg-white border-gray-200", COMPONENT_CARD_HEIGHT_CLASS)}
                  onBlurCapture={(event) => {
                    const nextTarget = event.relatedTarget as Node | null
                    if (nextTarget && customCardRef.current?.contains(nextTarget)) return
                    addCustomComponent()
                  }}
                >
                  <div className="flex items-start gap-3">
                    <div className="p-1 rounded mt-1 text-gray-300">
                      <Plus className="w-3 h-3" />
                    </div>
                    <div className="flex-1 min-w-0 space-y-2">
                      <Input
                        value={customTitle}
                        onChange={(event) => setCustomTitle(event.target.value)}
                        className="text-sm font-semibold border-none p-0 h-auto focus:ring-0 focus:border-none bg-transparent"
                        placeholder="Create a custom component…"
                      />
                      <Input
                        value={customDescription}
                        onChange={(event) => setCustomDescription(event.target.value)}
                        placeholder="Component description"
                        className="text-xs h-auto p-0 border-none bg-transparent focus:ring-0 focus:border-none"
                      />
                    </div>
                  </div>
                </div>
              </div>

              <div className="space-y-2">
                <div className="text-xs text-gray-500">SEO keywords</div>
                <div className="space-y-2">
                  <Input
                    value={selectedDraft.primaryKeyword}
                    onChange={(event) =>
                      setChannelDraft(selectedTab, (draft) => ({
                        ...draft,
                        primaryKeyword: event.target.value,
                      }))
                    }
                    placeholder="Primary keyword"
                    className="h-8 text-sm"
                  />
                  {selectedDraft.secondaryKeywords.length > 0 ? (
                    <div className="space-y-1">
                      {selectedDraft.secondaryKeywords.map((keyword, index) => (
                        <div key={`secondary-${index}`} className="flex items-center gap-2 text-xs">
                          <Input
                            value={keyword}
                            onChange={(event) => updateSecondaryKeyword(index, event.target.value)}
                            placeholder={`Secondary keyword ${index + 1}`}
                            className="h-8 text-sm"
                          />
                          <button
                            type="button"
                            onClick={() => removeSecondaryKeyword(index)}
                            className="text-gray-500 hover:text-red-600"
                            aria-label={`Remove secondary keyword ${index + 1}`}
                          >
                            ×
                          </button>
                        </div>
                      ))}
                    </div>
                  ) : null}
                  <button
                    type="button"
                    onClick={addSecondaryKeyword}
                    className="text-xs text-gray-500 hover:text-gray-700"
                  >
                    + Add secondary keyword
                  </button>
                </div>
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs text-gray-500">Available to add</span>
                </div>
                {mergedAvailable.length === 0 ? (
                  <div className="border border-dashed rounded-md px-3 py-2 text-xs text-gray-500">
                    No available components for this channel + briefing type.
                  </div>
                ) : (
                  <div className="space-y-2">
                    {mergedAvailable.map((component) => (
                      <div key={component.key} className={cn("border rounded-md px-1.5 py-2 bg-white", COMPONENT_CARD_HEIGHT_CLASS)}>
                        <div className="flex items-start gap-2 h-full">
                          <div className="min-w-0 flex-1 h-full overflow-hidden">
                            <div className="flex items-center gap-2 flex-wrap">
                              <div className="text-sm font-medium text-gray-900 truncate">
                                {component.custom_title || component.title}
                              </div>
                              <span className={cn("text-[10px] px-2 py-0.5 rounded-full border", tagBadgeClass(categoryForComponent(component)))}>
                                {categoryForComponent(component)}
                              </span>
                            </div>
                            {component.custom_description || component.description ? (
                              <div className="text-xs text-gray-500 mt-0.5 line-clamp-2">
                                {component.custom_description || component.description}
                              </div>
                            ) : null}
                          </div>
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            className="h-7 text-xs"
                            onClick={() => addAvailableComponent(component)}
                          >
                            Add
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
                <div className="pt-1">
                  <button
                    type="button"
                    onClick={handleRunAiSuggestions}
                    disabled={selectedDraft.isRunningAi || selectedDraft.isLoading}
                    className="inline-flex items-center text-xs text-gray-500 hover:text-gray-700 disabled:opacity-50"
                  >
                    {selectedDraft.isRunningAi ? <Loader2 className="w-3 h-3 mr-1 animate-spin" /> : <Sparkles className="w-3 h-3 mr-1" />}
                    {selectedDraft.isRunningAi ? "Refreshing suggestions..." : "Refresh suggestions"}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}
