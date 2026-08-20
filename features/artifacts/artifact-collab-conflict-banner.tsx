"use client"

import type { CollabConflictChoice, CollabConflictSpan } from "../../app/lib/collaboration/collab-conflict"

function preview(value: string, max = 72): string {
  const text = value.replace(/\s+/g, " ").trim()
  if (text.length <= max) return text
  return `${text.slice(0, max - 1).trim()}…`
}

/** Compact fallback when the conflicting phrase is no longer in the open document. */
export function ArtifactCollabConflictBanner(props: {
  conflicts: CollabConflictSpan[]
  onResolve?: (id: string, choice: CollabConflictChoice) => void
}) {
  if (!props.conflicts.length) return null
  return (
    <div className="mt-2 space-y-2" data-collab-conflict="true">
      {props.conflicts.map((conflict) => (
        <div
          key={conflict.id}
          className="rounded-md border border-amber-300 bg-amber-50 px-2 py-1.5 text-xs text-amber-950"
          role="group"
          aria-label="Resolve edit conflict"
        >
          <p>
            Also changed
            {conflict.incoming ? `: “${preview(conflict.incoming)}”` : " here"}
          </p>
          <div className="mt-1 flex flex-wrap gap-1">
            <button
              type="button"
              className="rounded border border-amber-400 bg-white px-1.5 py-0.5"
              onClick={() => props.onResolve?.(conflict.id, "keep")}
            >
              Keep mine
            </button>
            <button
              type="button"
              className="rounded border border-amber-400 bg-white px-1.5 py-0.5 disabled:opacity-40"
              disabled={!conflict.incoming}
              onClick={() => props.onResolve?.(conflict.id, "incoming")}
            >
              Use this
            </button>
            <button
              type="button"
              className="rounded border border-amber-400 bg-white px-1.5 py-0.5 disabled:opacity-40"
              disabled={!conflict.incoming}
              onClick={() => props.onResolve?.(conflict.id, "both")}
            >
              Keep both
            </button>
          </div>
        </div>
      ))}
    </div>
  )
}
