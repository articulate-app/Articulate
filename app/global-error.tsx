"use client"

/**
 * Root error boundary (replaces root layout when it fails).
 * Prevents Next.js "missing required error components, refreshing…" loops.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  return (
    <html lang="en">
      <body style={{ fontFamily: "system-ui, sans-serif", padding: 48, textAlign: "center" }}>
        <h1 style={{ fontSize: 18, marginBottom: 8 }}>Articulate failed to load</h1>
        <p style={{ color: "#666", marginBottom: 16 }}>
          {error?.message?.trim() || "Unexpected error"}
        </p>
        <button type="button" onClick={() => reset()}>
          Try again
        </button>
      </body>
    </html>
  )
}
