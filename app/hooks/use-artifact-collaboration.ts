"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import type { Awareness } from "y-protocols/awareness"
import type { TaskArtifact } from "../lib/artifacts/artifact-types"
import { presenceColor, type ArtifactCollabAuthorizeResult } from "../lib/collaboration/auth"
import {
  applyRemotePresenceToAwareness,
  getOrCreateArtifactAwareness,
  setLocalAwarenessUser,
} from "../lib/collaboration/awareness-bridge"
import { createIdleCheckpointScheduler } from "../lib/collaboration/checkpoints"
import { isCollaborativeRichTextEditorKind, resolveArtifactEditorKind } from "../lib/collaboration/editor-kind"
import { isArtifactCollabEnvEnabled } from "../lib/collaboration/feature-flag"
import { bindArtifactYdocLocalCache } from "../lib/collaboration/local-cache"
import type { ArtifactCollabPresence } from "../lib/collaboration/presence"
import { createDebouncedProjection, projectYDocToArtifact } from "../lib/collaboration/projection"
import {
  acquireArtifactCollabSession,
  releaseArtifactCollabSession,
} from "../lib/collaboration/provider-registry"
import { rememberArtifactCollabEnabled } from "../lib/collaboration/editor-sync"
import {
  isYDocEditoriallyEmpty,
  isYDocSnapshotEditoriallyEmpty,
  shouldHydrateEmptyYdocFromArtifact,
} from "../lib/collaboration/empty-ydoc"
import { artifactHasExistingEditorContent } from "../lib/collaboration/seed-from-html"
import {
  convertExistingArtifactToYDoc,
  seedExistingArtifact,
} from "../lib/collaboration/seed-existing-artifact"
import { createArtifactCollabProvider } from "../lib/collaboration/supabase-provider"
import { createSupabaseCollabTransport } from "../lib/collaboration/supabase-transport"
import type { SyncStatus } from "../lib/collaboration/sync-protocol"
import { getSupabaseBrowser } from "../../lib/supabase-browser"
import * as Y from "yjs"

function asAuthorize(value: unknown): ArtifactCollabAuthorizeResult {
  if (!value || typeof value !== "object") return { ok: false }
  return value as ArtifactCollabAuthorizeResult
}

export type CollabDisplayStatus = SyncStatus | "local"

export function useArtifactCollaboration(artifact: TaskArtifact | null | undefined) {
  const locallyEligible = isCollaborativeRichTextEditorKind(
    resolveArtifactEditorKind(artifact),
  )
  const envEnabled = isArtifactCollabEnvEnabled()
  const artifactId = artifact?.id ?? null
  const [enabled, setEnabled] = useState(false)
  const [status, setStatus] = useState<SyncStatus>("connecting")
  const [projectionStatus, setProjectionStatus] = useState<"idle" | "pending" | "projected" | "error">("idle")
  const [document, setDocument] = useState<import("yjs").Doc | null>(null)
  const [awareness, setAwareness] = useState<Awareness | null>(null)
  const [peers, setPeers] = useState<ArtifactCollabPresence[]>([])
  const [conflicts, setConflicts] = useState<Array<Record<string, unknown>>>([])
  const [seedError, setSeedError] = useState<string | null>(null)
  const sessionKeyRef = useRef<string | null>(null)
  const artifactRef = useRef(artifact)
  artifactRef.current = artifact
  const hasEditorContent = artifactHasExistingEditorContent({
    contentJson: artifact?.content_json,
    contentText: artifact?.content_text,
  })
  const localUser = useMemo(() => ({
    name: "You",
    color: "#2563eb",
  }), [])

  useEffect(() => {
    if (!locallyEligible || !artifactId) {
      setEnabled(false)
      setDocument(null)
      setAwareness(null)
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
      rememberArtifactCollabEnabled(artifactId, serverEnabled)
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
      const currentArtifact = artifactRef.current
      const loadedRow = loaded && typeof loaded === "object" ? loaded as Record<string, unknown> : null
      const loadedSnapshot = typeof loadedRow?.snapshot_base64 === "string" ? loadedRow.snapshot_base64 : ""
      const loadedHasUpdates = Array.isArray(loadedRow?.updates) && loadedRow.updates.length > 0
      const emptyOverContent =
        hasEditorContent
        && Number(loadedRow?.last_included_seq ?? 0) <= 0
        && !loadedHasUpdates
        && isYDocSnapshotEditoriallyEmpty(loadedSnapshot || null)
      const hasYdoc = (loadedSnapshot.length > 0 || loadedHasUpdates) && !emptyOverContent

      if (!hasYdoc) {
        const seeded = await seedExistingArtifact({
          supabase,
          artifactId,
          contentJson: currentArtifact?.content_json,
          contentText: currentArtifact?.content_text,
        })
        if (cancelled) return
        if (seeded.status === "failed") {
          setSeedError(seeded.error)
          setEnabled(false)
          setDocument(null)
          return
        }
        if (seeded.status !== "ready") {
          setEnabled(false)
          setDocument(null)
          return
        }
      } else if (loadError) {
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
      localUser.name = presence.name
      localUser.color = presence.color

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
              onPresence: (nextPeers) => {
                setPeers(nextPeers)
                const nextAwareness = getOrCreateArtifactAwareness(ydoc)
                applyRemotePresenceToAwareness(nextAwareness, nextPeers)
              },
            }),
            onStatus: setStatus,
          }),
      })
      if (cancelled) {
        releaseArtifactCollabSession(artifactId)
        return
      }
      const nextAwareness = getOrCreateArtifactAwareness(session.document)
      setLocalAwarenessUser(nextAwareness, {
        name: presence.name,
        color: presence.color,
      })
      sessionKeyRef.current = artifactId
      setDocument(session.document)
      setAwareness(nextAwareness)
      setEnabled(true)
      setSeedError(null)

      const projector = createDebouncedProjection({
        project: async () => {
          const provider = session.provider as { lastSeq?: number } | null
          setProjectionStatus("pending")
          const result = await projectYDocToArtifact({
            supabase,
            artifactId,
            document: session.document,
            seq: Number(provider?.lastSeq ?? 0),
            previousContentJson: artifactRef.current?.content_json ?? null,
            previousContentText: artifactRef.current?.content_text ?? null,
          })
          setProjectionStatus(result.ok ? "projected" : "error")
        },
      })
      const checkpoints = createIdleCheckpointScheduler({
        onIdle: () => {
          void import("../lib/collaboration/checkpoints").then(({ createArtifactCheckpoint }) => {
            const provider = session.provider as { lastSeq?: number } | null
            void createArtifactCheckpoint({
              supabase,
              artifactId,
              document: session.document,
              seq: Number(provider?.lastSeq ?? 0),
              changeSource: "manual",
              summary: "Idle editorial checkpoint",
            })
          })
        },
      })
      const onUpdate = (_update: Uint8Array, origin: unknown) => {
        if (origin === "remote" || origin === "load") return
        setStatus("syncing")
        projector.schedule()
        checkpoints.touch()
      }
      session.document.on("update", onUpdate)

      const { data: conflictRows } = await supabase.rpc("artifact_collab_list_conflicts_v1", {
        p_artifact_id: artifactId,
      })
      if (!cancelled && Array.isArray(conflictRows)) setConflicts(conflictRows)

      const cache = await bindArtifactYdocLocalCache(session.document, artifactId)
      if (cancelled) {
        cache?.destroy()
        releaseArtifactCollabSession(artifactId)
        return
      }
      void (async () => {
        try {
          await session.provider?.connect?.()
          if (cancelled) return
          const latest = artifactRef.current
          const provider = session.provider as { lastSeq?: number } | null
          if (
            shouldHydrateEmptyYdocFromArtifact({
              ydocEmpty: isYDocEditoriallyEmpty(session.document),
              hasExistingContent: artifactHasExistingEditorContent({
                contentJson: latest?.content_json,
                contentText: latest?.content_text,
              }),
              lastSeq: Number(provider?.lastSeq ?? 0),
            })
          ) {
            const converted = convertExistingArtifactToYDoc({
              contentJson: latest?.content_json,
              contentText: latest?.content_text,
            })
            if (!converted.error) {
              Y.applyUpdate(session.document, Y.encodeStateAsUpdate(converted.document))
            }
          }
        } catch {
          if (!cancelled) setStatus("error")
        }
      })()
      return () => {
        session.document.off("update", onUpdate)
        projector.cancel()
        checkpoints.cancel()
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
        setAwareness(null)
        setEnabled(false)
        setPeers([])
        setConflicts([])
      }
    }
  }, [artifactId, envEnabled, hasEditorContent, locallyEligible])

  const displayStatus: CollabDisplayStatus =
    status === "synced" && projectionStatus === "pending"
      ? "syncing"
      : status

  return useMemo(
    () => ({
      enabled,
      document,
      awareness,
      status: displayStatus,
      persistStatus: status,
      projectionStatus,
      peers,
      conflicts,
      seedError,
      user: localUser,
      flush: async () => {
        if (!artifactId) return
        const { flushAndProjectArtifact } = await import("../lib/collaboration/flush")
        await flushAndProjectArtifact({
          artifactId,
          project: async (seq) => {
            if (!document) return
            const supabase = getSupabaseBrowser()
            setProjectionStatus("pending")
            const result = await projectYDocToArtifact({
              supabase,
              artifactId,
              document,
              seq,
              previousContentJson: artifactRef.current?.content_json ?? null,
              previousContentText: artifactRef.current?.content_text ?? null,
            })
            setProjectionStatus(result.ok ? "projected" : "error")
          },
        })
      },
    }),
    [
      artifact?.content_json,
      artifactId,
      awareness,
      conflicts,
      displayStatus,
      document,
      enabled,
      localUser,
      peers,
      projectionStatus,
      seedError,
      status,
    ],
  )
}
