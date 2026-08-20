"use client"

import { useEffect, useState } from "react"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { getArtifact } from "../../app/lib/services/artifacts"
import { peekArtifactCollabSession } from "../../app/lib/collaboration/provider-registry"
import { isYDocEditoriallyEmpty } from "../../app/lib/collaboration/empty-ydoc"
import { yDocToHtml } from "../../app/lib/collaboration/ydoc-content"
import { extractPrimaryArtifactHtml } from "../../app/lib/artifact-selection-patch"
import type { ArtifactContentJson } from "../../app/lib/artifacts/artifact-types"
import { findCachedArtifactSnapshot } from "./artifact-query-cache"

const COLLAB_MIRROR_DEBOUNCE_MS = 120

function htmlFromOpenCollabSession(artifactId: string): string | null {
  const session = peekArtifactCollabSession(artifactId)
  if (!session || isYDocEditoriallyEmpty(session.document)) return null
  const html = yDocToHtml(session.document).trim()
  if (!html || html === "<p></p>") return null
  return html
}

export type MirroredArtifactBody = {
  contentJson: ArtifactContentJson | null
  contentText: string | null
  html: string | null
}

/**
 * Chat preview after-body: the same artifact the pane shows (React Query +
 * open Y.Doc). Does not acquire a collab session and never reads worker
 * section_html / stream snippets.
 */
export function useMirroredArtifactBody(args: {
  artifactId: string
  enabled?: boolean
}): MirroredArtifactBody {
  const artifactId = args.artifactId.trim()
  const enabled = Boolean(artifactId) && args.enabled !== false
  const queryClient = useQueryClient()

  const artifactQuery = useQuery({
    queryKey: ["artifact", artifactId, "current"],
    queryFn: () => getArtifact({ artifactId }),
    enabled,
    staleTime: 8_000,
    placeholderData: () => {
      const cached = findCachedArtifactSnapshot(queryClient, artifactId)
      if (!cached) return undefined
      return {
        ok: true as const,
        artifact_id: artifactId,
        version_number: cached.current_version,
        snapshot: cached,
      }
    },
  })

  const [collabHtml, setCollabHtml] = useState<string | null>(() =>
    enabled ? htmlFromOpenCollabSession(artifactId) : null,
  )

  useEffect(() => {
    if (!enabled) {
      setCollabHtml(null)
      return
    }
    const session = peekArtifactCollabSession(artifactId)
    if (!session) {
      setCollabHtml(null)
      return
    }
    let timer: number | null = null
    const sync = () => {
      if (timer) window.clearTimeout(timer)
      timer = window.setTimeout(() => {
        setCollabHtml(htmlFromOpenCollabSession(artifactId))
      }, COLLAB_MIRROR_DEBOUNCE_MS)
    }
    session.document.on("update", sync)
    sync()
    return () => {
      session.document.off("update", sync)
      if (timer) window.clearTimeout(timer)
    }
  }, [artifactId, enabled])

  const snapshot = artifactQuery.data?.snapshot ?? null
  const contentJson = (snapshot?.content_json as ArtifactContentJson | null) ?? null
  const contentText = snapshot?.content_text ?? null
  const html =
    collabHtml
    || extractPrimaryArtifactHtml(contentJson)
    || (contentText?.trim() ? contentText : null)

  return { contentJson, contentText, html }
}
