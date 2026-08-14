"use client"

import { useEffect } from "react"
import { Button } from "./components/ui/button"

type AppErrorProps = {
  error: Error & { digest?: string }
  reset: () => void
}

/**
 * Required by Next.js App Router to recover from runtime errors without the
 * "missing required error components, refreshing…" loop.
 */
export default function AppError({ error, reset }: AppErrorProps) {
  useEffect(() => {
    console.error("[app/error]", error)
  }, [error])

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-white px-6 text-center">
      <div className="max-w-md space-y-2">
        <h1 className="text-lg font-semibold text-gray-900">Something went wrong</h1>
        <p className="text-sm text-gray-600">
          {error?.message?.trim() || "An unexpected error occurred."}
        </p>
      </div>
      <Button type="button" onClick={() => reset()}>
        Try again
      </Button>
    </div>
  )
}
