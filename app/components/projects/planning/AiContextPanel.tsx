"use client"

import { useMemo } from "react"
import { useQuery } from "@tanstack/react-query"
import { Loader2 } from "lucide-react"

import { Badge } from "../../ui/badge"
import { Card } from "../../ui/card"
import { getProjectPlanningMemory, type ProjectPlanningMemoryRow } from "../../../lib/services/project-planning"

function toStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value.map((v) => String(v)).filter(Boolean)
}

function firstN<T>(arr: T[] | null | undefined, n: number): T[] {
  if (!arr || !Array.isArray(arr)) return []
  return arr.slice(0, n)
}

function formatExample(example: unknown): string {
  if (typeof example === "string") return example
  try {
    return JSON.stringify(example, null, 2)
  } catch {
    return String(example)
  }
}

export function AiContextPanel({ projectId }: { projectId: number }) {
  const { data, isLoading, isError, error } = useQuery<ProjectPlanningMemoryRow | null>({
    queryKey: ["planning:memory", projectId],
    queryFn: async () => {
      const { data, error } = await getProjectPlanningMemory(projectId)
      if (error) throw error
      return data
    },
  })

  const avoidTerms = useMemo(() => toStringArray(data?.avoid_terms), [data?.avoid_terms])
  const boostTerms = useMemo(() => toStringArray(data?.boost_terms), [data?.boost_terms])
  const approved = useMemo(
    () => firstN(data?.recent_approved_examples, 10),
    [data?.recent_approved_examples],
  )
  const upcoming = useMemo(() => firstN(data?.recent_upcoming_examples, 10), [data?.recent_upcoming_examples])
  const dismissed = useMemo(() => firstN(data?.recent_dismissed_examples, 10), [data?.recent_dismissed_examples])

  return (
    <Card className="p-4 md:p-6">
      <details className="group">
        <summary className="cursor-pointer list-none select-none">
          <div className="flex items-center justify-between gap-4">
            <div>
              <div className="text-sm font-semibold text-gray-900">AI Context (debug)</div>
              <div className="text-xs text-gray-500">
                Inspect `project_planning_memory` to validate learning from dismissals.
              </div>
            </div>
            {isLoading ? <Loader2 className="h-4 w-4 animate-spin text-gray-400" /> : null}
          </div>
        </summary>

        <div className="mt-4 space-y-6">
          {isError ? (
            <div className="rounded-md border bg-red-50 p-3 text-sm text-red-700">
              Failed to load planning memory: {(error as any)?.message ?? "Unknown error"}
            </div>
          ) : null}

          {!isLoading && !data ? (
            <div className="rounded-md border bg-gray-50 p-3 text-sm text-gray-600">
              No memory yet — run planner once.
            </div>
          ) : null}

          {data ? (
            <>
              <div className="space-y-2">
                <div className="text-xs font-semibold text-gray-700">Avoid terms</div>
                <div className="flex flex-wrap gap-2">
                  {avoidTerms.length ? (
                    avoidTerms.map((t) => (
                      <Badge key={`avoid:${t}`} variant="secondary">
                        {t}
                      </Badge>
                    ))
                  ) : (
                    <div className="text-xs text-gray-500">—</div>
                  )}
                </div>
              </div>

              <div className="space-y-2">
                <div className="text-xs font-semibold text-gray-700">Boost terms</div>
                <div className="flex flex-wrap gap-2">
                  {boostTerms.length ? (
                    boostTerms.map((t) => (
                      <Badge key={`boost:${t}`} variant="secondary">
                        {t}
                      </Badge>
                    ))
                  ) : (
                    <div className="text-xs text-gray-500">—</div>
                  )}
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <div className="text-xs font-semibold text-gray-700">Recent approved examples (first 10)</div>
                  {approved.length ? (
                    <ol className="list-decimal pl-5 space-y-2">
                      {approved.map((ex, idx) => (
                        <li key={`approved:${idx}`} className="text-xs text-gray-700">
                          <pre className="whitespace-pre-wrap rounded-md border bg-white p-2 text-xs text-gray-700">
                            {formatExample(ex)}
                          </pre>
                        </li>
                      ))}
                    </ol>
                  ) : (
                    <div className="text-xs text-gray-500">—</div>
                  )}
                </div>

                <div className="space-y-2">
                  <div className="text-xs font-semibold text-gray-700">Recent dismissed examples (first 10)</div>
                  {dismissed.length ? (
                    <ol className="list-decimal pl-5 space-y-2">
                      {dismissed.map((ex, idx) => (
                        <li key={`dismissed:${idx}`} className="text-xs text-gray-700">
                          <pre className="whitespace-pre-wrap rounded-md border bg-white p-2 text-xs text-gray-700">
                            {formatExample(ex)}
                          </pre>
                        </li>
                      ))}
                    </ol>
                  ) : (
                    <div className="text-xs text-gray-500">—</div>
                  )}
                </div>
              </div>

              <div className="space-y-2">
                <div className="text-xs font-semibold text-gray-700">Recent upcoming examples (first 10)</div>
                {upcoming.length ? (
                  <ol className="list-decimal pl-5 space-y-2">
                    {upcoming.map((ex, idx) => (
                      <li key={`upcoming:${idx}`} className="text-xs text-gray-700">
                        <pre className="whitespace-pre-wrap rounded-md border bg-white p-2 text-xs text-gray-700">
                          {formatExample(ex)}
                        </pre>
                      </li>
                    ))}
                  </ol>
                ) : (
                  <div className="text-xs text-gray-500">—</div>
                )}
              </div>
            </>
          ) : null}
        </div>
      </details>
    </Card>
  )
}


