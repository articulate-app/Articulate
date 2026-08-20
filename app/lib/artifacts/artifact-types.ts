/**
 * Flexible multimedia artifacts (`task_artifacts`) — independent of task-channel component outputs.
 */

export type ArtifactStatus = "draft" | "ready" | "archived" | string

export function isArchivedArtifactStatus(status: string | null | undefined): boolean {
  return (status ?? "").trim().toLowerCase() === "archived"
}

export type ArtifactBlockType =
  | "heading"
  | "paragraph"
  | "rich_text"
  | "list"
  | "table"
  | "image"
  | "image_gallery"
  | "gallery"
  | "carousel"
  | "video"
  | "audio"
  | "file"
  | "attachment"

export type ArtifactListStyle = "bullet" | "ordered" | "checklist"

export type ArtifactBlock = {
  id?: string | null
  type: ArtifactBlockType | string
  text?: string | null
  html?: string | null
  level?: number | null
  items?: Array<string | { text?: string | null; checked?: boolean | null }>
  listStyle?: ArtifactListStyle | null
  rows?: Array<Array<string | null>>
  attachment_id?: string | null
  caption?: string | null
  alt?: string | null
  mime_type?: string | null
  file_name?: string | null
  [key: string]: unknown
}

export type ArtifactContentJson = {
  blocks?: ArtifactBlock[]
  [key: string]: unknown
}

export type ArtifactVisualIdentity = {
  type?: "image" | "video" | string | null
  provider?: string | null
  title?: string | null
  asset_url?: string | null
  preview_url?: string | null
  source_url?: string | null
  asset_id?: string | null
  verified?: true
}

export type ArtifactAsset = {
  attachment_id: string
  media_type?: "image" | "video" | "file" | string | null
  role?: string | null
  caption?: string | null
  alt_text?: string | null
  mime_type?: string | null
  file_name?: string | null
  width?: number | null
  height?: number | null
  duration_seconds?: number | null
  provider?: string | null
  asset_url?: string | null
  preview_url?: string | null
  source_url?: string | null
  asset_id?: string | null
  provenance?: (Record<string, unknown> & { visual?: ArtifactVisualIdentity }) | null
  [key: string]: unknown
}

export type ArtifactAssetData = {
  assets?: ArtifactAsset[]
  [key: string]: unknown
}

export type TaskArtifact = {
  id: string
  task_id: number | null
  project_id: number | null
  ai_thread_id: string | null
  artifact_type: string
  artifact_role: string | null
  title: string | null
  status: ArtifactStatus
  /** Manual display order within the list (lower first). */
  sort_order?: number | null
  channel_id: number | null
  language_id: number | null
  content_text: string | null
  content_json: ArtifactContentJson | null
  asset_data: ArtifactAssetData | null
  source_artifact_id: string | null
  source_version_number: number | null
  derivation_type: string | null
  current_version: number
  metadata: Record<string, unknown> | null
  content_preview?: string | null
  created_by?: number | null
  created_at?: string | null
  updated_at?: string | null
}

export function isVisibleWorkspaceArtifact(
  artifact: Pick<TaskArtifact, "status"> | null | undefined,
): boolean {
  return Boolean(artifact) && !isArchivedArtifactStatus(artifact?.status)
}

export type ArtifactVersionSummary = {
  version_number: number
  change_source: string | null
  changed_by: number | null
  ai_message_id: string | null
  ai_thread_id: string | null
  ai_run_id: string | null
  change_summary: string | null
  created_at: string | null
  title: string | null
  status: string | null
  content_preview: string | null
  previous_content_preview: string | null
  insert_count: number
  delete_count: number
  asset_count: number
  is_current: boolean
}

export type ArtifactVersionsListResult = {
  ok: true
  artifact_id: string
  current_version: number
  total: number
  limit: number
  offset: number
  versions: ArtifactVersionSummary[]
}

export type ProjectArtifactsListResult = {
  ok: true
  project_id: number
  project_name: string | null
  artifacts: TaskArtifact[]
}

export type ArtifactExportFormat = "docx" | "html" | "md" | "txt" | "json" | "original"

export type ArtifactChannelOption = {
  channel_id: number
  name: string
  attached: boolean
}

export type ArtifactLanguageOption = {
  language_id: number
  name: string
  is_primary: boolean
}

export type TaskArtifactsListResult = {
  ok: true
  task_id: number
  task_title: string | null
  project_id: number | null
  available_channels: ArtifactChannelOption[]
  available_languages: ArtifactLanguageOption[]
  artifacts: TaskArtifact[]
}

export type ThreadArtifactsListResult = {
  ok: true
  thread_id: string
  artifacts: TaskArtifact[]
}

export type ArtifactGetResult = {
  ok: true
  artifact_id: string
  version_number: number
  snapshot: TaskArtifact
}

export type ArtifactSaveResult = {
  ok: true
  artifact_id: string
  version_number: number
  snapshot: TaskArtifact
}

export type ArtifactAttachResult = {
  ok: true
  artifact: TaskArtifact
}

export type ArtifactRevisionConflict = {
  code: "artifact_revision_conflict"
  expected_version: number | null
  current_version: number | null
  message: string
}

/** Durable build event types for artifact units (merge by build_id + unit_id + artifact_id). */
export type ArtifactBuildEventType =
  | "artifact.plan_ready"
  | "artifact.started"
  | "artifact.context_loaded"
  | "artifact.structure_decided"
  | "artifact.asset_generated"
  | "artifact.media_started"
  | "artifact.media_item_started"
  | "artifact.media_item_saved"
  | "artifact.media_queued"
  | "artifact.media_progress"
  | "artifact.preview"
  | "artifact.version_saved"
  | "artifact.completed"
  | "artifact.failed"

/** Events that update the live artifact card (not plan/decision timeline rows). */
export const ARTIFACT_CARD_EVENT_TYPES = new Set<string>([
  "artifact.preview",
  "artifact.version_saved",
  "artifact.asset_generated",
  "artifact.media_started",
  "artifact.media_item_started",
  "artifact.media_item_saved",
  "artifact.media_queued",
  "artifact.media_progress",
])

/** Decision / progress events rendered as compact inline timeline entries. */
export const ARTIFACT_TIMELINE_DECISION_EVENT_TYPES = new Set<string>([
  "artifact.plan_ready",
  "artifact.started",
  "artifact.context_loaded",
  "artifact.structure_decided",
  "artifact.completed",
  "artifact.failed",
])

export type ArtifactSelectedContextType =
  | "artifact_text_selection"
  | "artifact_block"
  | "artifact_document"
  | "artifact_asset"
  | "artifact_image_point"
  | "artifact_image_rect"
  | "artifact_video_time"
  | "artifact_video_region"

export type ArtifactAnchorType =
  | "text_range"
  | "block"
  | "document"
  | "asset"
  | "image_point"
  | "image_rect"
  | "video_time"
  | "video_region"

/** Top-level `selected_artifact_context` sent with ai-chat. Selection is context, not an automatic edit. */
export type SelectedArtifactContext = {
  source_type: "task_artifact" | "artifact"
  artifact_id: string
  artifact_version_number: number
  anchor_type: ArtifactAnchorType
  block_id?: string | null
  selected_text?: string | null
  selection_before?: string | null
  selection_after?: string | null
  selection_start?: number | null
  selection_end?: number | null
  full_content_hash?: string | null
  attachment_id?: string | null
  anchor_x?: number | null
  anchor_y?: number | null
  anchor_width?: number | null
  anchor_height?: number | null
  anchor_time_start?: number | null
  anchor_time_end?: number | null
  title?: string | null
}

export type TaggedArtifactRef = {
  artifact_id: string
  artifact_version_number?: number | null
  title?: string | null
  task_id?: number | null
  project_id?: number | null
}

export type ArtifactCommentAnchor = {
  artifactId: string
  artifactVersionNumber: number
  anchorType: ArtifactAnchorType
  attachmentId?: string | null
  anchorStart?: number | null
  anchorEnd?: number | null
  anchorBlockKey?: string | null
  anchorQuote?: string | null
  anchorContextBefore?: string | null
  anchorContextAfter?: string | null
  anchorX?: number | null
  anchorY?: number | null
  anchorWidth?: number | null
  anchorHeight?: number | null
  anchorTimeStart?: number | null
  anchorTimeEnd?: number | null
  anchorData?: unknown
}

export function isArtifactRevisionConflictError(error: unknown): error is ArtifactRevisionConflict {
  if (!error || typeof error !== "object") return false
  const row = error as Record<string, unknown>
  return row.code === "artifact_revision_conflict"
}

export function extractArtifactBlocks(
  contentJson: ArtifactContentJson | null | undefined,
): ArtifactBlock[] {
  if (!contentJson || typeof contentJson !== "object") return []
  const blocks = contentJson.blocks
  if (!Array.isArray(blocks)) return []
  return blocks.filter((block): block is ArtifactBlock => !!block && typeof block === "object")
}

export function extractArtifactAssets(
  assetData: ArtifactAssetData | null | undefined,
): ArtifactAsset[] {
  if (!assetData || typeof assetData !== "object") return []
  const assets = assetData.assets
  if (!Array.isArray(assets)) return []
  return assets.filter(
    (asset): asset is ArtifactAsset =>
      !!asset
      && typeof asset === "object"
      && typeof asset.attachment_id === "string"
      && asset.attachment_id.trim().length > 0,
  )
}

export function collectAttachmentIdsFromArtifact(artifact: Pick<
  TaskArtifact,
  "content_json" | "asset_data"
>): string[] {
  const ids = new Set<string>()
  for (const block of extractArtifactBlocks(artifact.content_json)) {
    const id = typeof block.attachment_id === "string" ? block.attachment_id.trim() : ""
    if (id) ids.add(id)
  }
  for (const asset of extractArtifactAssets(artifact.asset_data)) {
    const id = asset.attachment_id.trim()
    if (id) ids.add(id)
  }
  return [...ids]
}
