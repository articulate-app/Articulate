"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs"
import { useRouter } from "next/navigation"
import { useCurrentUserStore } from "../../store/current-user"
import { createProject } from "../../lib/services/projects"
import { invokeEdgeFunctionFetch } from "@/lib/edge-functions"
import { getRoles } from "../../lib/services/teams"
import type { AdminCreateUserPayload, AdminCreateUserResponse } from "../../types/users"
import { useGlobalSearchContext } from "../../contexts/global-search-context"
import { createThreadWithFirstMessage } from "../../lib/services/threads"
import { type GlobalSearchDocument } from "../../lib/global-search-types"
import { fetchGlobalSearchPreviewItems } from "../../lib/services/global-search"
import { shallowReplaceSearchParams } from "../../lib/tasks-shallow-nav"

export type HeaderCreateType = "task" | "project" | "user" | "thread"
type AssociationTagType = "task" | "project" | "user"
type AssociationTag = {
  type: AssociationTagType
  id: string
  label: string
}

function stripHtmlToText(value: string): string {
  return (value || "").replace(/<(.|\n)*?>/g, " ").replace(/\s+/g, " ").trim()
}

export const CREATE_MODAL_TITLES: Record<HeaderCreateType, string> = {
  task: "Create task",
  project: "Create project",
  user: "Create user",
  thread: "Create thread",
}

/** Desktop create popup shell — keep portaled overlays above this (see CREATE_POPUP_SELECT_Z_CLASS). */
export const CREATE_POPUP_Z_CLASS = "z-[220]"

/** Portaled select menus inside the create popup (Radix default z-50 sits below the popup). */
export const CREATE_POPUP_SELECT_Z_CLASS = "!z-[280]"

/** Shared props so create-popup selects render above the popup shell and footer. */
export const CREATE_POPUP_SELECT_CONTENT_PROPS = {
  className: CREATE_POPUP_SELECT_Z_CLASS,
  position: "popper" as const,
  sideOffset: 4,
}

export function useHeaderCreateFlow(options?: { enabled?: boolean }) {
  const enabled = options?.enabled ?? true
  const currentPublicUserId = useCurrentUserStore((s) => s.publicUserId)
  const currentUserTeams = useCurrentUserStore((s) => s.userTeams)
  const router = useRouter()
  const supabase = createClientComponentClient()
  const globalSearch = useGlobalSearchContext()

  const [createType, setCreateType] = useState<HeaderCreateType>("task")
  const [isSubmittingCreate, setIsSubmittingCreate] = useState(false)
  const [createError, setCreateError] = useState<string | null>(null)
  const [projectName, setProjectName] = useState("")
  const [projectTeamId, setProjectTeamId] = useState<number | null>(null)
  const [userEmail, setUserEmail] = useState("")
  const [userName, setUserName] = useState("")
  const [userTeamId, setUserTeamId] = useState<number | null>(null)
  const [userRoleId, setUserRoleId] = useState<number | null>(null)
  const [userSendInvite, setUserSendInvite] = useState(true)
  const [threadTitle, setThreadTitle] = useState("")
  const [threadParticipantUsers, setThreadParticipantUsers] = useState<any[]>([])
  const [threadMessage, setThreadMessage] = useState("")
  const [threadAssociationTags, setThreadAssociationTags] = useState<AssociationTag[]>([])

  const teamsQuery = useQuery({
    queryKey: ["teams-minimal", "header-create"],
    queryFn: async () => {
      const { data, error } = await supabase.from("v_teams_minimal").select("id, title").order("title")
      if (error) throw error
      return data || []
    },
    enabled: enabled && (createType === "project" || createType === "user"),
    staleTime: 30_000,
  })

  const rolesQuery = useQuery({
    queryKey: ["roles", "header-create"],
    queryFn: async () => {
      const { data, error } = await getRoles()
      if (error) throw error
      return data || []
    },
    enabled: enabled && createType === "user",
    staleTime: 30_000,
  })

  const threadTeamUsersQuery = useQuery({
    queryKey: [
      "team-users-for-thread-create",
      "header-create",
      currentPublicUserId,
      currentUserTeams.map((team) => team.team_id).join(","),
    ],
    queryFn: async () => {
      const teamIds = Array.from(
        new Set((currentUserTeams ?? []).map((team) => Number(team.team_id)).filter((value) => Number.isFinite(value)))
      )
      if (teamIds.length === 0) return []
      const { data: teamUsers, error: teamUsersError } = await supabase
        .from("users")
        .select("id, full_name, email, photo, teams_users!inner(team_id)")
        .in("teams_users.team_id", teamIds)
      if (teamUsersError) throw teamUsersError
      const deduped = new Map<number, any>()
      for (const row of teamUsers ?? []) {
        const user = row as any
        const id = Number(user?.id)
        if (!Number.isFinite(id) || deduped.has(id)) continue
        deduped.set(id, {
          id,
          full_name: user?.full_name ?? null,
          email: user?.email ?? null,
          photo: user?.photo ?? null,
        })
      }
      return Array.from(deduped.values()).sort((a, b) =>
        String(a.full_name || a.email || "").localeCompare(String(b.full_name || b.email || ""))
      )
    },
    enabled: enabled && createType === "thread" && currentUserTeams.length > 0,
    staleTime: 60_000,
  })

  const threadAssociationQuery = useMemo(() => {
    const messageText = stripHtmlToText(threadMessage)
    const match = messageText.match(/(?:^|\s)@([^\s]*)$/)
    return match ? match[1] : null
  }, [threadMessage])

  const threadAssociationSuggestionsQuery = useQuery({
    queryKey: ["thread-association-suggestions", threadAssociationQuery],
    queryFn: ({ signal }) =>
      fetchGlobalSearchPreviewItems({
        query: threadAssociationQuery ?? "",
        entityTypes: ["task", "project", "user"],
        limit: 8,
        signal,
      }),
    enabled:
      enabled && createType === "thread" && threadAssociationQuery !== null && threadAssociationQuery.length > 0,
    staleTime: 10_000,
  })

  const associationSelection = useMemo(() => {
    const byType: Record<AssociationTagType, string | null> = {
      task: null,
      project: null,
      user: null,
    }
    for (const tag of threadAssociationTags) {
      if (!byType[tag.type]) byType[tag.type] = tag.id
    }
    return {
      taskId: byType.task ? Number(byType.task) : null,
      projectId: byType.project ? Number(byType.project) : null,
      userId: byType.user ? Number(byType.user) : null,
    }
  }, [threadAssociationTags])

  const teamUsersWithoutMe = useMemo(
    () =>
      (threadTeamUsersQuery.data ?? []).filter(
        (user: any) => Number(user.id) !== Number(currentPublicUserId)
      ),
    [currentPublicUserId, threadTeamUsersQuery.data]
  )

  useEffect(() => {
    if (!enabled || createType !== "thread") return
    if (!threadTeamUsersQuery.data || threadParticipantUsers.length > 0) return
    setThreadParticipantUsers(teamUsersWithoutMe)
  }, [createType, enabled, teamUsersWithoutMe, threadParticipantUsers.length, threadTeamUsersQuery.data])

  const addThreadAssociationTag = useCallback((item: GlobalSearchDocument) => {
    if (item.entity_type !== "task" && item.entity_type !== "project" && item.entity_type !== "user") return
    const id = item.entity_id != null ? String(item.entity_id) : null
    if (!id) return
    const label =
      item.title?.trim() ||
      item.preview?.trim() ||
      (item.entity_type === "project" ? "Project" : item.entity_type === "task" ? "Task" : "User")
    const nextTag: AssociationTag = {
      type: item.entity_type,
      id,
      label,
    }
    setThreadAssociationTags((prev) => {
      const deduped = prev.filter((tag) => !(tag.type === nextTag.type && tag.id === nextTag.id))
      return [...deduped, nextTag]
    })
    setThreadMessage((prev) => {
      const currentText = stripHtmlToText(prev)
      const replaced = currentText.replace(/(?:^|\s)@([^\s]*)$/, ` @${nextTag.label}`)
      return replaced
    })
  }, [])

  const removeThreadAssociationTag = useCallback((type: AssociationTagType, id: string) => {
    setThreadAssociationTags((prev) => prev.filter((tag) => !(tag.type === type && tag.id === id)))
  }, [])

  const threadParticipantIds = useMemo(
    () =>
      Array.from(
        new Set(
          threadParticipantUsers
            .map((user) => Number(user?.id))
            .filter((value) => Number.isFinite(value) && value > 0)
        )
      ),
    [threadParticipantUsers]
  )

  const isThreadMessageEmpty = useMemo(
    () => !threadMessage || !threadMessage.replace(/<(.|\n)*?>/g, "").trim(),
    [threadMessage]
  )

  const resetCreateState = useCallback(() => {
    setCreateError(null)
    setIsSubmittingCreate(false)
    setProjectName("")
    setProjectTeamId(null)
    setUserEmail("")
    setUserName("")
    setUserTeamId(null)
    setUserRoleId(null)
    setUserSendInvite(true)
    setThreadTitle("")
    setThreadParticipantUsers([])
    setThreadMessage("")
    setThreadAssociationTags([])
  }, [])

  const openCreateForm = useCallback((nextType: HeaderCreateType) => {
    setCreateError(null)
    setCreateType(nextType)
  }, [])

  const handleCreateProjectSubmit = useCallback(async () => {
    if (!projectName.trim()) {
      setCreateError("Project name is required")
      return
    }
    if (!projectTeamId) {
      setCreateError("Team is required")
      return
    }
    setIsSubmittingCreate(true)
    setCreateError(null)
    try {
      const { data, error } = await createProject(projectName.trim(), projectTeamId)
      if (error) throw error
      const projectId = data?.id
      resetCreateState()
      if (projectId && globalSearch?.openSearchResult) {
        const item: GlobalSearchDocument = {
          entity_type: "project",
          entity_id: String(projectId),
          title: data?.name ?? projectName.trim(),
          subtitle: null,
          preview: null,
          created_at: null,
          score: null,
          url: null,
          project_id: projectId,
          task_id: null,
          thread_id: null,
          display_payload: {
            title: data?.name ?? projectName.trim(),
          },
          raw: { project_id: projectId },
        }
        globalSearch.openSearchResult(item)
      } else if (projectId) {
        router.push(`/projects/${projectId}`)
      }
      return true
    } catch (error: any) {
      setCreateError(error?.message || "Failed to create project")
      return false
    } finally {
      setIsSubmittingCreate(false)
    }
  }, [globalSearch, projectName, projectTeamId, resetCreateState, router])

  const handleCreateUserSubmit = useCallback(async () => {
    if (!userEmail.trim()) {
      setCreateError("Email is required")
      return
    }
    setIsSubmittingCreate(true)
    setCreateError(null)
    try {
      const payload: AdminCreateUserPayload = {
        email: userEmail.trim(),
        full_name: userName.trim() || undefined,
        team_id: userTeamId,
        role_id: userRoleId,
        send_invite: userSendInvite,
      }
      const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
      if (!supabaseUrl) throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL")
      const res = await invokeEdgeFunctionFetch({
        supabase,
        url: `${supabaseUrl}/functions/v1/admin-create-user`,
        debugLabel: "admin-create-user",
        init: {
          method: "POST",
          body: JSON.stringify(payload),
        },
        headers: {
          "Content-Type": "application/json",
        },
      })
      if (!res.ok) {
        const body = await res.json().catch(() => null)
        throw new Error(body?.error || body?.message || `Failed to create user (${res.status})`)
      }
      const created: AdminCreateUserResponse = await res.json()
      resetCreateState()
      router.push(`/users/${created.public_user_id}`)
      return true
    } catch (error: any) {
      setCreateError(error?.message || "Failed to create user")
      return false
    } finally {
      setIsSubmittingCreate(false)
    }
  }, [resetCreateState, router, supabase, userEmail, userName, userRoleId, userSendInvite, userTeamId])

  const handleCreateThreadSubmit = useCallback(async () => {
    if (!currentPublicUserId) {
      setCreateError("You must be signed in to create a thread.")
      return
    }
    setIsSubmittingCreate(true)
    setCreateError(null)
    try {
      const createdThread = await createThreadWithFirstMessage(supabase as any, {
        createdBy: currentPublicUserId,
        title: threadTitle.trim() || null,
        participantIds: threadParticipantIds,
        firstMessageHtml: threadMessage,
        projectId: associationSelection.projectId,
        taskId: associationSelection.taskId,
        userId: associationSelection.userId,
      })
      resetCreateState()
      const next = new URLSearchParams()
      next.set("thread", String(createdThread.threadId))
      next.set("focusComposer", "1")
      shallowReplaceSearchParams("/inbox", next)
      return true
    } catch (error: any) {
      setCreateError(error?.message || "Failed to create thread")
      return false
    } finally {
      setIsSubmittingCreate(false)
    }
  }, [
    associationSelection.projectId,
    associationSelection.taskId,
    associationSelection.userId,
    currentPublicUserId,
    resetCreateState,
    supabase,
    threadMessage,
    threadParticipantIds,
    threadTitle,
  ])

  const handleNonTaskSubmit = useCallback(async () => {
    if (createType === "project") return handleCreateProjectSubmit()
    if (createType === "user") return handleCreateUserSubmit()
    if (createType === "thread") return handleCreateThreadSubmit()
    return false
  }, [createType, handleCreateProjectSubmit, handleCreateThreadSubmit, handleCreateUserSubmit])

  return {
    createType,
    createError,
    isSubmittingCreate,
    projectName,
    setProjectName,
    projectTeamId,
    setProjectTeamId,
    userEmail,
    setUserEmail,
    userName,
    setUserName,
    userTeamId,
    setUserTeamId,
    userRoleId,
    setUserRoleId,
    userSendInvite,
    setUserSendInvite,
    threadTitle,
    setThreadTitle,
    threadParticipantUsers,
    setThreadParticipantUsers,
    threadMessage,
    setThreadMessage,
    threadAssociationTags,
    threadAssociationQuery,
    threadAssociationSuggestionsQuery,
    addThreadAssociationTag,
    removeThreadAssociationTag,
    teamUsersWithoutMe,
    currentPublicUserId,
    teamsQuery,
    rolesQuery,
    isThreadMessageEmpty,
    openCreateForm,
    resetCreateState,
    handleNonTaskSubmit,
  }
}

export type HeaderCreateFlow = ReturnType<typeof useHeaderCreateFlow>
