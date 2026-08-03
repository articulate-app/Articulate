"use client"

import { useEffect } from "react"
import { useParams, useSearchParams } from "next/navigation"
import { UnifiedShellPage } from "../../components/shell/UnifiedShellPage"
import {
  ARTIFACT_VERSION_PARAM,
  CENTER_ARTIFACT_ID_PARAM,
  getArtifactVersionFromParams,
} from "../../lib/artifact-selection-url"
import { clearActiveCenterSelectionParams } from "../../lib/center-pane-selection-url"
import { useCenterPaneTabsStore } from "../../store/center-pane-tabs"
import { shallowReplaceFullUrl } from "../../lib/tasks-shallow-nav"

/**
 * Canonical deep link: `/artifacts/:artifactId?version=<n>`
 * Canonicalizes into the unified shell with `centerArtifactId` (tab key = artifact id).
 */
export default function ArtifactDeepLinkPage() {
  const params = useParams()
  const searchParams = useSearchParams()
  const upsertTab = useCenterPaneTabsStore((s) => s.upsertTab)
  const artifactId =
    typeof params?.artifactId === "string" ? params.artifactId.trim() : ""

  useEffect(() => {
    if (!artifactId) return
    const version = getArtifactVersionFromParams(searchParams)
    upsertTab({ kind: "artifact", id: artifactId })

    const next = new URLSearchParams(searchParams.toString())
    clearActiveCenterSelectionParams(next)
    next.set(CENTER_ARTIFACT_ID_PARAM, artifactId)
    if (version != null) next.set(ARTIFACT_VERSION_PARAM, String(version))
    else next.delete(ARTIFACT_VERSION_PARAM)
    next.set("layout", "right")
    shallowReplaceFullUrl(`/?${next.toString()}`, "artifact-deep-link")
  }, [artifactId, searchParams, upsertTab])

  return <UnifiedShellPage />
}
