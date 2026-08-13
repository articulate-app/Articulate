import type { QueryClient } from "@tanstack/react-query"

function matchesProjectId(value: unknown, projectId: number): boolean {
  const n = Number(value)
  return Number.isFinite(n) && n === projectId
}

function isProjectSearchItem(item: unknown, projectId: number): boolean {
  if (!item || typeof item !== "object") return false
  const row = item as Record<string, unknown>
  if (String(row.entity_type ?? "") !== "project") return false
  return matchesProjectId(row.entity_id ?? row.id, projectId)
}

function filterProjectRows<T>(rows: T[] | undefined, projectId: number): T[] | undefined {
  if (!Array.isArray(rows)) return rows
  return rows.filter((row) => {
    if (!row || typeof row !== "object") return true
    const id = (row as { id?: unknown }).id
    return !matchesProjectId(id, projectId)
  })
}

/**
 * Optimistically remove an archived project from every list that surfaces projects,
 * then invalidate those keys so the next refetch stays consistent with the DB.
 */
export function removeArchivedProjectFromCaches(
  queryClient: QueryClient,
  projectId: number,
): void {
  queryClient.setQueriesData({ queryKey: ["global-search", "full"] }, (currentData: unknown) => {
    if (!currentData || typeof currentData !== "object") return currentData
    const data = currentData as { pages?: unknown[] }
    if (!Array.isArray(data.pages)) return currentData
    return {
      ...data,
      pages: data.pages.map((page) =>
        Array.isArray(page)
          ? page.filter((item) => !isProjectSearchItem(item, projectId))
          : page,
      ),
    }
  })

  queryClient.setQueriesData(
    { queryKey: ["global-search", "all-tab-sections"] },
    (currentData: unknown) => {
      if (!Array.isArray(currentData)) return currentData
      return currentData.map((section) => {
        if (!section || typeof section !== "object") return section
        const items = (section as { items?: unknown[] }).items
        if (!Array.isArray(items)) return section
        return {
          ...section,
          items: items.filter((item) => !isProjectSearchItem(item, projectId)),
        }
      })
    },
  )

  queryClient.setQueryData(["projects-minimal"], (rows: unknown) =>
    filterProjectRows(rows as unknown[] | undefined, projectId),
  )
  queryClient.setQueryData(["sidebar-nav-projects-alpha"], (rows: unknown) =>
    filterProjectRows(rows as unknown[] | undefined, projectId),
  )

  queryClient.setQueriesData({ queryKey: ["home-sidebar-recents"] }, (currentData: unknown) => {
    if (!currentData || typeof currentData !== "object") return currentData
    const data = currentData as { pages?: unknown[] }
    if (!Array.isArray(data.pages)) return currentData
    return {
      ...data,
      pages: data.pages.map((page) =>
        Array.isArray(page)
          ? page.filter((item) => {
              if (!item || typeof item !== "object") return true
              const row = item as { id?: unknown; project_id?: unknown; entity_id?: unknown }
              return (
                !matchesProjectId(row.id, projectId) &&
                !matchesProjectId(row.project_id, projectId) &&
                !matchesProjectId(row.entity_id, projectId)
              )
            })
          : page,
      ),
    }
  })
}

export async function invalidateAfterProjectArchive(
  queryClient: QueryClient,
  projectId: number,
): Promise<void> {
  await Promise.all([
    queryClient.invalidateQueries({ queryKey: ["projects-minimal"] }),
    queryClient.invalidateQueries({ queryKey: ["sidebar-nav-projects-alpha"] }),
    queryClient.invalidateQueries({ queryKey: ["home-sidebar-recents"] }),
    queryClient.invalidateQueries({ queryKey: ["global-search", "full"] }),
    queryClient.invalidateQueries({ queryKey: ["global-search", "all-tab-sections"] }),
    queryClient.invalidateQueries({ queryKey: ["global-search", "full-counts"] }),
    queryClient.invalidateQueries({ queryKey: ["project-overview", projectId] }),
  ])
}
