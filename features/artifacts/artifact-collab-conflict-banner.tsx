"use client"

type ArtifactCollabConflict = {
  id?: string
  status?: string
  expected_text?: string | null
  conflict?: {
    expected_text?: string | null
    current_text?: string | null
    kind?: string
  } | null
  error?: string | null
}

export function ArtifactCollabConflictBanner(props: {
  conflicts: ArtifactCollabConflict[]
  onDismiss?: (id: string) => void
}) {
  if (!props.conflicts.length) return null
  return (
    <div
      className="mb-2 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-950"
      data-collab-conflict="true"
      role="alert"
    >
      <p className="font-medium">AI change blocked to protect concurrent edits</p>
      {props.conflicts.map((conflict, index) => {
        const expected = conflict.conflict?.expected_text ?? conflict.expected_text
        const current = conflict.conflict?.current_text
        return (
          <div key={conflict.id ?? String(index)} className="mt-2 space-y-1">
            <p>
              The target sentence changed before the AI proposal could be applied.
              The old snapshot was not written over your edit.
            </p>
            {expected ? (
              <p className="text-xs"><span className="font-medium">Expected:</span> {expected}</p>
            ) : null}
            {current ? (
              <p className="text-xs"><span className="font-medium">Current:</span> {current}</p>
            ) : null}
            {conflict.id && props.onDismiss ? (
              <button
                type="button"
                className="text-xs underline"
                onClick={() => props.onDismiss?.(conflict.id!)}
              >
                Keep my version
              </button>
            ) : null}
          </div>
        )
      })}
    </div>
  )
}
