"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { Loader2 } from "lucide-react"
import { TaskOverviewPreviewSection } from "../tasks/task-overview-preview-section"
import { getUserProjects, type UserProject } from "../../lib/services/users"
import { getMinimalProjects } from "../../lib/services/userSkillsAndMemberships"
import { getImageUrl } from "../../lib/public-media"
import { UserScrollableList } from "./user-scrollable-list"

const PAGE_SIZE = 5

type UserProjectsListSectionProps = {
  userId: number
  onOpenProject?: (projectId: number) => void
  onViewAll?: () => void
  active?: boolean
  onVisible?: () => void
  asPreview?: boolean
}

function ProjectLogo({
  name,
  color,
  logoUrl,
}: {
  name: string
  color: string | null
  logoUrl: string | null
}) {
  return (
    <div className="flex h-5 w-5 shrink-0 items-center justify-center">
      {logoUrl ? (
        <img
          src={logoUrl}
          alt=""
          title={name}
          className="h-5 w-5 rounded-sm object-cover"
        />
      ) : (
        <div
          className="h-2.5 w-2.5 rounded-full"
          style={{ backgroundColor: color || "#6b7280" }}
          title={name}
          aria-hidden
        />
      )}
    </div>
  )
}

function ProjectsList({
  projects,
  logoById,
  onOpenProject,
}: {
  projects: UserProject[]
  logoById: Map<number, string | null>
  onOpenProject?: (projectId: number) => void
}) {
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE)

  useEffect(() => {
    setVisibleCount(PAGE_SIZE)
  }, [projects])

  const visible = projects.slice(0, visibleCount)
  const hasMore = visibleCount < projects.length
  const onLoadMore = useCallback(() => {
    setVisibleCount((count) => Math.min(count + PAGE_SIZE, projects.length))
  }, [projects.length])

  if (projects.length === 0) {
    return <p className="py-4 text-sm text-gray-500">No projects yet.</p>
  }

  return (
    <UserScrollableList hasMore={hasMore} onLoadMore={onLoadMore} maxRows={5}>
      {visible.map((project) => {
        const logoUrl = getImageUrl(logoById.get(project.project_id) ?? null)
        const content = (
          <>
            <ProjectLogo
              name={project.project_name}
              color={project.project_color}
              logoUrl={logoUrl}
            />
            <div className="min-w-0 flex-1 truncate text-sm text-gray-900">
              {project.project_name}
            </div>
          </>
        )

        return (
          <div
            key={project.project_id}
            className="flex items-center justify-between gap-3 border-b border-gray-100 py-2.5 last:border-b-0"
          >
            {onOpenProject ? (
              <button
                type="button"
                className="flex min-w-0 flex-1 items-center gap-3 text-left"
                onClick={() => onOpenProject(project.project_id)}
              >
                {content}
              </button>
            ) : (
              <div className="flex min-w-0 flex-1 items-center gap-3">{content}</div>
            )}
          </div>
        )
      })}
    </UserScrollableList>
  )
}

export function UserProjectsListSection({
  userId,
  onOpenProject,
  onViewAll,
  active = true,
  onVisible,
  asPreview = false,
}: UserProjectsListSectionProps) {
  const { data: projects, isLoading, isError, refetch } = useQuery({
    queryKey: ["user-projects", userId],
    enabled: active && userId > 0,
    queryFn: async () => {
      const result = await getUserProjects(userId)
      if (result.error) throw result.error
      return result.data || []
    },
  })

  const { data: minimalProjects } = useQuery({
    queryKey: ["projects-minimal"],
    enabled: active && userId > 0,
    queryFn: async () => {
      const result = await getMinimalProjects()
      if (result.error) throw result.error
      return result.data || []
    },
    staleTime: 5 * 60_000,
  })

  const list = projects ?? []
  const logoById = useMemo(() => {
    const map = new Map<number, string | null>()
    for (const project of minimalProjects ?? []) {
      map.set(Number(project.id), (project as { logo?: string | null }).logo ?? null)
    }
    return map
  }, [minimalProjects])

  const countBadge =
    list.length > 0 ? (
      <span className="inline-flex h-6 min-w-[1.5rem] items-center justify-center rounded-full bg-gray-100 px-2 text-xs font-semibold tabular-nums text-gray-800">
        {list.length}
      </span>
    ) : null

  if (asPreview) {
    return (
      <TaskOverviewPreviewSection
        title="Projects"
        onViewAll={onViewAll}
        active={active}
        onVisible={onVisible}
        isLoading={active && isLoading}
        isError={isError}
        onRetry={() => void refetch()}
        isEmpty={active && !isLoading && list.length === 0}
        emptyMessage="No projects yet."
        headerActions={countBadge}
        className="py-8"
      >
        <ProjectsList projects={list} logoById={logoById} onOpenProject={onOpenProject} />
      </TaskOverviewPreviewSection>
    )
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-5 w-5 animate-spin text-gray-400" />
      </div>
    )
  }

  if (isError) {
    return <p className="py-8 text-sm text-red-600">Failed to load projects.</p>
  }

  return (
    <div className="min-w-0">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h3 className="text-base font-medium text-gray-900">Projects</h3>
        {countBadge}
      </div>
      <ProjectsList projects={list} logoById={logoById} onOpenProject={onOpenProject} />
    </div>
  )
}
