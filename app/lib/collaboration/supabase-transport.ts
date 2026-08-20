import type { RealtimeChannel, SupabaseClient } from "@supabase/supabase-js"
import { base64ToBytes, bytesToBase64, decodeBroadcastPayload } from "./binary"
import type { ArtifactCollabPresence } from "./presence"
import { presenceFromState } from "./presence"
import { artifactCollaborationRoom } from "./room"
import type { LoadDocumentResult, PersistUpdateResult } from "./sync-protocol"
import type { ArtifactCollabTransport } from "./supabase-provider"

const UPDATE_EVENT = "ydoc-update"

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null
}

export function createSupabaseCollabTransport(args: {
  supabase: SupabaseClient
  artifactId: string
  clientId?: string
  presence?: ArtifactCollabPresence | null
  onPresence?: (peers: ArtifactCollabPresence[]) => void
}): ArtifactCollabTransport {
  const room = artifactCollaborationRoom(args.artifactId)
  let channel: RealtimeChannel | null = null

  const syncPresence = () => {
    if (!channel || !args.onPresence) return
    const peers: ArtifactCollabPresence[] = []
    const state = channel.presenceState()
    for (const presences of Object.values(state)) {
      for (const raw of presences as Array<Record<string, unknown>>) {
        const peer = presenceFromState(raw)
        if (peer && peer.clientId !== args.clientId) peers.push(peer)
      }
    }
    args.onPresence(peers)
  }

  return {
    async persistUpdate(update, idempotencyKey, baseSeq) {
      const { data, error } = await args.supabase.rpc("artifact_collab_persist_update_v1", {
        p_artifact_id: args.artifactId,
        p_update_base64: bytesToBase64(update),
        p_idempotency_key: idempotencyKey,
        p_client_id: args.clientId ?? null,
        p_origin: "user",
        p_base_seq: baseSeq ?? null,
      })
      if (error) throw new Error(error.message)
      const row = asRecord(data) ?? {}
      if (row.ok === false && row.code === "stale_base") {
        throw new Error("stale_base")
      }
      return {
        id: String(row.id ?? ""),
        seq: Number(row.seq ?? 0),
        duplicate: row.duplicate === true,
      } satisfies PersistUpdateResult
    },
    async loadDocument(afterSeq) {
      const { data, error } = await args.supabase.rpc("artifact_collab_load_document_v1", {
        p_artifact_id: args.artifactId,
        p_after_seq: afterSeq,
      })
      if (error) throw new Error(error.message)
      const row = asRecord(data) ?? {}
      const updates = Array.isArray(row.updates) ? row.updates : []
      return {
        snapshot: typeof row.snapshot_base64 === "string" ? base64ToBytes(row.snapshot_base64) : null,
        lastIncludedSeq: Number(row.last_included_seq ?? 0),
        updates: updates.map((item) => {
          const rec = asRecord(item) ?? {}
          return {
            id: String(rec.id ?? ""),
            seq: Number(rec.seq ?? 0),
            update: typeof rec.update_base64 === "string" ? base64ToBytes(rec.update_base64) : new Uint8Array(),
            idempotencyKey: String(rec.idempotency_key ?? rec.id ?? ""),
          }
        }),
      } satisfies LoadDocumentResult
    },
    async subscribe(onEvent) {
      if (channel) {
        await args.supabase.removeChannel(channel)
        channel = null
      }
      channel = args.supabase.channel(room, {
        config: {
          private: true,
          broadcast: { self: false },
          presence: { key: args.clientId ?? args.artifactId },
        },
      })
      channel.on("broadcast", { event: UPDATE_EVENT }, ({ payload }) => {
        const record = asRecord(payload)
        const update = decodeBroadcastPayload(payload) ?? decodeBroadcastPayload(record)
        if (!update) return
        onEvent({
          key: String(record?.key ?? record?.idempotency_key ?? ""),
          update,
          seq: typeof record?.seq === "number" ? record.seq : undefined,
        })
      })
      channel.on("presence", { event: "sync" }, syncPresence)
      channel.on("presence", { event: "join" }, syncPresence)
      channel.on("presence", { event: "leave" }, syncPresence)
      await Promise.race([
        new Promise<void>((resolve, reject) => {
          channel?.subscribe((status, err) => {
            if (status === "SUBSCRIBED") resolve()
            if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
              reject(err ?? new Error(String(status)))
            }
          })
        }),
        new Promise<void>((_, reject) => {
          setTimeout(() => reject(new Error("collab_subscribe_timeout")), 8000)
        }),
      ])
      if (args.presence) {
        await channel.track(args.presence)
      }
      return () => {
        if (!channel) return
        void channel.untrack()
        void args.supabase.removeChannel(channel)
        channel = null
      }
    },
    async broadcast(payload) {
      if (!channel) throw new Error("collab_channel_missing")
      const result = await channel.send({
        type: "broadcast",
        event: UPDATE_EVENT,
        payload: {
          key: payload.key,
          seq: payload.seq,
          update: payload.update,
        },
      })
      if (result !== "ok") throw new Error(String(result))
    },
  }
}
