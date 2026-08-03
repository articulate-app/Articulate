"use client"

import { useEffect } from "react"
import { useParams, useSearchParams } from "next/navigation"
import { UnifiedShellPage } from "../../components/shell/UnifiedShellPage"
import { CENTER_SOURCE_ID_PARAM } from "../../lib/source-selection-url"
import { clearActiveCenterSelectionParams } from "../../lib/center-pane-selection-url"
import { useCenterPaneTabsStore } from "../../store/center-pane-tabs"
import { shallowReplaceFullUrl } from "../../lib/tasks-shallow-nav"

/**
 * Canonical deep link: `/sources/:sourceId`
 * Canonicalizes into the unified shell with `centerSourceId` (tab key = source:<id>).
 */
export default function SourceDeepLinkPage() {
  const params = useParams()
  const searchParams = useSearchParams()
  const upsertTab = useCenterPaneTabsStore((s) => s.upsertTab)
  const sourceId =
    typeof params?.sourceId === "string" ? params.sourceId.trim() : ""

  useEffect(() => {
    if (!sourceId) return
    upsertTab({ kind: "source", id: sourceId })

    const next = new URLSearchParams(searchParams.toString())
    clearActiveCenterSelectionParams(next)
    next.set(CENTER_SOURCE_ID_PARAM, sourceId)
    next.set("layout", "right")
    shallowReplaceFullUrl(`/?${next.toString()}`, "source-deep-link")
  }, [sourceId, searchParams, upsertTab])

  return <UnifiedShellPage />
}
