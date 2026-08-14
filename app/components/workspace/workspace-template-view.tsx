"use client"

/**
 * Brand layout template detail — opens as a workspace pane tab (like task / artifact).
 * Word → rich text; HTML / link → in-pane HTML preview; Browser remains optional.
 */

import { useEffect, useMemo, useState } from "react"
import { useQuery } from "@tanstack/react-query"
import {
  Download,
  FileCode2,
  FileText,
  Loader2,
} from "lucide-react"
import { formatCompactDateDisplay } from "@/lib/utils"
import { getImageUrl } from "../../lib/public-media"
import { fetchDocxHtmlFromUrl } from "../../lib/docx-to-html"
import { fetchHtmlPreviewFromUrl } from "../../lib/fetch-html-preview"
import {
  fetchProjectTemplateDetail,
} from "../../lib/services/project-templates"
import {
  parseTemplateWorkspaceId,
} from "../../lib/template-selection-url"
import {
  isDocxTemplateAsset,
  isLinkTemplateAsset,
  pickPrimaryTemplateAsset,
  templateAssetHref,
  templateAssetViewKind,
} from "../../lib/template-asset-view"
import type { ProjectDesignTemplateAsset } from "../../lib/project-brand-kit"
import { openWorkspaceView } from "../../lib/open-workspace-view"
import type { WorkspacePaneId } from "../../lib/workspace-view"
import { useCenterPaneTabsStore, buildCenterPaneTabKey } from "../../store/center-pane-tabs"
import { useRightPaneTabsStore } from "../../store/right-pane-tabs"
import { useLeftPaneTabsStore } from "../../store/left-pane-tabs"
import { ObjectPaneScrollShell, objectPaneCenteredStateClass } from "../search/object-pane-content"
import { RichTextEditor } from "../editor/RichTextEditor"
import { ArtifactHtmlDocumentView } from "../../../features/artifacts/artifact-html-document-view"

export type WorkspaceTemplateViewProps = {
  /** Composite id: `{projectId}:{templateId}`. */
  workspaceId: string
  paneId: WorkspacePaneId
  /** @deprecated Close lives on the tab strip. */
  onClose?: () => void
  onResolvedTitle?: (title: string) => void
}

function looksLikeImagePath(value: string | null | undefined): boolean {
  return /\.(png|jpe?g|webp|gif|avif)(\?|#|$)/i.test(value ?? "")
}

function assetPreviewUrl(asset: ProjectDesignTemplateAsset): string | null {
  if (asset.media_type && asset.media_type !== "image" && asset.media_type !== "other") {
    return null
  }
  const fromStorage = asset.storage_path ? getImageUrl(asset.storage_path) : null
  const url = asset.url?.trim() || null
  const candidate = fromStorage || url
  if (!candidate) return null
  if (asset.media_type === "image") return candidate
  if (
    looksLikeImagePath(asset.storage_path) ||
    looksLikeImagePath(url) ||
    looksLikeImagePath(candidate)
  ) {
    return candidate
  }
  return null
}

function assetKindLabel(asset: ProjectDesignTemplateAsset): string {
  const kind = templateAssetViewKind(asset)
  if (kind === "video") return "Video"
  if (kind === "pdf") return "PDF"
  if (kind === "docx") return "Word"
  if (kind === "html") return "HTML"
  if (kind === "url") return "Link"
  if (kind === "image") return "Image"
  return "File"
}

function htmlExcerptFromNotes(notes: string | null | undefined): string | null {
  const raw = (notes ?? "").trim()
  if (!raw) return null
  const stripped = raw.replace(/^HTML excerpt:\s*/i, "").trim()
  if (!stripped) return null
  if (/<[a-z][\s\S]*>/i.test(stripped)) return stripped
  return null
}

function TemplateDocxPreview({ href }: { href: string }) {
  const htmlQuery = useQuery({
    queryKey: ["template-docx-html", href],
    queryFn: () => fetchDocxHtmlFromUrl(href),
    staleTime: 60_000,
  })

  if (htmlQuery.isLoading) {
    return (
      <div className={objectPaneCenteredStateClass()}>
        <Loader2 className="h-4 w-4 animate-spin" />
        Opening Word document…
      </div>
    )
  }

  if (htmlQuery.isError || !htmlQuery.data) {
    return (
      <div className={objectPaneCenteredStateClass()}>
        Unable to preview this Word document.
        <a
          href={href}
          target="_blank"
          rel="noreferrer"
          className="mt-2 text-xs text-sky-700 hover:underline"
        >
          Download file
        </a>
      </div>
    )
  }

  return (
    <div className="min-h-0 flex-1 overflow-auto px-4 py-4">
      <div className="mx-auto w-full max-w-3xl">
        <RichTextEditor
          value={htmlQuery.data}
          onChange={() => {}}
          readOnly
          showToolbar={false}
          showBubbleToolbar={false}
          flatSurface
          disableInlineMediaControls
          className="border-0 shadow-none"
          editorClassName="min-h-[240px] prose prose-sm max-w-none text-gray-900"
          forceContentKey={href}
        />
      </div>
    </div>
  )
}

function TemplateHtmlPreview({
  href,
  fallbackHtml,
  downloadFileName,
}: {
  href: string
  fallbackHtml?: string | null
  downloadFileName?: string
}) {
  const htmlQuery = useQuery({
    queryKey: ["template-html-preview", href],
    queryFn: () => fetchHtmlPreviewFromUrl(href),
    staleTime: 60_000,
    retry: 1,
  })

  const html = htmlQuery.data || fallbackHtml || null

  if (htmlQuery.isLoading && !html) {
    return (
      <div className={objectPaneCenteredStateClass()}>
        <Loader2 className="h-4 w-4 animate-spin" />
        Loading HTML preview…
      </div>
    )
  }

  if (!html) {
    return (
      <div className={objectPaneCenteredStateClass()}>
        <p className="text-sm text-gray-600">Unable to load HTML preview for this link.</p>
        <p className="mt-1 max-w-md truncate text-[11px] text-gray-400">{href}</p>
        <a
          href={href}
          download={downloadFileName || "template.html"}
          target="_blank"
          rel="noreferrer"
          className="mt-3 inline-flex items-center gap-1.5 rounded-md bg-gray-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-gray-800"
        >
          <Download className="h-3.5 w-3.5" />
          Download
        </a>
      </div>
    )
  }

  return (
    <div className="min-h-0 flex-1 overflow-auto">
      <ArtifactHtmlDocumentView
        html={html}
        readOnly
        variant="document"
        hideToolbar
        className="min-h-full"
      />
    </div>
  )
}

function TemplateAssetCard({
  asset,
}: {
  asset: ProjectDesignTemplateAsset
}) {
  const [imageFailed, setImageFailed] = useState(false)
  const preview = !imageFailed ? assetPreviewUrl(asset) : null
  const href = templateAssetHref(asset)
  const label = assetKindLabel(asset)
  const Icon =
    label === "HTML" ? FileCode2 : label === "Image" || label === "Video" ? null : FileText
  const downloadName =
    asset.title?.trim() ||
    (label === "HTML" ? "template.html" : label === "Word" ? "template.docx" : "template")

  const body = preview ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={preview}
      alt={asset.title || "Template asset"}
      className="h-full w-full object-contain bg-gray-50"
      onError={() => setImageFailed(true)}
    />
  ) : (
    <div className="flex h-full w-full flex-col items-center justify-center gap-2 bg-slate-50 text-slate-600">
      {Icon ? <Icon className="h-8 w-8" /> : <span className="text-2xl">▶</span>}
      <span className="text-xs font-medium uppercase tracking-wide">{label}</span>
      {asset.title ? (
        <span className="max-w-[90%] truncate px-3 text-[11px] text-slate-500">{asset.title}</span>
      ) : null}
    </div>
  )

  if (href) {
    return (
      <a
        href={href}
        download={downloadName}
        target="_blank"
        rel="noreferrer"
        className="group relative block aspect-[4/3] overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm transition-colors hover:border-gray-300"
      >
        {body}
        <span className="absolute right-2 top-2 inline-flex h-7 items-center gap-1 rounded-md bg-white/90 px-2 text-[11px] font-medium text-gray-700 opacity-0 shadow-sm transition-opacity group-hover:opacity-100">
          <Download className="h-3.5 w-3.5" />
          Download
        </span>
      </a>
    )
  }

  return (
    <div className="aspect-[4/3] overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm">
      {body}
    </div>
  )
}

export function WorkspaceTemplateView({
  workspaceId,
  paneId,
  onResolvedTitle,
}: WorkspaceTemplateViewProps) {
  const parsed = parseTemplateWorkspaceId(workspaceId)
  const updateCenterTitle = useCenterPaneTabsStore((s) => s.updateTitle)
  const updateRightTitle = useRightPaneTabsStore((s) => s.updateTab)
  const updateLeftTitle = useLeftPaneTabsStore((s) => s.updateTitle)

  const detailQuery = useQuery({
    queryKey: ["workspace-template-detail", parsed?.projectId, parsed?.templateId],
    queryFn: () =>
      fetchProjectTemplateDetail({
        projectId: parsed!.projectId,
        templateId: parsed!.templateId,
      }),
    enabled: Boolean(parsed),
    staleTime: 30_000,
  })

  const title =
    detailQuery.data?.template.title?.trim() ||
    (parsed ? "Untitled template" : "Template")

  const primaryAsset = useMemo(
    () => pickPrimaryTemplateAsset(detailQuery.data?.template.assets ?? []),
    [detailQuery.data?.template.assets],
  )
  const primaryKind = primaryAsset ? templateAssetViewKind(primaryAsset) : null
  const primaryHref = primaryAsset ? templateAssetHref(primaryAsset) : null
  const docxAssets = useMemo(
    () => (detailQuery.data?.template.assets ?? []).filter((asset) => isDocxTemplateAsset(asset)),
    [detailQuery.data?.template.assets],
  )
  const otherAssets = useMemo(
    () =>
      (detailQuery.data?.template.assets ?? []).filter(
        (asset) =>
          !isDocxTemplateAsset(asset) &&
          templateAssetViewKind(asset) !== "html" &&
          !isLinkTemplateAsset(asset),
      ),
    [detailQuery.data?.template.assets],
  )
  const notesHtmlFallback = htmlExcerptFromNotes(detailQuery.data?.template.notes)
  const downloadFileName = (() => {
    const base = title.replace(/[^\w\-]+/g, "-").replace(/^-|-$/g, "") || "template"
    if (primaryKind === "html") return `${base}.html`
    if (primaryKind === "docx") return `${base}.docx`
    if (primaryKind === "pdf") return `${base}.pdf`
    return base
  })()

  useEffect(() => {
    if (!detailQuery.data) return
    const nextTitle = detailQuery.data.template.title?.trim() || "Untitled template"
    onResolvedTitle?.(nextTitle)
    if (paneId === "middle") {
      updateCenterTitle(buildCenterPaneTabKey("template", workspaceId), nextTitle)
    } else if (paneId === "right") {
      updateRightTitle(`template:${workspaceId}`, { title: nextTitle })
    } else {
      updateLeftTitle(`template:${workspaceId}`, nextTitle)
    }
  }, [
    detailQuery.data,
    onResolvedTitle,
    paneId,
    updateCenterTitle,
    updateLeftTitle,
    updateRightTitle,
    workspaceId,
  ])

  if (!parsed) {
    return (
      <div className={objectPaneCenteredStateClass()}>Invalid template link.</div>
    )
  }

  const docxHref = docxAssets[0] ? templateAssetHref(docxAssets[0]) : null
  const showHtmlPreview =
    (primaryKind === "html" || primaryKind === "url") && Boolean(primaryHref)

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden bg-white">
      <div className="flex h-10 min-h-10 items-center gap-2 bg-white px-4">
        <div className="flex min-w-0 flex-1 items-center gap-2">
          {detailQuery.data ? (
            <button
              type="button"
              className="max-w-[40%] shrink-0 truncate text-left text-sm text-gray-500 hover:text-gray-800 hover:underline"
              onClick={() => {
                const detail = detailQuery.data
                if (!detail) return
                openWorkspaceView(
                  {
                    type: "project",
                    id: detail.projectId,
                    title: detail.projectName,
                  },
                  { pane: paneId === "left" ? "middle" : paneId, source: "template-detail-project" },
                )
              }}
            >
              {detailQuery.data.projectName}
            </button>
          ) : null}
          <div className="min-w-0 truncate text-sm font-medium text-gray-900">{title}</div>
        </div>
        {primaryHref ? (
          <a
            href={primaryHref}
            download={downloadFileName}
            target="_blank"
            rel="noreferrer"
            className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-gray-600 hover:bg-gray-100 hover:text-gray-900"
            aria-label="Download"
            title="Download"
          >
            <Download className="h-3.5 w-3.5" />
          </a>
        ) : null}
      </div>

      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
        {detailQuery.isLoading ? (
          <div className={objectPaneCenteredStateClass()}>
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading template…
          </div>
        ) : detailQuery.isError ? (
          <div className={objectPaneCenteredStateClass()}>Unable to load template.</div>
        ) : !detailQuery.data ? (
          <div className={objectPaneCenteredStateClass()}>Template not found.</div>
        ) : primaryKind === "docx" && docxHref ? (
          <TemplateDocxPreview href={docxHref} />
        ) : showHtmlPreview && primaryHref ? (
          <TemplateHtmlPreview
            href={primaryHref}
            fallbackHtml={notesHtmlFallback}
            downloadFileName={downloadFileName}
          />
        ) : (
          <ObjectPaneScrollShell>
            <div className="mx-auto w-full max-w-3xl space-y-5 px-4 py-5">
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-gray-500">
                <span>
                  {detailQuery.data.template.assets.length} asset
                  {detailQuery.data.template.assets.length === 1 ? "" : "s"}
                </span>
                {detailQuery.data.template.created_at ? (
                  <span>
                    Created {formatCompactDateDisplay(detailQuery.data.template.created_at) || "—"}
                  </span>
                ) : null}
              </div>

              {detailQuery.data.template.notes?.trim() ? (
                <p className="whitespace-pre-wrap text-sm leading-relaxed text-gray-700">
                  {detailQuery.data.template.notes.trim()}
                </p>
              ) : null}

              {docxAssets.length > 0 ? (
                <div className="space-y-3">
                  {docxAssets.map((asset) => {
                    const href = templateAssetHref(asset)
                    if (!href) return null
                    return (
                      <div key={asset.id} className="overflow-hidden rounded-lg border border-gray-200">
                        <div className="border-b border-gray-100 px-3 py-2 text-xs font-medium text-gray-700">
                          {asset.title || "Word document"}
                        </div>
                        <div className="max-h-[70vh] overflow-auto">
                          <TemplateDocxPreview href={href} />
                        </div>
                      </div>
                    )
                  })}
                </div>
              ) : null}

              {otherAssets.length === 0 && docxAssets.length === 0 ? (
                <div className="rounded-lg border border-dashed border-gray-200 bg-gray-50/60 px-4 py-10 text-center text-sm text-gray-500">
                  This template has no assets yet.
                </div>
              ) : otherAssets.length > 0 ? (
                <ul className="grid gap-3 sm:grid-cols-2">
                  {otherAssets.map((asset) => (
                    <li key={asset.id}>
                      <TemplateAssetCard asset={asset} />
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
          </ObjectPaneScrollShell>
        )}
      </div>
    </div>
  )
}
