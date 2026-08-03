"use client"

import React from "react"
import { useQuery } from "@tanstack/react-query"
import { ChevronRight } from "lucide-react"
import {
  DropdownMenuItem,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
} from "../../app/components/ui/dropdown-menu"
import { listAiThreadArtifacts } from "../../app/lib/services/artifacts"
import { listSources } from "../../app/lib/services/sources"
import { useArtifactsRealtime } from "../../app/hooks/use-artifacts-realtime"
import { useSourcesRealtime } from "../../app/hooks/use-sources-realtime"
import { openArtifactCenterTab } from "../artifacts/open-artifact-center-tab"
import { openSourceCenterTab } from "../sources/open-source-center-tab"

type AiPaneThreadLibraryMenusProps = {
  threadId: string | null | undefined
}

/**
 * Overflow-menu entries for chat-scoped sources and artifact outputs.
 * Click opens the matching center-pane tab (same as task overview).
 */
export function AiPaneThreadLibraryMenus({ threadId }: AiPaneThreadLibraryMenusProps) {
  const enabled = Boolean(threadId)

  useSourcesRealtime({ aiThreadId: threadId ?? null, enabled })
  useArtifactsRealtime({ aiThreadId: threadId ?? null, enabled })

  const sourcesQuery = useQuery({
    queryKey: ["sources", "thread", threadId],
    queryFn: () => listSources({ aiThreadId: threadId!, limit: 100 }),
    enabled,
    staleTime: 30_000,
  })

  const artifactsQuery = useQuery({
    queryKey: ["ai-thread-artifacts", threadId],
    queryFn: () => listAiThreadArtifacts({ threadId: threadId!, includeContent: false }),
    enabled,
    staleTime: 30_000,
  })

  const sources = sourcesQuery.data?.sources ?? []
  const artifacts = artifactsQuery.data?.artifacts ?? []

  return (
    <>
      <DropdownMenuSub>
        <DropdownMenuSubTrigger className="gap-2" disabled={!enabled}>
          <span className="flex-1">Sources</span>
          <ChevronRight className="h-3.5 w-3.5 opacity-60" aria-hidden />
        </DropdownMenuSubTrigger>
        <DropdownMenuSubContent className="min-w-[220px] max-h-[min(60vh,360px)] overflow-y-auto">
          {!enabled ? (
            <DropdownMenuItem disabled>No active chat</DropdownMenuItem>
          ) : sourcesQuery.isLoading ? (
            <DropdownMenuItem disabled>Loading…</DropdownMenuItem>
          ) : sources.length === 0 ? (
            <DropdownMenuItem disabled>No sources in this chat</DropdownMenuItem>
          ) : (
            sources.map((source) => (
              <DropdownMenuItem
                key={source.id}
                onClick={() => {
                  openSourceCenterTab({
                    sourceId: source.id,
                    title: source.title,
                  })
                }}
              >
                <span className="min-w-0 truncate">{source.title?.trim() || "Untitled source"}</span>
              </DropdownMenuItem>
            ))
          )}
        </DropdownMenuSubContent>
      </DropdownMenuSub>

      <DropdownMenuSub>
        <DropdownMenuSubTrigger className="gap-2" disabled={!enabled}>
          <span className="flex-1">Outputs</span>
          <ChevronRight className="h-3.5 w-3.5 opacity-60" aria-hidden />
        </DropdownMenuSubTrigger>
        <DropdownMenuSubContent className="min-w-[220px] max-h-[min(60vh,360px)] overflow-y-auto">
          {!enabled ? (
            <DropdownMenuItem disabled>No active chat</DropdownMenuItem>
          ) : artifactsQuery.isLoading ? (
            <DropdownMenuItem disabled>Loading…</DropdownMenuItem>
          ) : artifacts.length === 0 ? (
            <DropdownMenuItem disabled>No outputs in this chat</DropdownMenuItem>
          ) : (
            artifacts.map((artifact) => (
              <DropdownMenuItem
                key={artifact.id}
                onClick={() => {
                  openArtifactCenterTab({
                    artifactId: artifact.id,
                    title: artifact.title,
                    version: artifact.current_version,
                  })
                }}
              >
                <span className="min-w-0 truncate">
                  {artifact.title?.trim() || "Untitled output"}
                </span>
              </DropdownMenuItem>
            ))
          )}
        </DropdownMenuSubContent>
      </DropdownMenuSub>
    </>
  )
}
