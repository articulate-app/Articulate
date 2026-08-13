import {
  applyArtifactCenterSelectionParams,
  ARTIFACT_VERSION_PARAM,
  CENTER_ARTIFACT_ID_PARAM,
  clearArtifactCenterSelectionParams,
  getArtifactVersionFromParams,
  getCenterArtifactIdFromParams,
} from "./artifact-selection-url"
import {
  applySourceCenterSelectionParams,
  CENTER_SOURCE_ID_PARAM,
  clearSourceCenterSelectionParams,
  getCenterSourceIdFromParams,
} from "./source-selection-url"
import {
  applyTemplateCenterSelectionParams,
  CENTER_TEMPLATE_ID_PARAM,
  clearTemplateCenterSelectionParams,
  getCenterTemplateIdFromParams,
} from "./template-selection-url"

export type CenterPaneEntity =
  | "task"
  | "project"
  | "user"
  | "team"
  | "thread"
  | "artifact"
  | "source"
  | "template"

/** Unified Research middle-pane tool (Keywords + Prompts). */
export const RESEARCH_CENTER_VIEW = "research"
export const RESEARCH_TAB_PARAM = "researchTab"
export const RESEARCH_QUERY_PARAM = "rQuery"
export const RESEARCH_REGION_PARAM = "rRegion"

/** Create flow as a middle-pane tab (task / project / user / thread). */
export const CREATE_CENTER_VIEW = "create"
export const CREATE_TYPE_PARAM = "createType"
export type CreateCenterType = "task" | "project" | "user" | "thread"

/** @deprecated Prefer RESEARCH_CENTER_VIEW — kept for URL / event aliases. */
export const KEYWORD_RESEARCH_CENTER_VIEW = "keyword-research"
/** @deprecated Prefer RESEARCH_QUERY_PARAM. */
export const KEYWORD_RESEARCH_QUERY_PARAM = "krQuery"

/** @deprecated Prefer RESEARCH_CENTER_VIEW. */
export const PROMPT_RESEARCH_CENTER_VIEW = "prompt-research"
/** @deprecated Prefer RESEARCH_QUERY_PARAM. */
export const PROMPT_RESEARCH_QUERY_PARAM = "prQuery"

export type ResearchTab = "keywords" | "prompts"

export type ActiveCenterSelection =
  | { type: "task-suggestion"; id: string }
  | { type: "task"; id: string }
  | { type: "user"; id: string }
  | { type: "project"; id: string }
  | { type: "team"; id: string }
  | { type: "thread"; id: string }
  | { type: "artifact"; id: string; version: number | null }
  | { type: "source"; id: string }
  | { type: "template"; id: string }
  | { type: "research"; tab: ResearchTab }
  | { type: "create"; createType: CreateCenterType }
  /** @deprecated Normalized to research by callers when possible. */
  | { type: "keyword-research" }
  /** @deprecated Normalized to research by callers when possible. */
  | { type: "prompt-research" }

type ReadableParams = { get: (key: string) => string | null }

function nonEmpty(value: string | null): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value : null
}

export function parseResearchTab(value: string | null | undefined): ResearchTab {
  return value === "prompts" ? "prompts" : "keywords"
}

export function getResearchQueryFromParams(params: ReadableParams): string {
  return (
    nonEmpty(params.get(RESEARCH_QUERY_PARAM)) ||
    nonEmpty(params.get(KEYWORD_RESEARCH_QUERY_PARAM)) ||
    nonEmpty(params.get(PROMPT_RESEARCH_QUERY_PARAM)) ||
    ""
  )
}

export function getResearchTabFromParams(params: ReadableParams): ResearchTab {
  const centerView = params.get("centerView")
  if (centerView === PROMPT_RESEARCH_CENTER_VIEW) return "prompts"
  if (centerView === KEYWORD_RESEARCH_CENTER_VIEW) return "keywords"
  return parseResearchTab(params.get(RESEARCH_TAB_PARAM))
}

export function parseCreateCenterType(value: string | null | undefined): CreateCenterType {
  if (value === "project" || value === "user" || value === "thread") return value
  return "task"
}

export function getCreateCenterTypeFromParams(params: ReadableParams): CreateCenterType {
  return parseCreateCenterType(params.get(CREATE_TYPE_PARAM))
}

/**
 * Single source of truth for "what is selected in the center/detail pane", derived purely from URL
 * params. Used by desktop middle-pane rendering, mobile detail rendering + open detection, back/clear
 * logic, and row highlighting so every surface agrees on the active selection.
 *
 * A task suggestion (`itemKind=suggestion` + `centerSuggestionId`) is a first-class selection — it does
 * NOT require `centerTaskId`, `layout`, or `rightView` to be considered "open".
 */
export function getActiveCenterSelection(params: ReadableParams): ActiveCenterSelection | null {
  const itemKind = params.get("itemKind")
  const centerSuggestionId = nonEmpty(params.get("centerSuggestionId"))
  if (itemKind === "suggestion" && centerSuggestionId) {
    return { type: "task-suggestion", id: centerSuggestionId }
  }
  const centerTaskId = nonEmpty(params.get("centerTaskId"))
  if (centerTaskId) return { type: "task", id: centerTaskId }
  const centerUserId = nonEmpty(params.get("centerUserId"))
  if (centerUserId) return { type: "user", id: centerUserId }
  const centerProjectId = nonEmpty(params.get("centerProjectId"))
  if (centerProjectId) return { type: "project", id: centerProjectId }
  const centerTeamId = nonEmpty(params.get("centerTeamId"))
  if (centerTeamId) return { type: "team", id: centerTeamId }
  const centerThreadId = nonEmpty(params.get("centerThreadId"))
  if (centerThreadId) return { type: "thread", id: centerThreadId }
  const centerArtifactId = getCenterArtifactIdFromParams(params)
  if (centerArtifactId) {
    return {
      type: "artifact",
      id: centerArtifactId,
      version: getArtifactVersionFromParams(params),
    }
  }
  const centerSourceId = getCenterSourceIdFromParams(params)
  if (centerSourceId) {
    return { type: "source", id: centerSourceId }
  }
  const centerTemplateId = getCenterTemplateIdFromParams(params)
  if (centerTemplateId) {
    return { type: "template", id: centerTemplateId }
  }
  const centerView = params.get("centerView")
  if (centerView === CREATE_CENTER_VIEW) {
    return { type: "create", createType: getCreateCenterTypeFromParams(params) }
  }
  if (
    centerView === RESEARCH_CENTER_VIEW ||
    centerView === KEYWORD_RESEARCH_CENTER_VIEW ||
    centerView === PROMPT_RESEARCH_CENTER_VIEW
  ) {
    return { type: "research", tab: getResearchTabFromParams(params) }
  }
  return null
}

/** Clears every center-pane / detail selection param (used before setting a new selection). */
export function clearActiveCenterSelectionParams(next: URLSearchParams) {
  next.delete("itemKind")
  next.delete("centerSuggestionId")
  next.delete("centerTaskId")
  next.delete("centerUserId")
  next.delete("centerProjectId")
  next.delete("centerTeamId")
  next.delete("centerThreadId")
  next.delete("centerMentionId")
  next.delete("centerTab")
  next.delete("centerView")
  clearArtifactCenterSelectionParams(next)
  clearSourceCenterSelectionParams(next)
  clearTemplateCenterSelectionParams(next)
  next.delete(KEYWORD_RESEARCH_QUERY_PARAM)
  next.delete(PROMPT_RESEARCH_QUERY_PARAM)
  next.delete(RESEARCH_QUERY_PARAM)
  next.delete(RESEARCH_TAB_PARAM)
  next.delete(RESEARCH_REGION_PARAM)
  next.delete(CREATE_TYPE_PARAM)
  // Pane isolation: never clear right* from a middle-selection helper.
  next.delete("id")
}

function clearCenterPaneSelection(next: URLSearchParams) {
  next.delete("centerTaskId")
  next.delete("centerProjectId")
  next.delete("centerUserId")
  next.delete("centerTeamId")
  next.delete("centerThreadId")
  next.delete("centerMentionId")
  next.delete("centerTab")
  next.delete("centerView")
  clearArtifactCenterSelectionParams(next)
  clearSourceCenterSelectionParams(next)
  clearTemplateCenterSelectionParams(next)
  next.delete(KEYWORD_RESEARCH_QUERY_PARAM)
  next.delete(PROMPT_RESEARCH_QUERY_PARAM)
  next.delete(RESEARCH_QUERY_PARAM)
  next.delete(RESEARCH_TAB_PARAM)
  next.delete(RESEARCH_REGION_PARAM)
  next.delete(CREATE_TYPE_PARAM)
}

function clearGenericSelection(next: URLSearchParams) {
  next.delete("entity")
  next.delete("id")
  next.delete("tab")
  next.delete("detailType")
  next.delete("detailId")
  next.delete("briefingTypeId")
  next.delete("threadId")
  next.delete("mentionId")
}

function clearCenterSplitLayout(next: URLSearchParams) {
  next.delete("split")
  next.delete("splitView")
  next.delete("topView")
  next.delete("bottomView")
}

export function buildCenterPaneSelectionSearchParams(args: {
  currentSearchParams: URLSearchParams
  entity: CenterPaneEntity
  id: string | number
  tab?: string | null
  /** Focused mention within a thread (center-pane thread selection). */
  mentionId?: string | number | null
  /** Optional artifact version when entity is "artifact". Not part of tab identity. */
  version?: number | null
  /** Open artifact version history panel when entity is "artifact". */
  openHistory?: boolean
}): URLSearchParams {
  const {
    currentSearchParams,
    entity,
    id,
    tab,
    mentionId = null,
    version = null,
    openHistory = false,
  } = args
  const next = new URLSearchParams(currentSearchParams.toString())
  clearGenericSelection(next)
  clearCenterPaneSelection(next)
  // Pane isolation: do not clear right* — middle opens must not mutate the right pane.
  clearCenterSplitLayout(next)
  next.delete("itemKind")
  next.delete("centerSuggestionId")
  next.delete("stackTeamId")
  // Ensure details/middle is visible without wiping an existing left/middle/right layout.
  const layout = new Set((next.get("layout") || "left,middle").split(",").filter(Boolean))
  layout.add("middle")
  // Opening a center selection must not drop the left object list (e.g. mentions → calendar).
  // Solo-right AI focus stays solo-right only when there was never a left/top column.
  if (!layout.has("left") && !layout.has("top") && layout.has("right") && next.get("layout") === "right") {
    next.set("layout", "middle,right")
  } else {
    if (!layout.has("left") && !layout.has("top")) {
      layout.add("left")
    }
    next.set("layout", Array.from(layout).join(","))
  }

  if (entity === "task") {
    next.set("centerTaskId", String(id))
    return next
  }
  if (entity === "project") {
    next.set("centerProjectId", String(id))
    if (tab && tab !== "overview") next.set("centerTab", tab)
    else next.delete("centerTab")
    return next
  }
  if (entity === "user") {
    next.set("centerUserId", String(id))
    if (tab && tab !== "overview") next.set("centerTab", tab)
    else next.delete("centerTab")
    return next
  }
  if (entity === "team") {
    next.set("centerTeamId", String(id))
    if (tab && tab !== "overview") next.set("centerTab", tab)
    else next.delete("centerTab")
    return next
  }
  if (entity === "artifact") {
    applyArtifactCenterSelectionParams(next, {
      artifactId: String(id),
      version,
      openHistory,
    })
    return next
  }
  if (entity === "source") {
    applySourceCenterSelectionParams(next, { sourceId: String(id) })
    return next
  }
  if (entity === "template") {
    applyTemplateCenterSelectionParams(next, { workspaceId: String(id) })
    return next
  }

  next.set("centerThreadId", String(id))
  if (mentionId != null && String(mentionId).trim()) {
    next.set("centerMentionId", String(mentionId))
  } else {
    next.delete("centerMentionId")
  }
  return next
}

function applyResearchCenterParams(
  next: URLSearchParams,
  args: {
    tab?: ResearchTab | null
    query?: string | null
    regionId?: string | null
  },
) {
  next.set("centerView", RESEARCH_CENTER_VIEW)
  const tab = args.tab === "prompts" ? "prompts" : "keywords"
  next.set(RESEARCH_TAB_PARAM, tab)
  next.delete(KEYWORD_RESEARCH_QUERY_PARAM)
  next.delete(PROMPT_RESEARCH_QUERY_PARAM)
  const trimmedQuery = typeof args.query === "string" ? args.query.trim() : ""
  if (trimmedQuery) next.set(RESEARCH_QUERY_PARAM, trimmedQuery)
  else next.delete(RESEARCH_QUERY_PARAM)
  const regionId = typeof args.regionId === "string" ? args.regionId.trim() : ""
  if (regionId) next.set(RESEARCH_REGION_PARAM, regionId)
  else next.delete(RESEARCH_REGION_PARAM)
}

function applyCreateCenterParams(
  next: URLSearchParams,
  createType: CreateCenterType | null | undefined,
) {
  next.set("centerView", CREATE_CENTER_VIEW)
  next.set(CREATE_TYPE_PARAM, parseCreateCenterType(createType))
}

/** Apply a middle-pane tab selection (including suggestions) onto URL search params. */
export function buildCenterPaneTabSelectionSearchParams(args: {
  currentSearchParams: URLSearchParams
  kind:
    | "task"
    | "suggestion"
    | "project"
    | "user"
    | "team"
    | "thread"
    | "artifact"
    | "source"
    | "template"
    | "research"
    | "create"
    | "keyword-research"
    | "prompt-research"
  id: string | number
  /** Optional artifact version (viewer state only; not part of tab key). */
  artifactVersion?: number | null
  /** Optional seed query for Research (shared Keywords / Prompts). */
  researchQuery?: string | null
  researchTab?: ResearchTab | null
  researchRegionId?: string | null
  /** Create flow type when kind is "create". */
  createType?: CreateCenterType | null
  /** Optional project/user/team detail tab (centerTab). */
  tab?: string | null
  /** @deprecated Use researchQuery. */
  keywordQuery?: string | null
  /** @deprecated Use researchQuery. */
  promptQuery?: string | null
}): URLSearchParams {
  const {
    currentSearchParams,
    kind,
    id,
    artifactVersion = null,
    researchQuery = null,
    researchTab = null,
    researchRegionId = null,
    createType = null,
    tab = null,
    keywordQuery = null,
    promptQuery = null,
  } = args

  if (kind === "create") {
    const next = new URLSearchParams(currentSearchParams.toString())
    clearGenericSelection(next)
    clearCenterPaneSelection(next)
    // Pane isolation: do not clear right*.
    clearCenterSplitLayout(next)
    next.delete("itemKind")
    next.delete("centerSuggestionId")
    next.delete("stackTeamId")
    const layout = new Set((next.get("layout") || "left,middle").split(",").filter(Boolean))
    layout.add("middle")
    next.set("layout", Array.from(layout).join(","))
    applyCreateCenterParams(next, createType)
    return next
  }

  if (kind === "research" || kind === "keyword-research" || kind === "prompt-research") {
    const next = new URLSearchParams(currentSearchParams.toString())
    clearGenericSelection(next)
    clearCenterPaneSelection(next)
    // Pane isolation: do not clear right*.
    clearCenterSplitLayout(next)
    next.delete("itemKind")
    next.delete("centerSuggestionId")
    next.delete("stackTeamId")
    const layout = new Set((next.get("layout") || "left,middle").split(",").filter(Boolean))
    layout.add("middle")
    next.set("layout", Array.from(layout).join(","))
    const tab: ResearchTab =
      researchTab ??
      (kind === "prompt-research" ? "prompts" : "keywords")
    const query =
      (typeof researchQuery === "string" && researchQuery.trim()) ||
      (typeof keywordQuery === "string" && keywordQuery.trim()) ||
      (typeof promptQuery === "string" && promptQuery.trim()) ||
      ""
    applyResearchCenterParams(next, {
      tab,
      query,
      regionId: researchRegionId,
    })
    return next
  }
  if (kind === "suggestion") {
    const next = new URLSearchParams(currentSearchParams.toString())
    clearGenericSelection(next)
    clearCenterPaneSelection(next)
    // Pane isolation: do not clear right*.
    clearCenterSplitLayout(next)
    const layout = new Set((next.get("layout") || "left,middle").split(",").filter(Boolean))
    layout.add("middle")
    next.set("layout", Array.from(layout).join(","))
    next.set("itemKind", "suggestion")
    next.set("centerSuggestionId", String(id))
    next.delete("centerTaskId")
    next.delete("stackTeamId")
    return next
  }
  return buildCenterPaneSelectionSearchParams({
    currentSearchParams,
    entity: kind,
    id,
    tab,
    version: kind === "artifact" ? artifactVersion : null,
  })
}

export { ARTIFACT_VERSION_PARAM, CENTER_ARTIFACT_ID_PARAM, CENTER_SOURCE_ID_PARAM, CENTER_TEMPLATE_ID_PARAM }
