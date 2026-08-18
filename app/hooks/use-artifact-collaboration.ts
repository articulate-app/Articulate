"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import type { TaskArtifact } from "../lib/artifacts/artifact-types"
import { presenceColor, type ArtifactCollabAuthorizeResult } from "../lib/collaboration/auth"
import { isCollaborativeRichTextEditorKind, resolveArtifactEditorKind } from "../lib/collaboration/editor-kind"
import { isArtifactCollabEnvEnabled } from "../lib/collaboration/feature-flag"
import { bindArtifactYdocLocalCache } from "../lib/collaboration/local-cache"
import type { ArtifactCollabPresence } from "../lib/collaboration/presence"
import {
  acquireArtifactCollabSession,
  releaseArtifactCollabSession,
} from "../lib/collaboration/provider-registry"
import { artifactHasExistingEditorContent } from "../lib/collaboration/seed-from-html"
import { createArtifactCollabProvider } from "../lib/collaboration/supabase-provider"
import { createSupabaseCollabTransport } from "../lib/collaboration/supabase-transport"
import type { SyncStatus } from "../lib/collaboration/sync-protocol"
import { getSupabaseBrowser } from "../../lib/supabase-browser"

function asAuthorize(value: unknown): ArtifactCollabAuthorizeResult {
  if (!value || typeof value !== "object") return { ok: false }
  return value as ArtifactCollabAuthorizeResult
}

export function useArtifactCollaboration(artifact: TaskArtifact | null | undefined) {
  const locallyEligible = isCollaborativeRichTextEditorKind(
    resolveArtifactEditorKind(artifact),
  )
  const envEnabled = isArtifactCollabEnvEnabled()
  const artifactId = artifact?.id ?? null
  const [enabled, setEnabled] = useState(false)
  const [status, setStatus] = useState<SyncStatus>("connecting")
  const [document, setDocument] = useState<import("yjs").Doc | null>(null)
  const [peers, setPeers] = useState<ArtifactCollabPresence[]>([])
  const sessionKeyRef = useRef<string | null>(null)

  useEffect(() => {
    if (!locallyEligible || !artifactId) {
      setEnabled(false)
      setDocument(null)
      setPeers([])
      return
    }

    let cancelled = false
    const supabase = getSupabaseBrowser()

    const start = async () => {
      const { data, error } = await supabase.rpc("artifact_collab_authorize_v1", {
        p_artifact_id: artifactId,
      })
      if (cancelled) return
      const authorize = asAuthorize(data)
      const serverEnabled = authorize.ok === true && authorize.collab_enabled === true
      if (error || !authorize.ok || (!serverEnabled && !envEnabled)) {
        setEnabled(false)
        setDocument(null)
        return
      }

      const { data: loaded, error: loadError } = await supabase.rpc("artifact_collab_load_document_v1", {
        p_artifact_id: artifactId,
        p_after_seq: 0,
      })
      if (cancelled) return
      const loadedRow = loaded && typeof loaded === "object" ? loaded as Record<string, unknown> : null
      const hasYdoc =
        typeof loadedRow?.snapshot_base64 === "string"
        && loadedRow.snapshot_base64.length > 0
        || (Array.isArray(loadedRow?.updates) && loadedRow.updates.length > 0)
      const hasExistingContent = artifactHasExistingEditorContent({
        contentJson: artifact?.content_json,
        contentText: artifact?.content_text,
      })
      if ((loadError || !hasYdoc) && hasExistingContent) {
        // Fail closed: never replace existing HTML with an empty Y.Doc.
        setEnabled(false)
        setDocument(null)
        return
      }

      const clientId =
        typeof crypto !== "undefined" && "randomUUID" in crypto
          ? crypto.randomUUID()
          : `${artifactId}:${Date.now()}`
      const presence: ArtifactCollabPresence = {
        userId: Number(authorize.user_id ?? 0),
        name: String(authorize.full_name ?? "User"),
        avatar: authorize.photo ?? null,
        color: presenceColor(Number(authorize.user_id ?? 0)),
        clientId,
        cursor: null,
        selection: null,
        editing: true,
      }

      if (cancelled) return

      const session = acquireArtifactCollabSession({
        artifactId,
        createProvider: ({ document: ydoc }) =>
          createArtifactCollabProvider({
            document: ydoc,
            clientId,
            readOnly: authorize.can_write !== true,
            transport: createSupabaseCollabTransport({
              supabase,
              artifactId,
              clientId,
              presence,
              onPresence: setPeers,
            }),
            onStatus: setStatus,
          }),
      })
      sessionKeyRef.current = artifactId
      setDocument(session.document)
      setEnabled(true)
      const cache = await bindArtifactYdocLocalCache(session.document, artifactId)
      if (cancelled) {
        cache?.destroy()
        return
      }
      void session.provider?.connect?.()
      return () => {
        cache?.destroy()
      }
    }

    let disposeCache: (() => void) | undefined
    void start().then((dispose) => {
      disposeCache = dispose
    })

    return () => {
      cancelled = true
      disposeCache?.()
      releaseArtifactCollabSession(artifactId)
      if (sessionKeyRef.current === artifactId) {
        sessionKeyRef.current = null
        setDocument(null)
        setEnabled(false)
        setPeers([])
      }
    }
  }, [artifact?.content_json, artifact?.content_text, artifactId, envEnabled, locallyEligible])

  return useMemo(
    () => ({
      enabled,
      document,
      status,
      peers,
    }),
    [document, enabled, peers, status],
  )
}
