"use client"

import React, { useEffect, useMemo, useRef, useState } from "react"
import { useQueryClient } from "@tanstack/react-query"
import { Loader2 } from "lucide-react"
import { cn } from "../../app/lib/utils"
import type {
  ArtifactAssetData,
  ArtifactContentJson,
  TaskArtifact,
} from "../../app/lib/artifacts/artifact-types"
import { saveWorkspaceArtifact } from "../../app/lib/services/artifacts"
import { extractArtifactOutline } from "./extract-artifact-outline"

export type ArtifactSeoDetailSection = "navigation" | "meta" | "prompts" | "images"

type EditableArtifactSeoSnapshot = Pick<
  TaskArtifact,
  | "id"
  | "title"
  | "content_text"
  | "content_json"
  | "asset_data"
  | "metadata"
  | "current_version"
  | "task_id"
  | "project_id"
  | "ai_thread_id"
>

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {}
}

function stringValue(value: unknown): string {
  if (typeof value === "string") return value
  if (Array.isArray(value)) return value.map((item) => String(item ?? "")).filter(Boolean).join("\n")
  return ""
}

function readMeta(metadata: Record<string, unknown> | null | undefined) {
  const root = record(metadata)
  const seo = record(root.seo)
  return {
    metaTitle: stringValue(seo.meta_title ?? root.meta_title),
    metaDescription: stringValue(seo.meta_description ?? root.meta_description),
    prompts: stringValue(root.prompts ?? root.ai_prompts ?? seo.prompts),
  }
}

function scopedArtifactRoot(artifactId: string): HTMLElement | null {
  if (typeof document === "undefined") return null
  const escaped = typeof CSS !== "undefined" && typeof CSS.escape === "function"
    ? CSS.escape(artifactId)
    : artifactId.replace(/["\\]/g, "\\$&")
  return document.querySelector<HTMLElement>(`[data-artifact-id="${escaped}"][data-ai-selectable="artifact"]`)
    ?? document.querySelector<HTMLElement>(`[data-artifact-id="${escaped}"] [data-ai-selectable="artifact"]`)
}

export function ArtifactNavigationPanel({
  artifactId,
  contentText,
  contentJson,
  className,
}: {
  artifactId: string
  contentText?: string | null
  contentJson?: ArtifactContentJson | null
  className?: string
}) {
  const outline = useMemo(
    () => extractArtifactOutline({ contentJson: contentJson ?? null, contentText: contentText ?? null }),
    [contentJson, contentText],
  )

  if (outline.length === 0) {
    return <p className={cn("text-sm text-gray-500", className)}>No headings yet.</p>
  }

  return (
    <ul className={cn("space-y-0.5", className)}>
      {outline.map((row) => (
        <li key={row.id}>
          <button
            type="button"
            className={cn(
              "flex w-full items-center gap-2 rounded px-1.5 py-1 text-left text-sm hover:bg-gray-50",
              row.level === 2 && "pl-4",
              row.level === 3 && "pl-7",
              row.level >= 4 && "pl-9",
            )}
            onClick={() => {
              const root = scopedArtifactRoot(artifactId)
              if (!root) return
              const target = row.text.trim().toLowerCase()
              const headings = Array.from(root.querySelectorAll<HTMLElement>("h1, h2, h3, h4"))
              const heading = headings.find((el) => (el.textContent ?? "").trim().toLowerCase() === target)
                ?? headings.find((el) => (el.textContent ?? "").trim().toLowerCase().includes(target))
              if (!heading) return
              heading.scrollIntoView({ behavior: "smooth", block: "center" })
              heading.classList.add("ring-2", "ring-amber-300", "rounded-sm")
              window.setTimeout(() => {
                heading.classList.remove("ring-2", "ring-amber-300", "rounded-sm")
              }, 1200)
            }}
          >
            <span className="w-5 shrink-0 text-[11px] text-gray-400">H{row.level}</span>
            <span className="truncate text-gray-800">{row.text}</span>
          </button>
        </li>
      ))}
    </ul>
  )
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return <label className="text-xs font-medium text-gray-500">{children}</label>
}

const inputClass = "min-h-9 w-full rounded-md border border-gray-200 bg-white px-2.5 py-1.5 text-sm text-gray-900 outline-none transition-colors placeholder:text-gray-400 focus:border-gray-400 disabled:bg-gray-50 disabled:text-gray-500"
const textareaClass = `${inputClass} resize-y`

export function ArtifactSeoDetailsPanel({
  artifact,
  section,
  readOnly = false,
  showArtifactTitle = false,
  className,
}: {
  artifact: EditableArtifactSeoSnapshot
  section: ArtifactSeoDetailSection
  readOnly?: boolean
  showArtifactTitle?: boolean
  className?: string
}) {
  const queryClient = useQueryClient()
  const initialMeta = useMemo(() => readMeta(artifact.metadata), [artifact.metadata])
  const [metaTitle, setMetaTitle] = useState(initialMeta.metaTitle)
  const [metaDescription, setMetaDescription] = useState(initialMeta.metaDescription)
  const [prompts, setPrompts] = useState(initialMeta.prompts)
  const [assetData, setAssetData] = useState<ArtifactAssetData | null>(artifact.asset_data ?? null)
  const [isSaving, setIsSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const versionRef = useRef(artifact.current_version ?? 0)
  const latestRef = useRef<EditableArtifactSeoSnapshot>(artifact)

  useEffect(() => {
    latestRef.current = artifact
    versionRef.current = Math.max(versionRef.current, artifact.current_version ?? 0)
    const next = readMeta(artifact.metadata)
    setMetaTitle(next.metaTitle)
    setMetaDescription(next.metaDescription)
    setPrompts(next.prompts)
    setAssetData(artifact.asset_data ?? null)
  }, [artifact.id, artifact.current_version, artifact.metadata, artifact.asset_data])

  const persist = async (patch: {
    metadata?: Record<string, unknown> | null
    assetData?: ArtifactAssetData | null
    summary: string
  }) => {
    if (readOnly || isSaving) return
    const current = latestRef.current
    const expectedVersion = Math.max(1, versionRef.current || current.current_version || 1)
    setIsSaving(true)
    setSaveError(null)
    try {
      const result = await saveWorkspaceArtifact({
        artifactId: current.id,
        expectedVersion,
        snapshot: {
          title: current.title,
          content_text: current.content_text,
          content_json: current.content_json,
          asset_data: patch.assetData !== undefined ? patch.assetData : current.asset_data,
          metadata: patch.metadata !== undefined ? patch.metadata : current.metadata,
        },
        changeSource: "manual",
        aiThreadId: current.ai_thread_id,
        changeSummary: patch.summary,
      })
      if (!("ok" in result) || result.ok !== true) {
        throw new Error("A newer artifact version exists. Reload and try again.")
      }
      versionRef.current = result.version_number
      latestRef.current = result.snapshot
      if (patch.assetData !== undefined) setAssetData(result.snapshot.asset_data ?? null)
      const savedMeta = readMeta(result.snapshot.metadata)
      setMetaTitle(savedMeta.metaTitle)
      setMetaDescription(savedMeta.metaDescription)
      setPrompts(savedMeta.prompts)
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["artifact", current.id] }),
        queryClient.invalidateQueries({ queryKey: ["task-artifacts"] }),
        queryClient.invalidateQueries({ queryKey: ["task-artifacts-meta"] }),
        queryClient.invalidateQueries({ queryKey: ["project-artifacts"] }),
      ])
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : "Could not save artifact SEO info")
    } finally {
      setIsSaving(false)
    }
  }

  const persistMeta = async (next: {
    metaTitle?: string
    metaDescription?: string
    prompts?: string
  }) => {
    const current = latestRef.current
    const root = { ...record(current.metadata) }
    const seo = { ...record(root.seo) }
    const nextMetaTitle = next.metaTitle ?? metaTitle
    const nextMetaDescription = next.metaDescription ?? metaDescription
    const nextPrompts = next.prompts ?? prompts
    seo.meta_title = nextMetaTitle.trim() || null
    seo.meta_description = nextMetaDescription.trim() || null
    root.seo = seo
    root.prompts = nextPrompts.trim() || null
    await persist({ metadata: root, summary: "Update artifact SEO info" })
  }

  const assets = Array.isArray(assetData?.assets) ? assetData!.assets! : []

  return (
    <div className={cn("space-y-3", className)}>
      {showArtifactTitle ? (
        <div className="flex items-center justify-between gap-2 border-b border-gray-100 pb-2">
          <span className="truncate text-sm font-medium text-gray-800">
            {artifact.title?.trim() || "Artifact"}
          </span>
          {isSaving ? <Loader2 className="h-3.5 w-3.5 animate-spin text-gray-400" /> : null}
        </div>
      ) : isSaving ? (
        <div className="flex justify-end"><Loader2 className="h-3.5 w-3.5 animate-spin text-gray-400" /></div>
      ) : null}

      {section === "navigation" ? (
        <ArtifactNavigationPanel
          artifactId={artifact.id}
          contentText={artifact.content_text}
          contentJson={artifact.content_json}
        />
      ) : null}

      {section === "meta" ? (
        <div className="grid gap-3">
          <div className="grid gap-1.5">
            <FieldLabel>Meta title</FieldLabel>
            <input
              value={metaTitle}
              onChange={(event) => setMetaTitle(event.target.value)}
              onBlur={() => void persistMeta({ metaTitle })}
              disabled={readOnly || isSaving}
              placeholder="Add meta title"
              className={inputClass}
            />
          </div>
          <div className="grid gap-1.5">
            <FieldLabel>Meta description</FieldLabel>
            <textarea
              value={metaDescription}
              onChange={(event) => setMetaDescription(event.target.value)}
              onBlur={() => void persistMeta({ metaDescription })}
              disabled={readOnly || isSaving}
              placeholder="Add meta description"
              rows={3}
              className={textareaClass}
            />
          </div>
        </div>
      ) : null}

      {section === "prompts" ? (
        <div className="grid gap-1.5">
          <FieldLabel>Prompts</FieldLabel>
          <textarea
            value={prompts}
            onChange={(event) => setPrompts(event.target.value)}
            onBlur={() => void persistMeta({ prompts })}
            disabled={readOnly || isSaving}
            placeholder="Add prompts or AI guidance for this artifact"
            rows={5}
            className={textareaClass}
          />
        </div>
      ) : null}

      {section === "images" ? (
        assets.length === 0 ? (
          <p className="text-sm text-gray-500">No image or media assets in this artifact.</p>
        ) : (
          <div className="space-y-4">
            {assets.map((asset, index) => {
              const label = asset.file_name || asset.caption || `Asset ${index + 1}`
              return (
                <div key={`${asset.attachment_id}:${index}`} className="space-y-2 rounded-md border border-gray-100 p-3">
                  <div className="truncate text-xs font-medium text-gray-700">{label}</div>
                  <div className="grid gap-1.5">
                    <FieldLabel>Alt text</FieldLabel>
                    <input
                      value={asset.alt_text ?? ""}
                      disabled={readOnly || isSaving}
                      placeholder="Add alt text"
                      className={inputClass}
                      onChange={(event) => {
                        const nextAssets = assets.map((entry, entryIndex) =>
                          entryIndex === index ? { ...entry, alt_text: event.target.value } : entry,
                        )
                        setAssetData({ ...(assetData ?? {}), assets: nextAssets })
                      }}
                      onBlur={() => {
                        const next = assetData ?? { assets }
                        void persist({ assetData: next, summary: "Update artifact image info" })
                      }}
                    />
                  </div>
                  <div className="grid gap-1.5">
                    <FieldLabel>Caption</FieldLabel>
                    <input
                      value={asset.caption ?? ""}
                      disabled={readOnly || isSaving}
                      placeholder="Add caption"
                      className={inputClass}
                      onChange={(event) => {
                        const nextAssets = assets.map((entry, entryIndex) =>
                          entryIndex === index ? { ...entry, caption: event.target.value } : entry,
                        )
                        setAssetData({ ...(assetData ?? {}), assets: nextAssets })
                      }}
                      onBlur={() => {
                        const next = assetData ?? { assets }
                        void persist({ assetData: next, summary: "Update artifact image info" })
                      }}
                    />
                  </div>
                  <div className="grid gap-1.5">
                    <FieldLabel>Role</FieldLabel>
                    <input
                      value={asset.role ?? ""}
                      disabled={readOnly || isSaving}
                      placeholder="e.g. hero, inline, thumbnail"
                      className={inputClass}
                      onChange={(event) => {
                        const nextAssets = assets.map((entry, entryIndex) =>
                          entryIndex === index ? { ...entry, role: event.target.value } : entry,
                        )
                        setAssetData({ ...(assetData ?? {}), assets: nextAssets })
                      }}
                      onBlur={() => {
                        const next = assetData ?? { assets }
                        void persist({ assetData: next, summary: "Update artifact image info" })
                      }}
                    />
                  </div>
                </div>
              )
            })}
          </div>
        )
      ) : null}

      {saveError ? <p className="text-xs text-red-600">{saveError}</p> : null}
    </div>
  )
}
