"use client"

import { useEffect } from "react"
import { useSearchParams } from "next/navigation"
import { shallowReplaceSearchParams } from "../lib/tasks-shallow-nav"

export default function LegacySearchRedirectPage() {
  const searchParams = useSearchParams()

  useEffect(() => {
    const next = new URLSearchParams(searchParams.toString())
    shallowReplaceSearchParams("/", next)
  }, [searchParams])

  return (
    <div className="flex min-h-screen items-center justify-center text-sm text-gray-500">
      Redirecting to home...
    </div>
  )
}
