"use client"

import { useState, useCallback, useEffect, useMemo, useRef } from "react"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { useRouter, useSearchParams, usePathname } from "next/navigation"
import { 
  Loader2, Trash2, MessageSquare, Mail, FileText, Lightbulb, BarChart3, 
  Plus, Edit, X as XIcon, UserPlus, Search, ArrowUpDown, CalendarIcon, Maximize2, Minimize2
} from "lucide-react"
import { Button } from "../ui/button"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../ui/tabs"
import { Card } from "../ui/card"
import { Badge } from "../ui/badge"
import { toast } from "../ui/use-toast"
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "../ui/alert-dialog"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "../ui/dialog"
import { Input } from "../ui/input"
import { Label } from "../ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../ui/select"
import { Textarea } from "../ui/textarea"
import { Switch } from "../ui/switch"
import { Popover, PopoverContent, PopoverTrigger } from "../ui/popover"
import { Calendar } from "../ui/calendar"
import { TaskList } from "../tasks/TaskList"
import { CalendarView } from "../calendar-view/calendar-view"
import { KanbanView } from "../kanban-view/kanban-view"
import { ImprovementPlanSection } from "./ImprovementPlanSection"
import { UserSharedCommentsTab } from "./user-shared-comments-tab"
import { UserOverviewStatCards, UserOccupationStatCards } from "./user-overview-stat-cards"
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs"
import { shallowReplaceSearchParams, TASKS_SHALLOW_NAV_EVENT } from "../../lib/tasks-shallow-nav"
import {
  buildSeeMoreTasksSearchParams,
  type TaskFiltersForUrl,
} from "../../lib/tasks-filter-url"
import { mergeWorkspaceUrlState } from "../../lib/workspace-url-state"
import { useMobileDetection } from "../../hooks/use-mobile-detection"
import { MobileDetailHeader, type MobileDetailAction } from "../ui/mobile-detail-header"
import { UserAvatar } from "../UserAvatar"
import {
  TaskOverviewReadonlySection,
  type TaskOverviewRowData,
} from "../tasks/task-overview-readonly-table"
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
  ResponsiveContainer,
  Legend,
  ReferenceLine,
} from "recharts"

import { useTaskEditFields } from "../../hooks/use-task-edit-fields"
import {
  getUserProfile,
  getUserProjects,
  getUserTasks,
  updateUserPreferences,
  updateUserProfile,
  updateUserPhoto,
  softDeleteUser,
  getOrCreateUserThread,
  type UserProfile,
  type UserProject,
  type UserTask,
} from "../../lib/services/users"
import { PUBLIC_MEDIA_BUCKET, getImageUrl, uploadImage } from "../../lib/public-media"

import {
  getUserContentSkills,
  addUserContentSkill,
  updateUserContentSkill,
  deleteUserContentSkill,
  addUserToProject,
  removeUserFromProject,
  addUserToTeam,
  removeUserFromTeam,
  getContentTypes,
  getProductionTypes,
  getLanguages,
  getRoles,
  getMinimalProjects,
  getUserTeamsWithRoles,
  type UserContentSkill,
  type UserTeamWithRole,
  type ContentType,
  type ProductionType,
  type Language,
  type Role,
} from "../../lib/services/userSkillsAndMemberships"
import {
  getActiveUserWorkloadSetting,
  upsertCurrentDailyCapacity,
  parseDailyCapacityInput,
  DEFAULT_DAILY_CAPACITY_HOURS,
} from "../../lib/services/user-workload-settings"

interface UserDetailsPageProps {
  userId: number
  onClose?: () => void
  isDetailsFocused?: boolean
  onFocusToggle?: () => void
  /** Tasks shell: open TaskDetails without clearing entity detail params. */
  onOpenTaskKeepingDetail?: (task: UserTask) => void
  /** Tasks shell: stack TeamDetails above user detail (`stackTeamId` URL param). */
  onOpenTeamKeepingDetail?: (teamId: number) => void
}

type TabValue =
  | 'overview'
  | 'projects'
  | 'comments'
  | 'skills'
  | 'tasks'
  | 'preferences'
  | 'reviews'
  | 'occupation'
type TaskViewMode = 'list' | 'calendar' | 'kanban'

/** Overview pane sub-views, surfaced as pills above the task list. */
type UserOverviewView = 'upcoming' | 'overdue' | 'publication'
const USER_OVERVIEW_VIEWS: UserOverviewView[] = ['upcoming', 'overdue', 'publication']
const USER_OVERVIEW_VIEW_PARAM = 'userOverviewView'

const EMPTY_TASK_FILTERS_FOR_URL: TaskFiltersForUrl = {
  assignedTo: [],
  status: [],
  deliveryDate: {},
  publicationDate: {},
  project: [],
  contentType: [],
  productionType: [],
  language: [],
  channels: [],
  overdueStatus: [],
}

function readCurrentSearchParams(fallback: { toString: () => string }): URLSearchParams {
  if (typeof window !== "undefined") return new URLSearchParams(window.location.search)
  return new URLSearchParams(fallback.toString())
}
const USER_ALLOWED_TABS: TabValue[] = [
  'overview',
  'projects',
  'comments',
  'skills',
  'tasks',
  'preferences',
  'reviews',
  'occupation',
]

type SortField = 'content_type_title' | 'production_type_title' | 'language_name' | 'valid_from' | 'price_novat' | 'price_withvat'
type SortOrder = 'asc' | 'desc'

// Reviews Tab Types
interface UserReviewSummary {
  user_id: number
  review_count: number
  avg_score: number | null
  avg_seo: number | null
  avg_relevance: number | null
  avg_grammar: number | null
  avg_delays: number | null
}

interface UserReviewDetailed {
  review_id: number
  task_id: number
  user_id: number
  reviewer_id: number
  review_score: number | null
  score_seo: number | null
  score_relevance: number | null
  score_grammar: number | null
  score_delays: number | null
  positive_feedback: string | null
  negative_feedback: string | null
  review_title: string | null
  created_at: string
  updated_at: string
  task_title: string
  project_id: number
  project_name: string | null
  delivery_date: string | null
  publication_date: string | null
}

type SortOption = "recent" | "oldest" | "best" | "worst"

// Occupation Tab Types
interface UserOccupationPoint {
  user_id: number
  date: string
  total_hours: number
  occupation: number
  is_ooh: boolean | null
  ooh_type: string | null
}

interface OccupationSummary {
  today_occupation: number
  yesterday_occupation: number
  last_7d_avg_occupation: number
  last_30d_avg_occupation: number
}

interface BacklogSummary {
  backlog_hours: number
  backlog_days: number
}

interface UserOccupationTask {
  task_id: number
  title: string
  project_id: number
  project_name: string | null
  delivery_date: string | null
  publication_date: string | null
  is_overdue: boolean | null
  estimated_hours: number | null
}

type TimeFrame = "next7" | "last7" | "last30"

const supabase = createClientComponentClient()

export function UserDetailsPage({
  userId,
  onClose,
  isDetailsFocused = false,
  onFocusToggle,
  onOpenTaskKeepingDetail,
  onOpenTeamKeepingDetail,
}: UserDetailsPageProps) {
  const isMobile = useMobileDetection()
  const router = useRouter()
  const searchParams = useSearchParams()
  const pathname = usePathname()
  const queryClient = useQueryClient()

  const [taskEditAccessToken, setTaskEditAccessToken] = useState<string | null>(null)
  useEffect(() => {
    void supabase.auth.getSession().then(({ data }) => {
      setTaskEditAccessToken(data.session?.access_token ?? null)
    })
  }, [])
  const { data: taskEditFields } = useTaskEditFields(taskEditAccessToken)

  // URL is the single source of truth for the active tab.
  const tabFromUrl = searchParams.get('centerTab') ?? searchParams.get('rightTab') ?? searchParams.get('tab')
  const activeTab: TabValue = USER_ALLOWED_TABS.includes(tabFromUrl as TabValue)
    ? (tabFromUrl as TabValue)
    : 'overview'

  // State for dialogs
  const [showDeleteDialog, setShowDeleteDialog] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)
  const [isChatLoading, setIsChatLoading] = useState(false)
  const [showEditProfileDialog, setShowEditProfileDialog] = useState(false)
  const [isPhotoUploading, setIsPhotoUploading] = useState(false)
  const photoInputRef = useRef<HTMLInputElement | null>(null)
  const tabsScrollRef = useRef<HTMLDivElement | null>(null)
  const [isTabsHovered, setIsTabsHovered] = useState(false)
  const [editProfileForm, setEditProfileForm] = useState({
    full_name: "",
  })

  // Content Skills state
  const [showSkillDialog, setShowSkillDialog] = useState(false)
  const [editingSkill, setEditingSkill] = useState<UserContentSkill | null>(null)
  const [skillForm, setSkillForm] = useState({
    contentTypeId: "",
    productionTypeId: "",
    languageId: "",
    validFrom: new Date().toISOString().split('T')[0],
    priceNoVat: "",
    priceWithVat: "",
    notes: "",
  })

  // Project membership state
  const [showAddProjectDialog, setShowAddProjectDialog] = useState(false)
  const [selectedProjectId, setSelectedProjectId] = useState<number | null>(null)

  // Team membership state
  const [showAddTeamDialog, setShowAddTeamDialog] = useState(false)
  const [selectedTeamId, setSelectedTeamId] = useState<number | null>(null)
  const [selectedRoleId, setSelectedRoleId] = useState<number | null>(null)

  // Skills table state
  const [skillsSearch, setSkillsSearch] = useState("")
  const skillsSortField = 'valid_from' as SortField
  const skillsSortOrder = 'desc' as SortOrder

  // Tasks view state
  const [taskViewMode, setTaskViewMode] = useState<TaskViewMode>('list')

  // Overview sub-view (Upcoming / Overdue / Publication) — URL-backed so reloads
  // and browser back/forward preserve the selected pill.
  const readOverviewViewFromUrl = useCallback((): UserOverviewView => {
    const raw =
      typeof window !== "undefined"
        ? new URLSearchParams(window.location.search).get(USER_OVERVIEW_VIEW_PARAM)
        : searchParams.get(USER_OVERVIEW_VIEW_PARAM)
    return USER_OVERVIEW_VIEWS.includes(raw as UserOverviewView)
      ? (raw as UserOverviewView)
      : 'upcoming'
  }, [searchParams])
  const [overviewView, setOverviewView] = useState<UserOverviewView>(readOverviewViewFromUrl)

  // Keep the pill in sync with browser back/forward and other shallow URL writes.
  useEffect(() => {
    if (typeof window === "undefined") return
    const sync = () => setOverviewView(readOverviewViewFromUrl())
    sync()
    window.addEventListener("popstate", sync)
    window.addEventListener(TASKS_SHALLOW_NAV_EVENT, sync)
    return () => {
      window.removeEventListener("popstate", sync)
      window.removeEventListener(TASKS_SHALLOW_NAV_EVENT, sync)
    }
  }, [readOverviewViewFromUrl])

  const handleOverviewViewChange = useCallback((value: string) => {
    if (!USER_OVERVIEW_VIEWS.includes(value as UserOverviewView)) return
    const next = value as UserOverviewView
    setOverviewView(next)
    mergeWorkspaceUrlState(
      { [USER_OVERVIEW_VIEW_PARAM]: next === 'upcoming' ? null : next },
      { source: "user-overview-view-change" },
    )
  }, [])

  // Reviews Tab state
  const [reviewSummary, setReviewSummary] = useState<UserReviewSummary | null>(null)
  const [reviews, setReviews] = useState<UserReviewDetailed[]>([])
  const [sortedReviews, setSortedReviews] = useState<UserReviewDetailed[]>([])
  const [isLoadingReviewSummary, setIsLoadingReviewSummary] = useState(true)
  const [isLoadingReviews, setIsLoadingReviews] = useState(true)
  const [reviewSortBy, setReviewSortBy] = useState<SortOption>("recent")
  const [expandedReview, setExpandedReview] = useState<number | null>(null)

  // Occupation Tab state
  const [occupationData, setOccupationData] = useState<UserOccupationPoint[]>([])
  const [isLoadingOccupation, setIsLoadingOccupation] = useState(true)
  const [occupationTimeFrame, setOccupationTimeFrame] = useState<TimeFrame>("last7")
  const [occupationDateRange, setOccupationDateRange] = useState<{ from: Date; to: Date } | null>(null)
  const [occupationSummary, setOccupationSummary] = useState<OccupationSummary | null>(null)
  const [occupationBacklog, setOccupationBacklog] = useState<BacklogSummary | null>(null)
  const [isLoadingSummary, setIsLoadingSummary] = useState(true)
  const [selectedOccupationDate, setSelectedOccupationDate] = useState<string | null>(null)
  const [occupationTasks, setOccupationTasks] = useState<UserOccupationTask[]>([])
  const [isLoadingOccupationTasks, setIsLoadingOccupationTasks] = useState(false)
  const [datePickerOpen, setDatePickerOpen] = useState(false)
  const [dateFrom, setDateFrom] = useState<Date | undefined>(undefined)
  const [dateTo, setDateTo] = useState<Date | undefined>(undefined)
  const [occupationRefreshKey, setOccupationRefreshKey] = useState(0)

  // Daily capacity (user_workload_settings) state
  const numericUserId = Number(userId)
  const { data: activeWorkloadSetting, isLoading: isLoadingCapacity } = useQuery({
    queryKey: ["user-workload-setting", numericUserId],
    queryFn: () => getActiveUserWorkloadSetting(numericUserId),
    enabled: Number.isFinite(numericUserId),
  })
  const currentDailyCapacity =
    activeWorkloadSetting?.daily_capacity_hours ?? DEFAULT_DAILY_CAPACITY_HOURS
  const [capacityInput, setCapacityInput] = useState("")
  const [isEditingCapacity, setIsEditingCapacity] = useState(false)

  useEffect(() => {
    if (!isEditingCapacity) {
      setCapacityInput(String(currentDailyCapacity))
    }
  }, [currentDailyCapacity, isEditingCapacity])

  const capacityMutation = useMutation({
    mutationFn: (hours: number) => upsertCurrentDailyCapacity(numericUserId, hours),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["user-workload-setting", numericUserId] })
      // Occupation/backlog figures depend on capacity; re-run the loaders.
      setOccupationRefreshKey((key) => key + 1)
      setIsEditingCapacity(false)
      toast({ title: "Success", description: "Daily capacity updated successfully" })
    },
    onError: (err: any) => {
      toast({
        title: "Error",
        description: err?.message || "Failed to update daily capacity",
        variant: "destructive",
      })
    },
  })

  const handleSaveCapacity = () => {
    const parsed = parseDailyCapacityInput(capacityInput)
    if (parsed === null) {
      toast({
        title: "Invalid value",
        description: "Enter a number greater than 0.",
        variant: "destructive",
      })
      return
    }
    capacityMutation.mutate(parsed)
  }

  const handleCancelCapacityEdit = () => {
    setIsEditingCapacity(false)
    setCapacityInput(String(currentDailyCapacity))
  }

  useEffect(() => {
    console.log("[user-detail] active tab from URL", activeTab)
  }, [activeTab])

  // Handle tab change and update URL
  const handleTabChange = (value: string) => {
    const newTab = value as TabValue
    if (!USER_ALLOWED_TABS.includes(newTab)) return
    if (newTab === activeTab) return
    console.log("[user-detail] tab click", newTab)
    
    const params = new URLSearchParams(
      typeof window !== "undefined" ? window.location.search : searchParams.toString(),
    )
    const isAiRightPane = params.get('rightView') === 'ai'
    const tabPatch = isAiRightPane
      ? {
          centerTab: newTab === "overview" ? null : newTab,
          rightTab: null,
        }
      : {
          rightTab: newTab === "overview" ? null : newTab,
          centerTab: null,
        }
    console.log("[user-detail][tab-write]", {
      source: "tab-click",
      from: activeTab,
      to: newTab,
    })
    mergeWorkspaceUrlState(
      {
        ...tabPatch,
        tab: null,
        detailType: null,
        detailId: null,
        assignedTo: newTab === "tasks" ? String(userId) : null,
      },
      { source: "user-tab-change" },
    )
  }

  useEffect(() => {
    const el = tabsScrollRef.current
    if (!el) return
    const onWheel = (e: WheelEvent) => {
      if (!isTabsHovered) return
      if (el.scrollWidth <= el.clientWidth) return
      let deltaX = e.deltaX
      let deltaY = e.deltaY
      if (e.deltaMode === WheelEvent.DOM_DELTA_LINE) {
        deltaX *= 16
        deltaY *= 16
      } else if (e.deltaMode === WheelEvent.DOM_DELTA_PAGE) {
        deltaX *= el.clientWidth
        deltaY *= el.clientHeight
      }
      const delta = e.shiftKey ? deltaY : Math.abs(deltaX) > Math.abs(deltaY) ? deltaX : deltaY
      if (delta === 0) return
      e.preventDefault()
      el.scrollLeft += delta
    }
    el.addEventListener("wheel", onWheel, { passive: false, capture: true })
    return () => el.removeEventListener("wheel", onWheel, true)
  }, [isTabsHovered])

  // Fetch user profile
  const { data: profile, isLoading: profileLoading, isFetching: profileFetching } = useQuery({
    queryKey: ["user-profile", userId],
    queryFn: async () => {
      const result = await getUserProfile(userId)
      if (result.error) throw result.error
      return result.data
    },
    initialData: () => queryClient.getQueryData<UserProfile>(["user-profile", userId]),
    staleTime: 0,
  })

  // Fetch user projects
  const { data: projects } = useQuery({
    queryKey: ["user-projects", userId],
    queryFn: async () => {
      const result = await getUserProjects(userId)
      if (result.error) throw result.error
      return result.data || []
    },
  })

  // Fetch user teams
  const { data: teams } = useQuery({
    queryKey: ["user-teams", userId],
    queryFn: async () => {
      const result = await getUserTeamsWithRoles(userId)
      if (result.error) throw result.error
      return result.data || []
    },
  })

  // Fetch user tasks
  const { data: tasks } = useQuery({
    queryKey: ["user-tasks", userId],
    queryFn: async () => {
      const result = await getUserTasks(userId)
      if (result.error) throw result.error
      return result.data || []
    },
  })

  // Fetch content skills
  const { data: skills } = useQuery({
    queryKey: ["user-content-skills", userId],
    queryFn: async () => {
      const result = await getUserContentSkills(userId)
      if (result.error) throw result.error
      return result.data || []
    },
  })

  // Fetch lookup data for forms
  const { data: contentTypes } = useQuery({
    queryKey: ["content-types"],
    queryFn: async () => {
      const result = await getContentTypes()
      if (result.error) throw result.error
      return result.data || []
    },
  })

  const { data: productionTypes } = useQuery({
    queryKey: ["production-types"],
    queryFn: async () => {
      const result = await getProductionTypes()
      if (result.error) throw result.error
      return result.data || []
    },
  })

  const { data: languages } = useQuery({
    queryKey: ["languages"],
    queryFn: async () => {
      const result = await getLanguages()
      if (result.error) throw result.error
      return result.data || []
    },
  })

  const { data: roles } = useQuery({
    queryKey: ["roles"],
    queryFn: async () => {
      const result = await getRoles()
      if (result.error) throw result.error
      return result.data || []
    },
  })

  const { data: minimalProjects } = useQuery({
    queryKey: ["projects-minimal"],
    queryFn: async () => {
      const result = await getMinimalProjects()
      if (result.error) throw result.error
      return result.data || []
    },
  })

  const { data: minimalTeams } = useQuery({
    queryKey: ["teams-minimal"],
    queryFn: async () => {
      const result = await getMinimalProjects() // TODO: Should be getMinimalTeams
      if (result.error) throw result.error
      return result.data || []
    },
  })

  // Handle preference toggle
  const handlePreferenceToggle = useCallback(
    async (field: keyof Pick<UserProfile, "send_invoices" | "send_content" | "send_inspiration" | "send_reports">, value: boolean) => {
      if (!profile) return

      // Optimistic update
      queryClient.setQueryData(["user-profile", userId], {
        ...profile,
        [field]: value,
      })

      try {
        const { error } = await updateUserPreferences(userId, { [field]: value })
        
        if (error) throw error

        toast({
          title: "Success",
          description: "Preference updated successfully",
        })
      } catch (err: any) {
        // Revert on error
        queryClient.setQueryData(["user-profile", userId], profile)
        toast({
          title: "Error",
          description: err.message || "Failed to update preference",
          variant: "destructive",
        })
      }
    },
    [profile, userId, queryClient]
  )

  // Handle delete user
  const handleDeleteUser = async () => {
    setIsDeleting(true)
    try {
      const { error } = await softDeleteUser(userId)
      
      if (error) throw error

      toast({
        title: "Success",
        description: "User archived successfully",
      })

      router.push('/users')
    } catch (err: any) {
      toast({
        title: "Error",
        description: err.message || "Failed to archive user",
        variant: "destructive",
      })
    } finally {
      setIsDeleting(false)
      setShowDeleteDialog(false)
    }
  }

  // Handle chat with user
  const handleChatWithUser = async () => {
    setIsChatLoading(true)
    try {
      const { data: thread, error } = await getOrCreateUserThread(userId)
      
      if (error) throw error
      
      if (!thread) {
        throw new Error("Failed to create thread")
      }

      const threadId = typeof thread === 'object' && thread && 'id' in thread ? thread.id : thread

      toast({
        title: "Success",
        description: "Opening chat...",
      })

      // Navigate to user page with chat open in right pane
      const params = new URLSearchParams(searchParams.toString())
      params.set('rightView', 'thread-chat')
      params.set('rightThreadId', String(threadId))
      router.push(`${pathname}?${params.toString()}`)
    } catch (err: any) {
      toast({
        title: "Error",
        description: err.message || "Failed to open chat",
        variant: "destructive",
      })
    } finally {
      setIsChatLoading(false)
    }
  }

  // Handle project/team/task click
  const handleProjectClick = (projectId: number) => {
    router.push(`/projects/${projectId}?tab=overview`)
  }

  const handleTeamClick = useCallback(
    (teamId: number) => {
      if (onOpenTeamKeepingDetail) {
        onOpenTeamKeepingDetail(teamId)
        return
      }
      router.push(`/teams/${teamId}`)
    },
    [onOpenTeamKeepingDetail, router],
  )

  const navigateToTask = useCallback(
    (task: unknown) => {
      const row = task as { id?: number; entity_id?: number }
      const rawId = row.entity_id ?? row.id
      const taskId = Number(rawId)
      if (!Number.isFinite(taskId)) return

      if (onOpenTaskKeepingDetail) {
        onOpenTaskKeepingDetail(task as UserTask)
        return
      }

      router.push(`/tasks?id=${taskId}`)
    },
    [onOpenTaskKeepingDetail, router],
  )

  // Get available projects (not already watching)
  const availableProjects = useMemo(() => {
    if (!minimalProjects || !projects) return minimalProjects || []
    const watchingProjectIds = new Set(projects.map(p => p.project_id))
    return minimalProjects.filter(p => !watchingProjectIds.has(p.id))
  }, [minimalProjects, projects])

  // Get upcoming tasks (next 7 days)
  const upcomingTasks = useMemo(() => {
    if (!tasks) return []
    const now = new Date()
    const next7Days = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000)
    return tasks.filter(task => {
      const deliveryDate = task.delivery_date ? new Date(task.delivery_date) : null
      return deliveryDate && deliveryDate >= now && deliveryDate <= next7Days
    })
  }, [tasks])

  // Get overdue tasks
  const overdueTasks = useMemo(() => {
    if (!tasks) return []
    return tasks.filter(task => task.is_overdue)
  }, [tasks])

  // Get publication overdue tasks
  const publicationOverdueTasks = useMemo(() => {
    if (!tasks) return []
    return tasks.filter(task => task.is_publication_overdue)
  }, [tasks])

  const projectLogoUrlByProjectId = useMemo(() => {
    const m = new Map<number, string | null>()
    for (const p of minimalProjects ?? []) {
      const row = p as { id: number; logo?: string | null }
      m.set(row.id, getImageUrl(row.logo ?? null))
    }
    return m
  }, [minimalProjects])

  const resolveProjectStatusColor = useCallback(
    (projectId: number, statusId: number | null | undefined) => {
      if (statusId == null || !taskEditFields?.project_statuses?.length) return null
      const list = taskEditFields.project_statuses
      const exact = list.find((s) => s.id === statusId && s.project_id === projectId)
      if (exact?.color) return exact.color
      return list.find((s) => s.id === statusId)?.color ?? null
    },
    [taskEditFields],
  )

  const enrichUserTaskOverviewRow = useCallback(
    (task: UserTask): TaskOverviewRowData => {
      const statusColor =
        resolveProjectStatusColor(task.project_id, task.project_status_id) ??
        task.project_status_color ??
        null
      // Overview tables use `getUserTasks` → `v_user_tasks_i_can_see` (assigned_to_id = this user).
      // Prefer profile photo (reliable); fall back to row field if types/strict equality ever diverge.
      const assigneePhotoUrl =
        getImageUrl(profile?.photo ?? null) || getImageUrl(task.assigned_to_photo ?? null)
      return {
        id: task.id,
        title: task.title,
        assigned_to_id: task.assigned_to_id,
        assigned_to_name: task.assigned_to_name,
        assignee_photo_url: assigneePhotoUrl,
        project_name: task.project_name,
        project_color: task.project_color,
        project_logo_url: projectLogoUrlByProjectId.get(task.project_id) ?? null,
        status_name: task.project_status_name,
        status_color: statusColor,
        delivery_date: task.delivery_date,
        publication_date: task.publication_date,
        is_delivery_overdue: Boolean(task.is_overdue),
        is_publication_overdue: Boolean(task.is_publication_overdue),
      }
    },
    [profile?.photo, projectLogoUrlByProjectId, resolveProjectStatusColor],
  )

  const upcomingOverviewRows = useMemo(
    () => upcomingTasks.map(enrichUserTaskOverviewRow),
    [upcomingTasks, enrichUserTaskOverviewRow],
  )
  const overdueOverviewRows = useMemo(
    () => overdueTasks.map(enrichUserTaskOverviewRow),
    [overdueTasks, enrichUserTaskOverviewRow],
  )
  const publicationOverdueOverviewRows = useMemo(
    () => publicationOverdueTasks.map(enrichUserTaskOverviewRow),
    [publicationOverdueTasks, enrichUserTaskOverviewRow],
  )

  const handleOverviewRowActivate = useCallback(
    (row: TaskOverviewRowData) => {
      const task = tasks?.find((t) => t.id === row.id)
      if (task) navigateToTask(task)
    },
    [tasks, navigateToTask],
  )

  const handleSeeMoreOverviewUpcoming = useCallback(() => {
    const base = readCurrentSearchParams(searchParams)
    const now = new Date()
    const next7Days = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000)
    const startDay = new Date(now.getFullYear(), now.getMonth(), now.getDate())
    const lastDay = new Date(next7Days.getFullYear(), next7Days.getMonth(), next7Days.getDate())
    const endExclusive = new Date(lastDay.getFullYear(), lastDay.getMonth(), lastDay.getDate() + 1)
    const filters: TaskFiltersForUrl = {
      ...EMPTY_TASK_FILTERS_FOR_URL,
      assignedTo: [String(userId)],
      deliveryDate: { from: startDay, to: endExclusive },
    }
    shallowReplaceSearchParams(pathname, buildSeeMoreTasksSearchParams(base, filters))
  }, [pathname, searchParams, userId])

  const handleSeeMoreOverviewDeliveryOverdue = useCallback(() => {
    const base = readCurrentSearchParams(searchParams)
    const filters: TaskFiltersForUrl = {
      ...EMPTY_TASK_FILTERS_FOR_URL,
      assignedTo: [String(userId)],
      overdueStatus: ["delivery_overdue"],
    }
    shallowReplaceSearchParams(pathname, buildSeeMoreTasksSearchParams(base, filters))
  }, [pathname, searchParams, userId])

  const handleSeeMoreOverviewPublicationOverdue = useCallback(() => {
    const base = readCurrentSearchParams(searchParams)
    const filters: TaskFiltersForUrl = {
      ...EMPTY_TASK_FILTERS_FOR_URL,
      assignedTo: [String(userId)],
      overdueStatus: ["publication_overdue"],
    }
    shallowReplaceSearchParams(pathname, buildSeeMoreTasksSearchParams(base, filters))
  }, [pathname, searchParams, userId])

  // Filtered and sorted skills
  const filteredAndSortedSkills = useMemo(() => {
    if (!skills) return []
    
    let filtered = skills.filter(skill => {
      if (!skillsSearch) return true
      const searchLower = skillsSearch.toLowerCase()
      return (
        skill.content_type_title?.toLowerCase().includes(searchLower) ||
        skill.production_type_title?.toLowerCase().includes(searchLower) ||
        skill.language_name?.toLowerCase().includes(searchLower) ||
        skill.language_code?.toLowerCase().includes(searchLower) ||
        skill.notes?.toLowerCase().includes(searchLower)
      )
    })

    filtered.sort((a, b) => {
      let aVal = a[skillsSortField]
      let bVal = b[skillsSortField]
      
      if (aVal === null || aVal === undefined) return 1
      if (bVal === null || bVal === undefined) return -1
      
      if (typeof aVal === 'string') aVal = aVal.toLowerCase()
      if (typeof bVal === 'string') bVal = bVal.toLowerCase()
      
      if (aVal < bVal) return skillsSortOrder === 'asc' ? -1 : 1
      if (aVal > bVal) return skillsSortOrder === 'asc' ? 1 : -1
      return 0
    })

    return filtered
  }, [skills, skillsSearch, skillsSortField, skillsSortOrder])

  // Content Skills Handlers
  const handleOpenSkillDialog = useCallback((skill?: UserContentSkill) => {
    if (skill) {
      setEditingSkill(skill)
      setSkillForm({
        contentTypeId: String(skill.content_type_id || ""),
        productionTypeId: String(skill.production_type_id || ""),
        languageId: String(skill.language_id || ""),
        validFrom: skill.valid_from || new Date().toISOString().split('T')[0],
        priceNoVat: skill.price_novat || "",
        priceWithVat: skill.price_withvat || "",
        notes: skill.notes || "",
      })
    } else {
      setEditingSkill(null)
      setSkillForm({
        contentTypeId: "",
        productionTypeId: "",
        languageId: "",
        validFrom: new Date().toISOString().split('T')[0],
        priceNoVat: "",
        priceWithVat: "",
        notes: "",
      })
    }
    setShowSkillDialog(true)
  }, [])

  const handleSaveSkill = async () => {
    try {
      if (editingSkill) {
        const { error } = await updateUserContentSkill({
          costId: editingSkill.id,
          contentTypeId: parseInt(skillForm.contentTypeId),
          productionTypeId: parseInt(skillForm.productionTypeId),
          languageId: parseInt(skillForm.languageId),
          validFrom: skillForm.validFrom,
          priceNoVat: parseFloat(skillForm.priceNoVat),
          priceWithVat: parseFloat(skillForm.priceWithVat),
          notes: skillForm.notes || null
        })
        if (error) throw error
      } else {
        const { error } = await addUserContentSkill({
          userId,
          contentTypeId: parseInt(skillForm.contentTypeId),
          productionTypeId: parseInt(skillForm.productionTypeId),
          languageId: parseInt(skillForm.languageId),
          validFrom: skillForm.validFrom,
          priceNoVat: parseFloat(skillForm.priceNoVat),
          priceWithVat: parseFloat(skillForm.priceWithVat),
          notes: skillForm.notes || undefined
        })
        if (error) throw error
      }

      toast({
        title: "Success",
        description: `Skill ${editingSkill ? 'updated' : 'added'} successfully`,
      })

      queryClient.invalidateQueries({ queryKey: ["user-content-skills", userId] })
      setShowSkillDialog(false)
    } catch (err: any) {
      toast({
        title: "Error",
        description: err.message || "Failed to save skill",
        variant: "destructive",
      })
    }
  }

  const handleDeleteSkill = async (skillId: number) => {
    try {
      const { error } = await deleteUserContentSkill(skillId)
      if (error) throw error

      toast({
        title: "Success",
        description: "Skill deleted successfully",
      })

      queryClient.invalidateQueries({ queryKey: ["user-content-skills", userId] })
    } catch (err: any) {
      toast({
        title: "Error",
        description: err.message || "Failed to delete skill",
        variant: "destructive",
      })
    }
  }

  // Project membership handlers
  const handleAddToProject = async () => {
    if (!selectedProjectId) return

    try {
      const { error } = await addUserToProject(userId, selectedProjectId)
      if (error) throw error

      toast({
        title: "Success",
        description: "User added to project successfully",
      })

      queryClient.invalidateQueries({ queryKey: ["user-projects", userId] })
      setShowAddProjectDialog(false)
      setSelectedProjectId(null)
    } catch (err: any) {
      toast({
        title: "Error",
        description: err.message || "Failed to add user to project",
        variant: "destructive",
      })
    }
  }

  const handleRemoveFromProject = async (projectId: number) => {
    try {
      const { error} = await removeUserFromProject(userId, projectId)
      if (error) throw error

      toast({
        title: "Success",
        description: "User removed from project successfully",
      })

      queryClient.invalidateQueries({ queryKey: ["user-projects", userId] })
    } catch (err: any) {
      toast({
        title: "Error",
        description: err.message || "Failed to remove user from project",
        variant: "destructive",
      })
    }
  }

  // Team membership handlers
  const handleAddToTeam = async () => {
    if (!selectedTeamId || !selectedRoleId) return

    try {
      const { error } = await addUserToTeam(userId, selectedTeamId, selectedRoleId)
      if (error) throw error

      toast({
        title: "Success",
        description: "User added to team successfully",
      })

      queryClient.invalidateQueries({ queryKey: ["user-teams", userId] })
      setShowAddTeamDialog(false)
      setSelectedTeamId(null)
      setSelectedRoleId(null)
    } catch (err: any) {
      toast({
        title: "Error",
        description: err.message || "Failed to add user to team",
        variant: "destructive",
      })
    }
  }

  const handleRemoveFromTeam = async (teamId: number) => {
    try {
      const { error } = await removeUserFromTeam(userId, teamId)
      if (error) throw error

      toast({
        title: "Success",
        description: "User removed from team successfully",
      })

      queryClient.invalidateQueries({ queryKey: ["user-teams", userId] })
    } catch (err: any) {
      toast({
        title: "Error",
        description: err.message || "Failed to remove user from team",
        variant: "destructive",
      })
    }
  }

  // Profile editing handlers
  const handleOpenEditProfile = () => {
    setEditProfileForm({
      full_name: profile?.full_name || "",
    })
    setShowEditProfileDialog(true)
  }

  const handleUpdateProfile = async () => {
    if (!editProfileForm.full_name.trim()) {
      toast({
        title: "Error",
        description: "Name is required",
        variant: "destructive",
      })
      return
    }

    try {
      const { error } = await updateUserProfile(userId, {
        full_name: editProfileForm.full_name,
      })
      if (error) throw error

      toast({
        title: "Success",
        description: "Profile updated successfully",
      })

      queryClient.invalidateQueries({ queryKey: ["user-profile", userId] })
      setShowEditProfileDialog(false)
    } catch (err: any) {
      toast({
        title: "Error",
        description: err.message || "Failed to update profile",
        variant: "destructive",
      })
    }
  }

  // Reviews Tab Functions
  useEffect(() => {
    if (activeTab === 'reviews') {
      loadReviewSummary()
      loadReviews()
    }
  }, [userId, activeTab])

  useEffect(() => {
    sortReviews()
  }, [reviews, reviewSortBy])

  const loadReviewSummary = async () => {
    setIsLoadingReviewSummary(true)
    try {
      const { data, error } = await supabase
        .from("v_user_review_summary")
        .select("*")
        .eq("user_id", userId)
        .maybeSingle()

      if (error) throw error

      setReviewSummary(data)
    } catch (error) {
      console.error("Error loading review summary:", error)
      toast({
        title: "Error",
        description: "Failed to load review summary",
        variant: "destructive",
      })
    } finally {
      setIsLoadingReviewSummary(false)
    }
  }

  const loadReviews = async () => {
    setIsLoadingReviews(true)
    try {
      const { data, error } = await supabase
        .from("v_user_reviews_detailed")
        .select("*")
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .limit(100)

      if (error) throw error

      setReviews(data || [])
    } catch (error) {
      console.error("Error loading reviews:", error)
      toast({
        title: "Error",
        description: "Failed to load reviews",
        variant: "destructive",
      })
    } finally {
      setIsLoadingReviews(false)
    }
  }

  const sortReviews = () => {
    const sorted = [...reviews]

    switch (reviewSortBy) {
      case "recent":
        sorted.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
        break
      case "oldest":
        sorted.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
        break
      case "best":
        sorted.sort((a, b) => (b.review_score || 0) - (a.review_score || 0))
        break
      case "worst":
        sorted.sort((a, b) => (a.review_score || 0) - (b.review_score || 0))
        break
    }

    setSortedReviews(sorted)
  }

  const formatReviewScore = (score: number | null) => {
    if (score === null) return "N/A"
    return score.toFixed(1)
  }

  const getReviewScoreColor = (score: number | null) => {
    if (score === null) return "text-gray-400"
    if (score >= 8) return "text-green-600"
    if (score >= 6) return "text-yellow-600"
    return "text-red-600"
  }

  const formatReviewDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
    })
  }

  // Occupation Tab Functions
  useEffect(() => {
    if (activeTab === 'occupation') {
      loadOccupationSummary()
      loadOccupationBacklog()
      if (occupationDateRange) {
        loadOccupationDataByRange(occupationDateRange.from, occupationDateRange.to)
      } else {
        loadOccupationData(occupationTimeFrame)
      }
    }
  }, [userId, occupationTimeFrame, activeTab, occupationDateRange, occupationRefreshKey])

  useEffect(() => {
    if (selectedOccupationDate) {
      loadOccupationTasks(selectedOccupationDate)
    } else {
      setOccupationTasks([])
    }
  }, [selectedOccupationDate, userId])

  const loadOccupationSummary = async () => {
    setIsLoadingSummary(true)
    try {
      const { data, error } = await supabase.rpc("fn_get_user_occupation_summary", {
        p_user_id: userId,
      })

      if (error) throw error

      if (data && data.length > 0) {
        setOccupationSummary(data[0])
      }
    } catch (error) {
      console.error("Error loading occupation summary:", error)
      toast({
        title: "Error",
        description: "Failed to load occupation summary",
        variant: "destructive",
      })
    } finally {
      setIsLoadingSummary(false)
    }
  }

  const loadOccupationBacklog = async () => {
    try {
      const { data, error } = await supabase.rpc("fn_get_user_backlog", {
        p_user_id: userId,
      })

      if (error) throw error

      if (data && data.length > 0) {
        setOccupationBacklog(data[0])
      }
    } catch (error) {
      console.error("Error loading occupation backlog:", error)
      toast({
        title: "Error",
        description: "Failed to load backlog",
        variant: "destructive",
      })
    }
  }

  const loadOccupationTasks = async (date: string) => {
    setIsLoadingOccupationTasks(true)
    try {
      const { data, error } = await supabase.rpc("fn_get_user_tasks_for_date", {
        p_user_id: userId,
        p_date: date,
      })

      if (error) throw error

      setOccupationTasks(data || [])
    } catch (error) {
      console.error("Error loading occupation tasks:", error)
      toast({
        title: "Error",
        description: "Failed to load tasks for date",
        variant: "destructive",
      })
    } finally {
      setIsLoadingOccupationTasks(false)
    }
  }

  const loadOccupationDataByRange = async (from: Date, to: Date) => {
    setIsLoadingOccupation(true)
    try {
      const startDate = from.toISOString().split("T")[0]
      const endDate = to.toISOString().split("T")[0]
      console.log('[Occupation] Loading data for range:', { startDate, endDate, from, to })
      
      const { data, error } = await supabase.rpc("fn_get_user_occupation", {
        p_user_id: userId,
        p_start_date: startDate,
        p_end_date: endDate,
      })

      if (error) throw error

      console.log('[Occupation] Received data points:', data?.length || 0, 'First:', data?.[0]?.date, 'Last:', data?.[data?.length - 1]?.date)
      setOccupationData(data || [])
    } catch (error) {
      console.error("Error loading occupation data:", error)
      toast({
        title: "Error",
        description: "Failed to load occupation data",
        variant: "destructive",
      })
    } finally {
      setIsLoadingOccupation(false)
    }
  }

  const loadOccupationData = async (frame: TimeFrame) => {
    setIsLoadingOccupation(true)
    try {
      const { startDate, endDate } = getOccupationDateRange(frame)

      const { data, error } = await supabase.rpc("fn_get_user_occupation", {
        p_user_id: userId,
        p_start_date: startDate,
        p_end_date: endDate,
      })

      if (error) throw error

      setOccupationData(data || [])
    } catch (error) {
      console.error("Error loading occupation data:", error)
      toast({
        title: "Error",
        description: "Failed to load occupation data",
        variant: "destructive",
      })
    } finally {
      setIsLoadingOccupation(false)
    }
  }

  const getOccupationDateRange = (frame: TimeFrame): { startDate: string; endDate: string } => {
    const today = new Date()
    let startDate: Date
    let endDate: Date

    switch (frame) {
      case "next7":
        startDate = new Date(today)
        endDate = new Date(today)
        endDate.setDate(endDate.getDate() + 7)
        break
      case "last7":
        // Default: 7 days before and 7 days after (14 days total)
        startDate = new Date(today)
        startDate.setDate(startDate.getDate() - 7)
        endDate = new Date(today)
        endDate.setDate(endDate.getDate() + 7)
        break
      case "last30":
        startDate = new Date(today)
        startDate.setDate(startDate.getDate() - 30)
        endDate = new Date(today)
        break
    }

    return {
      startDate: startDate.toISOString().split("T")[0],
      endDate: endDate.toISOString().split("T")[0],
    }
  }

  const formatOccupationChartData = () => {
    // Determine date range
    let startDate: Date
    let endDate: Date
    
    if (occupationDateRange) {
      startDate = new Date(occupationDateRange.from)
      endDate = new Date(occupationDateRange.to)
    } else {
      const range = getOccupationDateRange(occupationTimeFrame)
      startDate = new Date(range.startDate)
      endDate = new Date(range.endDate)
    }
    
    // Create a map of existing data points by date
    const dataMap = new Map<string, UserOccupationPoint>()
    occupationData.forEach(point => {
      dataMap.set(point.date, point)
    })
    
    // Generate all dates in range and fill missing ones with 0
    const chartData: any[] = []
    const currentDate = new Date(startDate)
    const todayStr = new Date().toISOString().split("T")[0]
    
    while (currentDate <= endDate) {
      const dateStr = currentDate.toISOString().split("T")[0]
      const existingPoint = dataMap.get(dateStr)
      
      chartData.push({
        date: formatOccupationDate(dateStr),
        rawDate: dateStr,
        occupation: existingPoint ? Math.round(existingPoint.occupation * 100) : 0,
        totalHours: existingPoint ? existingPoint.total_hours : 0,
        isOoh: existingPoint ? existingPoint.is_ooh : false,
        oohType: existingPoint ? existingPoint.ooh_type : null,
        isToday: dateStr === todayStr,
      })
      
      currentDate.setDate(currentDate.getDate() + 1)
    }
    
    return chartData
  }
  
  const getTodayDateString = () => {
    return new Date().toISOString().split("T")[0]
  }
  
  const getTodayFormattedDate = () => {
    return formatOccupationDate(getTodayDateString())
  }

  const getLineColor = (occupation: number) => {
    if (occupation > 100) return "#dc2626" // red-600
    if (occupation >= 80) return "#f97316" // orange-500
    return "#3b82f6" // blue-500
  }

  const getAverageOccupation = () => {
    if (occupationData.length === 0) return 0
    const avg = occupationData.reduce((acc, point) => acc + point.occupation, 0) / occupationData.length
    return Math.round(avg * 100)
  }

  const CustomDot = (props: any) => {
    const { cx, cy, payload } = props
    if (!cx || !cy) return null
    return (
      <circle
        cx={cx}
        cy={cy}
        r={4}
        fill="#3b82f6"
        stroke="#fff"
        strokeWidth={2}
        style={{ cursor: "pointer" }}
        onClick={(e) => {
          e.stopPropagation()
          console.log("Dot clicked, payload:", payload)
          if (payload && payload.rawDate) {
            console.log("Setting date to:", payload.rawDate)
            setSelectedOccupationDate(payload.rawDate)
          } else {
            console.log("No rawDate in payload:", payload)
          }
        }}
      />
    )
  }

  const CustomActiveDot = (props: any) => {
    const { cx, cy, payload } = props
    if (!cx || !cy) return null
    return (
      <circle
        cx={cx}
        cy={cy}
        r={8}
        fill="#3b82f6"
        stroke="#fff"
        strokeWidth={2}
        style={{ cursor: "pointer" }}
        onClick={(e) => {
          e.stopPropagation()
          console.log("Active dot clicked, payload:", payload)
          if (payload && payload.rawDate) {
            console.log("Setting date to:", payload.rawDate)
            setSelectedOccupationDate(payload.rawDate)
          } else {
            console.log("No rawDate in payload:", payload)
          }
        }}
      />
    )
  }

  const handleTimeFrameChange = (frame: TimeFrame) => {
    setOccupationTimeFrame(frame)
    setOccupationDateRange(null)
    setSelectedOccupationDate(null)
    setDateFrom(undefined)
    setDateTo(undefined)
    setDatePickerOpen(false)
  }

  const handleCustomDateRange = () => {
    if (dateFrom && dateTo) {
      setOccupationDateRange({ from: dateFrom, to: dateTo })
      setOccupationTimeFrame("next7") // Reset preset to show custom is active
      setSelectedOccupationDate(null)
      setDatePickerOpen(false)
    }
  }

  const formatDateRange = () => {
    if (occupationDateRange) {
      const from = occupationDateRange.from.toLocaleDateString("en-US", { month: "short", day: "numeric" })
      const to = occupationDateRange.to.toLocaleDateString("en-US", { month: "short", day: "numeric" })
      return `${from} - ${to}`
    }
    if (occupationTimeFrame === "next7") return "Next 7 days"
    if (occupationTimeFrame === "last7") return "Last 7 days"
    if (occupationTimeFrame === "last30") return "Last 30 days"
    return "Select dates"
  }

  const OCCUPATION_QUICK_RANGES: { frame: TimeFrame; label: string }[] = [
    { frame: "next7", label: "Next 7 days" },
    { frame: "last7", label: "Last 7 days" },
    { frame: "last30", label: "Last 30 days" },
  ]

  const formatOccupationDate = (dateString: string) => {
    const date = new Date(dateString)
    return date.toLocaleDateString("en-US", { month: "short", day: "numeric" })
  }

  const OccupationCustomTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length) {
      const data = payload[0].payload
      return (
        <div className="bg-white border border-gray-200 rounded-lg shadow-lg p-3">
          <p className="font-semibold text-sm">{data.date}</p>
          <p className="text-sm text-gray-600">
            Occupation: <span className="font-semibold">{data.occupation}%</span>
          </p>
          <p className="text-sm text-gray-600">
            Total Hours: <span className="font-semibold">{data.totalHours}</span>
          </p>
          {data.isOoh && (
            <p className="text-sm text-orange-600 mt-1">
              Out of Hours{data.oohType ? ` (${data.oohType})` : ""}
            </p>
          )}
        </div>
      )
    }
    return null
  }

  const tabTriggerClassName =
    "relative rounded-none border-b-2 border-transparent data-[state=active]:bg-transparent data-[state=active]:shadow-none after:pointer-events-none after:absolute after:inset-x-0 after:bottom-[-5px] after:h-px after:bg-transparent data-[state=active]:after:bg-black"

  if (profileLoading && !profile) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
      </div>
    )
  }

  if (!profile) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center">
          <p className="text-gray-500">User not found</p>
        </div>
      </div>
    )
  }

  const photoUrl = getImageUrl(profile.photo)

  const mobileUserActions: MobileDetailAction[] = [
    {
      id: 'edit-profile',
      label: 'Edit profile',
      icon: <Edit className="h-4 w-4" />,
      onSelect: handleOpenEditProfile,
    },
    {
      id: 'chat',
      label: 'Chat',
      icon: isChatLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <MessageSquare className="h-4 w-4" />,
      onSelect: handleChatWithUser,
      disabled: isChatLoading,
    },
    {
      id: 'archive',
      label: 'Archive',
      icon: <Trash2 className="h-4 w-4" />,
      onSelect: () => setShowDeleteDialog(true),
      destructive: true,
      separatorBefore: true,
    },
  ]

  return (
    <div className="flex flex-col h-full">
      {/* Mobile header: stable title + top-right "..." overflow with user actions. */}
      {isMobile ? (
        <MobileDetailHeader
          onBack={onClose}
          backLabel="Close details"
          title={profile.full_name || profile.auth_email}
          subtitle={profile.auth_email}
          leadingSlot={
            <UserAvatar
              name={profile.full_name || profile.auth_email}
              photoUrl={photoUrl}
              size="sm"
            />
          }
          actions={mobileUserActions}
        />
      ) : (
      /* Header */
      <div className="flex items-center justify-between px-6 py-4 bg-white border-t-0">
        <div className="flex min-w-0 items-center gap-4">
          <UserAvatar
            name={profile.full_name || profile.auth_email}
            photoUrl={photoUrl}
            size="lg"
            className="border-2 border-gray-200"
          />
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-semibold text-gray-900">
                {profile.full_name || profile.auth_email}
              </h1>
              {profileFetching && (profile as UserProfile & { __partial?: boolean }).__partial ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin text-gray-400" aria-label="Loading full details" />
              ) : null}
              <Button
                variant="ghost"
                size="sm"
                onClick={handleOpenEditProfile}
                className="h-6 w-6 p-0"
              >
                <Edit className="w-3 h-3" />
              </Button>
            </div>
            <p className="text-sm text-gray-500 mt-0.5">{profile.auth_email}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={handleChatWithUser}
            disabled={isChatLoading}
            className="h-8 w-8 p-0 text-gray-500 hover:bg-gray-100 hover:text-gray-700"
            aria-label="Chat"
            title="Chat"
          >
            {isChatLoading ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <MessageSquare className="w-4 h-4" />
            )}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setShowDeleteDialog(true)}
            className="h-8 w-8 p-0 text-gray-500 hover:bg-gray-100 hover:text-gray-700"
            aria-label="Archive"
            title="Archive"
          >
            <Trash2 className="w-4 h-4" />
          </Button>
          {onFocusToggle ? (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                console.log("[user-detail] focus click", { focused: !isDetailsFocused })
                onFocusToggle()
              }}
              className="h-8 w-8 p-0 text-gray-500 hover:bg-gray-100 hover:text-gray-700"
              aria-label={isDetailsFocused ? "Restore details pane" : "Expand details pane"}
              title={isDetailsFocused ? "Restore details pane" : "Expand details pane"}
            >
              {isDetailsFocused ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
            </Button>
          ) : null}
          {onClose ? (
            <Button
              variant="ghost"
              size="sm"
              onClick={onClose}
              className="h-8 w-8 p-0 text-gray-500 hover:bg-gray-100 hover:text-gray-700"
              aria-label="Close details"
              title="Close details"
            >
              <XIcon className="w-4 h-4" />
            </Button>
          ) : null}
        </div>
      </div>
      )}

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={handleTabChange} className="flex-1 flex flex-col overflow-hidden">
        <div
          ref={tabsScrollRef}
          className="ai-chat-tabs-scroll min-h-0 min-w-0 overflow-x-auto overflow-y-hidden border-b border-gray-200"
          onMouseEnter={() => setIsTabsHovered(true)}
          onMouseLeave={() => setIsTabsHovered(false)}
        >
          <TabsList className="h-auto flex-nowrap justify-start rounded-none border-t-0 bg-transparent px-6 whitespace-nowrap">
            <TabsTrigger value="overview" className={tabTriggerClassName}>
              Overview
            </TabsTrigger>
            <TabsTrigger value="projects" className={tabTriggerClassName}>
              Projects
            </TabsTrigger>
            <TabsTrigger value="comments" className={tabTriggerClassName}>
              Comments
            </TabsTrigger>
            <TabsTrigger value="skills" className={tabTriggerClassName}>
              Skills
            </TabsTrigger>
            <TabsTrigger value="tasks" className={tabTriggerClassName}>
              Tasks
            </TabsTrigger>
            <TabsTrigger value="preferences" className={tabTriggerClassName}>
              Preferences
            </TabsTrigger>
            <TabsTrigger value="reviews" className={tabTriggerClassName}>
              Reviews
            </TabsTrigger>
            <TabsTrigger value="occupation" className={tabTriggerClassName}>
              Occupation
            </TabsTrigger>
          </TabsList>
        </div>

        {/* Tab Content */}
        <div className="flex-1 overflow-auto">
          {/* Overview Tab */}
          <TabsContent value="overview" className="m-0 mt-0 p-6">
            <UserOverviewStatCards
              cards={[
                {
                  id: "upcoming",
                  label: "Upcoming Tasks",
                  value: upcomingTasks.length,
                  hint: "Next 7 days",
                },
                {
                  id: "overdue",
                  label: "Overdue Tasks",
                  value: overdueTasks.length,
                  hint: "Delivery delayed",
                  valueClassName: "text-red-600",
                },
                {
                  id: "publication-overdue",
                  label: "Publication Overdue",
                  value: publicationOverdueTasks.length,
                  hint: "Publication delayed",
                  valueClassName: "text-orange-600",
                },
                {
                  id: "projects",
                  label: "Active Projects",
                  value: projects?.length || 0,
                  hint: "Watching",
                },
              ]}
            />

            <h3 className="mb-3 text-lg font-semibold">Tasks</h3>
            <Tabs value={overviewView} onValueChange={handleOverviewViewChange} className="space-y-4">
              <TabsList className="h-9 w-full justify-start sm:w-auto">
                <TabsTrigger value="upcoming" className="gap-1.5">
                  Upcoming
                  <span className="rounded-full bg-gray-200 px-1.5 text-[11px] font-semibold leading-5 text-gray-700">
                    {upcomingTasks.length}
                  </span>
                </TabsTrigger>
                <TabsTrigger value="overdue" className="gap-1.5">
                  Overdue
                  <span className="rounded-full bg-gray-200 px-1.5 text-[11px] font-semibold leading-5 text-gray-700">
                    {overdueTasks.length}
                  </span>
                </TabsTrigger>
                <TabsTrigger value="publication" className="gap-1.5">
                  Publication
                  <span className="rounded-full bg-gray-200 px-1.5 text-[11px] font-semibold leading-5 text-gray-700">
                    {publicationOverdueTasks.length}
                  </span>
                </TabsTrigger>
              </TabsList>

              <TabsContent value="upcoming" className="mt-0">
                <TaskOverviewReadonlySection
                  title="Upcoming tasks"
                  subtitle="Delivery in the next 7 days"
                  dateKind="delivery"
                  rows={upcomingOverviewRows}
                  onRowActivate={handleOverviewRowActivate}
                  onSeeMore={handleSeeMoreOverviewUpcoming}
                />
              </TabsContent>
              <TabsContent value="overdue" className="mt-0">
                <TaskOverviewReadonlySection
                  title="Overdue tasks"
                  subtitle="Past delivery date"
                  dateKind="delivery"
                  rows={overdueOverviewRows}
                  onRowActivate={handleOverviewRowActivate}
                  onSeeMore={handleSeeMoreOverviewDeliveryOverdue}
                />
              </TabsContent>
              <TabsContent value="publication" className="mt-0">
                <TaskOverviewReadonlySection
                  title="Publication overdue"
                  subtitle="Past publication date"
                  dateKind="publication"
                  rows={publicationOverdueOverviewRows}
                  onRowActivate={handleOverviewRowActivate}
                  onSeeMore={handleSeeMoreOverviewPublicationOverdue}
                />
              </TabsContent>
            </Tabs>

            <div className="mt-10">
              <h3 className="mb-3 text-lg font-semibold">Teams</h3>
              {teams && teams.length > 0 ? (
                <div className="space-y-2">
                  {teams.map((team) => (
                    <div
                      key={team.team_id}
                      className="cursor-pointer rounded-lg border border-gray-200 bg-white p-3 transition-colors hover:bg-gray-50"
                      onClick={() => handleTeamClick(team.team_id)}
                    >
                      <div className="text-sm font-medium text-gray-900">{team.team_title}</div>
                      <div className="mt-1 flex items-center gap-2">
                        <span className="rounded bg-blue-100 px-2 py-0.5 text-xs text-blue-700">
                          {team.role_title}
                        </span>
                        {team.has_access_app && (
                          <span className="rounded bg-green-100 px-2 py-0.5 text-xs text-green-700">
                            App Access
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="rounded-lg border border-dashed border-gray-300 bg-white py-8 text-center">
                  <p className="text-sm text-gray-500">No teams</p>
                </div>
              )}
            </div>
          </TabsContent>

          {/* Projects Tab */}
          <TabsContent value="projects" className="m-0 mt-0 p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold">Projects Watching</h2>
              <Button onClick={() => setShowAddProjectDialog(true)} size="sm" className="gap-2">
                <Plus className="w-4 h-4" />
                Add to Project
              </Button>
            </div>

            {projects && projects.length > 0 ? (
              <div className="space-y-2">
                {projects.map((project) => (
                  <div
                    key={project.project_id}
                    className="flex items-center gap-3 p-3 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors cursor-pointer"
                    onClick={() => handleProjectClick(project.project_id)}
                  >
                    <div
                      className="w-3 h-3 rounded-full flex-shrink-0"
                      style={{ backgroundColor: project.project_color || '#6b7280' }}
                    />
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-sm text-gray-900 truncate">
                        {project.project_name}
                      </div>
                      {project.project_status && (
                        <div className="text-xs text-gray-500 truncate mt-0.5">
                          Status: {project.project_status}
                        </div>
                      )}
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={(e) => {
                        e.stopPropagation()
                        handleRemoveFromProject(project.project_id)
                      }}
                      className="text-red-600 hover:text-red-700 hover:bg-red-50"
                    >
                      <XIcon className="w-4 h-4" />
                    </Button>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-12 border border-dashed border-gray-300 rounded-lg bg-white">
                <p className="text-sm text-gray-500">No projects</p>
              </div>
            )}
          </TabsContent>

          <TabsContent value="comments" className="m-0 mt-0 p-6">
            <div className="mb-4">
              <h2 className="text-lg font-semibold">Comments</h2>
              <p className="mt-1 text-sm text-gray-500">
                Mentions where you and this user both participate across direct, task, project, and general threads.
              </p>
            </div>
            <UserSharedCommentsTab
              profileUserId={userId}
              isActive={activeTab === "comments"}
              onOpenTaskKeepingDetail={onOpenTaskKeepingDetail}
            />
          </TabsContent>

          {/* Skills Tab */}
          <TabsContent value="skills" className="m-0 mt-0 p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold">Content Skills</h2>
              <div className="flex items-center gap-2">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                  <Input
                    placeholder="Search skills..."
                    value={skillsSearch}
                    onChange={(e) => setSkillsSearch(e.target.value)}
                    className="pl-9 w-64"
                  />
                </div>
                <Button onClick={() => handleOpenSkillDialog()} size="sm" className="gap-2">
                  <Plus className="w-4 h-4" />
                  Add Skill
                </Button>
              </div>
            </div>

            {filteredAndSortedSkills && filteredAndSortedSkills.length > 0 ? (
              <div className="space-y-2">
                {filteredAndSortedSkills.map((skill) => {
                  const languageLabel = skill.language_name || skill.language_code
                  return (
                    <div
                      key={skill.id}
                      className="group rounded-lg border border-gray-200 bg-white p-3 transition-colors hover:bg-gray-50"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="truncate text-sm font-medium text-gray-900">
                            {skill.content_type_title}
                          </div>
                          <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-gray-500">
                            {skill.production_type_title ? (
                              <span className="truncate">{skill.production_type_title}</span>
                            ) : null}
                            {languageLabel ? (
                              <Badge variant="secondary" className="text-[11px]">
                                {languageLabel}
                              </Badge>
                            ) : null}
                          </div>
                        </div>
                        <div className="flex shrink-0 items-center gap-1">
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 w-7 p-0"
                            onClick={() => handleOpenSkillDialog(skill)}
                            aria-label="Edit skill"
                          >
                            <Edit className="w-4 h-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 w-7 p-0 text-red-600 hover:text-red-700 hover:bg-red-50"
                            onClick={() => handleDeleteSkill(skill.id)}
                            aria-label="Delete skill"
                          >
                            <XIcon className="w-4 h-4" />
                          </Button>
                        </div>
                      </div>

                      <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-gray-500">
                        <span>
                          Valid from {skill.valid_from ? new Date(skill.valid_from).toLocaleDateString() : 'N/A'}
                        </span>
                        <span>No VAT: {skill.price_novat || 'N/A'}</span>
                        <span>With VAT: {skill.price_withvat || 'N/A'}</span>
                      </div>

                      {skill.notes ? (
                        <p className="mt-2 text-sm text-gray-600">{skill.notes}</p>
                      ) : null}
                    </div>
                  )
                })}
              </div>
            ) : (
              <div className="text-center py-12 border border-dashed border-gray-300 rounded-lg bg-white">
                <p className="text-sm text-gray-500">
                  {skillsSearch ? 'No skills match your search' : 'No content skills defined'}
                </p>
              </div>
            )}
          </TabsContent>

          {/* Tasks Tab */}
          <TabsContent value="tasks" className="m-0 mt-0 flex flex-col">
            <div className="flex items-center justify-between px-6 pt-4 pb-2">
              <h2 className="text-lg font-semibold">Assigned Tasks</h2>
              <div className="flex items-center gap-2">
                <Button
                  variant={taskViewMode === 'list' ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setTaskViewMode('list')}
                >
                  List
                </Button>
                <Button
                  variant={taskViewMode === 'calendar' ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setTaskViewMode('calendar')}
                >
                  Calendar
                </Button>
                <Button
                  variant={taskViewMode === 'kanban' ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setTaskViewMode('kanban')}
                >
                  Kanban
                </Button>
              </div>
            </div>

            {taskViewMode === 'calendar' ? (
              <div style={{ height: 'calc(100vh - 280px)', minHeight: '600px' }} className="overflow-hidden">
                <CalendarView
                  onTaskClick={navigateToTask}
                  selectedTaskId={searchParams.get('rightTaskId')}
                  enabled={activeTab === 'tasks'}
                />
              </div>
            ) : (
              <div className="flex-1 overflow-hidden">
                {taskViewMode === 'list' && (
                  <TaskList
                    onTaskSelect={navigateToTask}
                    selectedTaskId={searchParams.get('rightTaskId')}
                  />
                )}
                {taskViewMode === 'kanban' && (
                  <KanbanView
                    onTaskSelect={navigateToTask}
                    selectedTaskId={searchParams.get('rightTaskId')}
                    enabled={activeTab === 'tasks'}
                  />
                )}
              </div>
            )}
          </TabsContent>

          {/* Preferences Tab */}
          <TabsContent value="preferences" className="m-0 mt-0 p-6">
            <h2 className="text-lg font-semibold mb-4">Communication Preferences</h2>

            <div className="space-y-4 p-4 bg-white border border-gray-200 rounded-lg max-w-2xl">
              <div className="flex items-center justify-between py-3 border-b">
                <div className="flex items-center gap-3">
                  <Mail className="w-5 h-5 text-gray-500" />
                  <div>
                    <div className="font-medium text-sm">Invoices</div>
                    <div className="text-xs text-gray-500">Receive invoice notifications</div>
                  </div>
                </div>
                <Switch
                  checked={profile.send_invoices || false}
                  onCheckedChange={(checked) => handlePreferenceToggle("send_invoices", checked)}
                />
              </div>

              <div className="flex items-center justify-between py-3 border-b">
                <div className="flex items-center gap-3">
                  <FileText className="w-5 h-5 text-gray-500" />
                  <div>
                    <div className="font-medium text-sm">Content</div>
                    <div className="text-xs text-gray-500">Receive content updates</div>
                  </div>
                </div>
                <Switch
                  checked={profile.send_content || false}
                  onCheckedChange={(checked) => handlePreferenceToggle("send_content", checked)}
                />
              </div>

              <div className="flex items-center justify-between py-3 border-b">
                <div className="flex items-center gap-3">
                  <Lightbulb className="w-5 h-5 text-gray-500" />
                  <div>
                    <div className="font-medium text-sm">Inspiration</div>
                    <div className="text-xs text-gray-500">Receive inspiration emails</div>
                  </div>
                </div>
                <Switch
                  checked={profile.send_inspiration || false}
                  onCheckedChange={(checked) => handlePreferenceToggle("send_inspiration", checked)}
                />
              </div>

              <div className="flex items-center justify-between py-3">
                <div className="flex items-center gap-3">
                  <BarChart3 className="w-5 h-5 text-gray-500" />
                  <div>
                    <div className="font-medium text-sm">Reports</div>
                    <div className="text-xs text-gray-500">Receive report summaries</div>
                  </div>
                </div>
                <Switch
                  checked={profile.send_reports || false}
                  onCheckedChange={(checked) => handlePreferenceToggle("send_reports", checked)}
                />
              </div>
            </div>
          </TabsContent>

          {/* Reviews Tab */}
          <TabsContent value="reviews" className="m-0 mt-0 p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold">Review Summary</h2>
            </div>
            
            {isLoadingReviewSummary ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="w-8 h-8 animate-spin text-gray-400" />
              </div>
            ) : reviewSummary ? (
              <div className="grid grid-cols-1 md:grid-cols-5 gap-4 mb-6">
                <Card className="p-4">
                  <div className="text-sm font-medium text-gray-500">Total Reviews</div>
                  <div className="text-2xl font-bold text-gray-900 mt-1">{reviewSummary.review_count}</div>
                </Card>
                <Card className="p-4">
                  <div className="text-sm font-medium text-gray-500">Average Score</div>
                  <div className={`text-2xl font-bold mt-1 ${getReviewScoreColor(reviewSummary.avg_score)}`}>
                    {formatReviewScore(reviewSummary.avg_score)}
                  </div>
                </Card>
                <Card className="p-4">
                  <div className="text-sm font-medium text-gray-500">SEO</div>
                  <div className={`text-2xl font-bold mt-1 ${getReviewScoreColor(reviewSummary.avg_seo)}`}>
                    {formatReviewScore(reviewSummary.avg_seo)}
                  </div>
                </Card>
                <Card className="p-4">
                  <div className="text-sm font-medium text-gray-500">Relevance</div>
                  <div className={`text-2xl font-bold mt-1 ${getReviewScoreColor(reviewSummary.avg_relevance)}`}>
                    {formatReviewScore(reviewSummary.avg_relevance)}
                  </div>
                </Card>
                <Card className="p-4">
                  <div className="text-sm font-medium text-gray-500">Grammar</div>
                  <div className={`text-2xl font-bold mt-1 ${getReviewScoreColor(reviewSummary.avg_grammar)}`}>
                    {formatReviewScore(reviewSummary.avg_grammar)}
                  </div>
                </Card>
              </div>
            ) : (
              <Card className="p-6 text-center mb-6">
                <p className="text-sm text-gray-500">No review data available</p>
              </Card>
            )}

            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold">Detailed Reviews</h2>
              <div className="flex items-center gap-2">
                <ArrowUpDown className="w-4 h-4 text-gray-500" />
                <Select value={reviewSortBy} onValueChange={(value) => setReviewSortBy(value as SortOption)}>
                  <SelectTrigger className="w-40">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="recent">Most Recent</SelectItem>
                    <SelectItem value="oldest">Oldest</SelectItem>
                    <SelectItem value="best">Best Score</SelectItem>
                    <SelectItem value="worst">Worst Score</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {isLoadingReviews ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="w-8 h-8 animate-spin text-gray-400" />
              </div>
            ) : sortedReviews.length === 0 ? (
              <Card className="p-6 text-center mb-6">
                <p className="text-sm text-gray-500">No reviews available</p>
              </Card>
            ) : (
              <div className="space-y-3 mb-6">
                {sortedReviews.map((review) => (
                  <Card key={review.review_id} className="p-4">
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-3 mb-2">
                          <h3 className="font-semibold text-sm">{review.task_title}</h3>
                          {review.project_name && (
                            <span className="text-xs px-2 py-1 bg-gray-100 rounded">
                              {review.project_name}
                            </span>
                          )}
                          <span className="text-xs text-gray-500">
                            {formatReviewDate(review.created_at)}
                          </span>
                        </div>

                        {review.review_title && (
                          <p className="text-sm text-gray-600 mb-2">{review.review_title}</p>
                        )}

                        <div className="flex items-center gap-4 mb-2">
                          <div className="flex items-center gap-2">
                            <span className="text-xs text-gray-500">Overall:</span>
                            <span className={`text-sm font-semibold ${getReviewScoreColor(review.review_score)}`}>
                              {formatReviewScore(review.review_score)}
                            </span>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="text-xs text-gray-500">SEO:</span>
                            <span className="text-sm font-medium">{formatReviewScore(review.score_seo)}</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="text-xs text-gray-500">Relevance:</span>
                            <span className="text-sm font-medium">{formatReviewScore(review.score_relevance)}</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="text-xs text-gray-500">Grammar:</span>
                            <span className="text-sm font-medium">{formatReviewScore(review.score_grammar)}</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="text-xs text-gray-500">Delays:</span>
                            <span className="text-sm font-medium">{formatReviewScore(review.score_delays)}</span>
                          </div>
                        </div>

                        {(review.positive_feedback || review.negative_feedback) && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() =>
                              setExpandedReview(
                                expandedReview === review.review_id ? null : review.review_id
                              )
                            }
                            className="text-xs h-7 px-2"
                          >
                            {expandedReview === review.review_id ? "Hide" : "Show"} Feedback
                          </Button>
                        )}

                        {expandedReview === review.review_id && (
                          <div className="mt-3 pt-3 border-t space-y-2">
                            {review.positive_feedback && (
                              <div>
                                <div className="text-xs font-semibold text-green-600 mb-1">
                                  Positive Feedback:
                                </div>
                                <p className="text-sm text-gray-700">{review.positive_feedback}</p>
                              </div>
                            )}
                            {review.negative_feedback && (
                              <div>
                                <div className="text-xs font-semibold text-red-600 mb-1">
                                  Areas for Improvement:
                                </div>
                                <p className="text-sm text-gray-700">{review.negative_feedback}</p>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  </Card>
                ))}
              </div>
            )}

            {/* Improvement Plan Section */}
            <ImprovementPlanSection userId={userId} />
          </TabsContent>

          {/* Occupation Tab */}
          <TabsContent value="occupation" className="m-0 mt-0 p-6">
            <h2 className="text-lg font-semibold mb-4">User Occupation</h2>

            {/* Summary Cards */}
            {isLoadingSummary ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="w-8 h-8 animate-spin text-gray-400" />
              </div>
            ) : (
              <UserOccupationStatCards
                cards={[
                  {
                    id: "today",
                    label: "Today",
                    value: `${Math.round((occupationSummary?.today_occupation || 0) * 100)}%`,
                  },
                  {
                    id: "yesterday",
                    label: "Yesterday",
                    value: `${Math.round((occupationSummary?.yesterday_occupation || 0) * 100)}%`,
                  },
                  {
                    id: "last-7d",
                    label: "Last 7 Days",
                    value: `${Math.round((occupationSummary?.last_7d_avg_occupation || 0) * 100)}%`,
                  },
                  {
                    id: "last-30d",
                    label: "Last 30 Days",
                    value: `${Math.round((occupationSummary?.last_30d_avg_occupation || 0) * 100)}%`,
                  },
                  {
                    id: "backlog",
                    label: "Backlog",
                    value: `${occupationBacklog?.backlog_days?.toFixed(1) || 0}d`,
                    valueClassName: "text-orange-600",
                    footer: (
                      <div className="mt-1 text-xs text-gray-500">
                        {occupationBacklog?.backlog_hours?.toFixed(0) || 0} hours
                      </div>
                    ),
                  },
                ]}
              />
            )}

            {/* Date Range Selector */}
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-md font-semibold">Occupation Timeline</h3>
              <Popover open={datePickerOpen} onOpenChange={setDatePickerOpen}>
                <PopoverTrigger asChild>
                  <Button variant="outline" size="sm" className="gap-2">
                    <CalendarIcon className="w-4 h-4" />
                    {formatDateRange()}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-4" align="end">
                  <div className="space-y-4">
                    <div>
                      <Label className="mb-2 block text-xs font-medium uppercase tracking-wide text-gray-500">
                        Quick ranges
                      </Label>
                      <div className="flex flex-col gap-1">
                        {OCCUPATION_QUICK_RANGES.map(({ frame, label }) => (
                          <Button
                            key={frame}
                            type="button"
                            variant={
                              occupationTimeFrame === frame && !occupationDateRange ? "secondary" : "ghost"
                            }
                            size="sm"
                            className="h-8 w-full justify-start px-2 font-normal"
                            onClick={() => handleTimeFrameChange(frame)}
                          >
                            {label}
                          </Button>
                        ))}
                      </div>
                    </div>
                    <div className="border-t border-gray-100 pt-4">
                      <Label className="mb-2 block text-xs font-medium uppercase tracking-wide text-gray-500">
                        Custom range
                      </Label>
                      <div>
                        <Label className="text-sm font-medium mb-2 block">From Date</Label>
                        <Calendar
                          mode="single"
                          selected={dateFrom}
                          onSelect={setDateFrom}
                          initialFocus
                        />
                      </div>
                      <div className="mt-4">
                        <Label className="text-sm font-medium mb-2 block">To Date</Label>
                        <Calendar
                          mode="single"
                          selected={dateTo}
                          onSelect={setDateTo}
                          disabled={(date) => (dateFrom ? date < dateFrom : false)}
                        />
                      </div>
                      <div className="mt-4 flex gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            setDateFrom(undefined)
                            setDateTo(undefined)
                            setDatePickerOpen(false)
                          }}
                          className="flex-1"
                        >
                          Clear
                        </Button>
                        <Button
                          size="sm"
                          onClick={handleCustomDateRange}
                          disabled={!dateFrom || !dateTo}
                          className="flex-1"
                        >
                          Apply
                        </Button>
                      </div>
                    </div>
                  </div>
                </PopoverContent>
              </Popover>
            </div>

            {/* Occupation Chart */}
            <Card className="p-6 mb-6">
              {isLoadingOccupation ? (
                <div className="flex items-center justify-center h-96">
                  <Loader2 className="w-8 h-8 animate-spin text-gray-400" />
                </div>
              ) : (
                <ResponsiveContainer width="100%" height={400}>
                  <LineChart 
                    data={formatOccupationChartData()}
                    onClick={(data: any) => {
                      console.log("LineChart clicked:", data)
                      if (data && data.activePayload && data.activePayload[0] && data.activePayload[0].payload) {
                        const payload = data.activePayload[0].payload
                        console.log("Payload from click:", payload)
                        if (payload.rawDate) {
                          console.log("Setting selected date:", payload.rawDate)
                          setSelectedOccupationDate(payload.rawDate)
                        }
                      }
                    }}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                    <XAxis
                      dataKey="date"
                      stroke="#6b7280"
                      style={{ fontSize: "12px" }}
                      type="category"
                      allowDuplicatedCategory={false}
                    />
                    <YAxis
                      stroke="#6b7280"
                      style={{ fontSize: "12px" }}
                      label={{ value: "Occupation (%)", angle: -90, position: "insideLeft" }}
                      domain={[0, 120]}
                    />
                    <RechartsTooltip content={<OccupationCustomTooltip />} />
                    <Legend />
                    
                    {/* Reference lines for thresholds */}
                    <ReferenceLine 
                      y={80} 
                      stroke="#f97316" 
                      strokeDasharray="3 3" 
                      label={{ value: "80%", position: "right", fill: "#f97316", fontSize: 12 }}
                    />
                    <ReferenceLine 
                      y={100} 
                      stroke="#dc2626" 
                      strokeDasharray="3 3" 
                      label={{ value: "100%", position: "right", fill: "#dc2626", fontSize: 12 }}
                    />
                    {(() => {
                      const todayFormatted = getTodayFormattedDate()
                      const chartData = formatOccupationChartData()
                      const todayIndex = chartData.findIndex(d => d.rawDate === getTodayDateString())
                      if (todayIndex >= 0) {
                        return (
                          <ReferenceLine 
                            x={todayFormatted}
                            stroke="#3b82f6" 
                            strokeWidth={2}
                            label={{ value: "Today", position: "top", fill: "#3b82f6", fontSize: 11 }}
                          />
                        )
                      }
                      return null
                    })()}
                    
                    <Line
                      type="monotone"
                      dataKey="occupation"
                      stroke={getLineColor(getAverageOccupation())}
                      strokeWidth={2}
                      dot={<CustomDot />}
                      activeDot={<CustomActiveDot />}
                      name="Occupation %"
                    />
                  </LineChart>
                </ResponsiveContainer>
              )}
            </Card>

            {/* Daily capacity — discreet detail-style field row */}
            <div className="mb-6 border-t border-gray-200 pt-3">
              <div className="flex items-center justify-between gap-4">
                <span className="text-sm font-normal text-gray-400">Daily capacity (hours)</span>
                <div className="flex items-center justify-end gap-2 text-right">
                  {isLoadingCapacity ? (
                    <Loader2 className="w-4 h-4 animate-spin text-gray-400" />
                  ) : isEditingCapacity ? (
                    <>
                      <Input
                        type="number"
                        min="0"
                        step="0.5"
                        value={capacityInput}
                        onChange={(e) => setCapacityInput(e.target.value)}
                        disabled={capacityMutation.isPending}
                        className="h-8 w-20 text-right"
                      />
                      <Button
                        size="sm"
                        className="h-8"
                        onClick={handleSaveCapacity}
                        disabled={capacityMutation.isPending}
                      >
                        {capacityMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : "Save"}
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-8"
                        onClick={handleCancelCapacityEdit}
                        disabled={capacityMutation.isPending}
                      >
                        Cancel
                      </Button>
                    </>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setIsEditingCapacity(true)}
                      className="group inline-flex items-center gap-1.5 rounded px-1 py-0.5 text-sm font-medium text-gray-900 transition-colors hover:bg-gray-50"
                      title="Edit daily capacity"
                    >
                      <span>{currentDailyCapacity}h</span>
                      <Edit className="w-3.5 h-3.5 text-gray-400 opacity-0 transition-opacity group-hover:opacity-100" />
                    </button>
                  )}
                </div>
              </div>
            </div>

            {/* Tasks for Selected Date */}
            {selectedOccupationDate ? (
              <div>
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-md font-semibold">
                    Tasks for {new Date(selectedOccupationDate).toLocaleDateString("en-US", { 
                      weekday: "long", 
                      year: "numeric", 
                      month: "long", 
                      day: "numeric" 
                    })}
                  </h3>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setSelectedOccupationDate(null)}
                  >
                    <XIcon className="w-4 h-4" />
                  </Button>
                </div>

                {isLoadingOccupationTasks ? (
                  <div className="flex items-center justify-center py-12">
                    <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
                  </div>
                ) : occupationTasks.length === 0 ? (
                  <Card className="p-6 text-center">
                    <p className="text-sm text-gray-500">No tasks scheduled for this date</p>
                  </Card>
                ) : (
                  <div className="space-y-2">
                    {occupationTasks.map((task) => (
                      <Card key={task.task_id} className="p-4">
                        <div className="flex items-start justify-between">
                          <div className="flex-1">
                            <div className="flex items-center gap-2 mb-1">
                              <h4 className="font-medium text-sm">{task.title}</h4>
                              {task.is_overdue && (
                                <span className="text-xs px-2 py-0.5 bg-red-100 text-red-700 rounded">
                                  Overdue
                                </span>
                              )}
                            </div>
                            {task.project_name && (
                              <p className="text-xs text-gray-500 mb-1">
                                Project: {task.project_name}
                              </p>
                            )}
                            <div className="flex items-center gap-4 text-xs text-gray-500">
                              {task.delivery_date && (
                                <span>
                                  Delivery: {new Date(task.delivery_date).toLocaleDateString()}
                                </span>
                              )}
                              {task.publication_date && (
                                <span>
                                  Publication: {new Date(task.publication_date).toLocaleDateString()}
                                </span>
                              )}
                              {task.estimated_hours && (
                                <span className="font-medium text-blue-600">
                                  {task.estimated_hours}h
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                      </Card>
                    ))}
                  </div>
                )}
              </div>
            ) : null}
          </TabsContent>
        </div>
      </Tabs>

      {/* Delete User AlertDialog */}
      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Archive User</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to archive this user? This will mark them as inactive.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteUser}
              disabled={isDeleting}
              className="bg-red-600 hover:bg-red-700"
            >
              {isDeleting ? "Archiving..." : "Archive User"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Edit Profile Dialog */}
      <Dialog open={showEditProfileDialog} onOpenChange={setShowEditProfileDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Profile</DialogTitle>
            <DialogDescription>
              Update the user's name and photo
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Photo</Label>
              <div className="flex items-center gap-3">
                <UserAvatar
                  name={profile.full_name || profile.auth_email}
                  photoUrl={photoUrl}
                  size="lg"
                  className="border border-gray-200 bg-gray-50"
                />

                <input
                  ref={photoInputRef}
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  className="hidden"
                  disabled={isPhotoUploading}
                  onChange={async (e) => {
                    const file = e.target.files?.[0]
                    if (!file) return

                    setIsPhotoUploading(true)
                    try {
                      const { storagePath, error: uploadError } = await uploadImage({
                        bucket: PUBLIC_MEDIA_BUCKET,
                        path: `users/${userId}`,
                        file,
                        upsert: true,
                      })
                      if (uploadError || !storagePath) throw uploadError ?? new Error("Upload failed")

                      const { error: updateError } = await updateUserPhoto(userId, storagePath)
                      if (updateError) throw updateError

                      queryClient.setQueryData(["user-profile", userId], (prev: any) =>
                        prev ? { ...prev, photo: storagePath } : prev
                      )
                      queryClient.invalidateQueries({ queryKey: ["user-profile", userId] })

                      toast({
                        title: "Photo updated",
                        description: "User photo uploaded successfully",
                      })
                    } catch (err: any) {
                      toast({
                        title: "Upload failed",
                        description: err?.message || "Failed to upload photo",
                        variant: "destructive",
                      })
                    } finally {
                      setIsPhotoUploading(false)
                      if (photoInputRef.current) photoInputRef.current.value = ""
                    }
                  }}
                />

                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => photoInputRef.current?.click()}
                  disabled={isPhotoUploading}
                  className="gap-2"
                >
                  {isPhotoUploading ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                  Change photo
                </Button>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="edit-full-name">Full Name</Label>
              <Input
                id="edit-full-name"
                value={editProfileForm.full_name}
                onChange={(e) =>
                  setEditProfileForm({ ...editProfileForm, full_name: e.target.value })
                }
                placeholder="Enter full name"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowEditProfileDialog(false)}>
              Cancel
            </Button>
            <Button onClick={handleUpdateProfile}>Save Changes</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add/Edit Skill Dialog */}
      <Dialog open={showSkillDialog} onOpenChange={setShowSkillDialog}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{editingSkill ? "Edit" : "Add"} Content Skill</DialogTitle>
            <DialogDescription>
              Define a content skill for this user
            </DialogDescription>
          </DialogHeader>

          <div className="grid grid-cols-2 gap-4 py-4">
            <div className="space-y-2">
              <Label>Content Type *</Label>
              <Select
                value={skillForm.contentTypeId}
                onValueChange={(value) =>
                  setSkillForm({ ...skillForm, contentTypeId: value })
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select content type" />
                </SelectTrigger>
                <SelectContent>
                  {contentTypes?.map((type) => (
                    <SelectItem key={type.id} value={String(type.id)}>
                      {type.title}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Production Type *</Label>
              <Select
                value={skillForm.productionTypeId}
                onValueChange={(value) =>
                  setSkillForm({ ...skillForm, productionTypeId: value })
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select production type" />
                </SelectTrigger>
                <SelectContent>
                  {productionTypes?.map((type) => (
                    <SelectItem key={type.id} value={String(type.id)}>
                      {type.title}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Language *</Label>
              <Select
                value={skillForm.languageId}
                onValueChange={(value) =>
                  setSkillForm({ ...skillForm, languageId: value })
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select language" />
                </SelectTrigger>
                <SelectContent>
                  {languages?.map((lang) => (
                    <SelectItem key={lang.id} value={String(lang.id)}>
                      {lang.long_name} ({lang.code})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Valid From *</Label>
              <Input
                type="date"
                value={skillForm.validFrom}
                onChange={(e) =>
                  setSkillForm({ ...skillForm, validFrom: e.target.value })
                }
              />
            </div>

            <div className="space-y-2">
              <Label>Price (No VAT) *</Label>
              <Input
                type="number"
                step="0.01"
                value={skillForm.priceNoVat}
                onChange={(e) =>
                  setSkillForm({ ...skillForm, priceNoVat: e.target.value })
                }
                placeholder="0.00"
              />
            </div>

            <div className="space-y-2">
              <Label>Price (With VAT) *</Label>
              <Input
                type="number"
                step="0.01"
                value={skillForm.priceWithVat}
                onChange={(e) =>
                  setSkillForm({ ...skillForm, priceWithVat: e.target.value })
                }
                placeholder="0.00"
              />
            </div>

            <div className="col-span-2 space-y-2">
              <Label>Notes</Label>
              <Textarea
                value={skillForm.notes}
                onChange={(e) =>
                  setSkillForm({ ...skillForm, notes: e.target.value })
                }
                placeholder="Additional notes..."
                rows={3}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowSkillDialog(false)}>
              Cancel
            </Button>
            <Button onClick={handleSaveSkill}>
              {editingSkill ? "Update" : "Add"} Skill
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add to Project Dialog — modal={false} avoids body pointer-events lock conflicting with nested tasks shell */}
      <Dialog
        modal={false}
        open={showAddProjectDialog}
        onOpenChange={(open) => {
          setShowAddProjectDialog(open)
          if (!open) setSelectedProjectId(null)
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add User to Project</DialogTitle>
            <DialogDescription>
              Select a project to add this user as a watcher
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Project *</Label>
              <Select
                value={selectedProjectId ? String(selectedProjectId) : ""}
                onValueChange={(value) => setSelectedProjectId(parseInt(value))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select project" />
                </SelectTrigger>
                <SelectContent>
                  {availableProjects?.map((project) => (
                    <SelectItem key={project.id} value={String(project.id)}>
                      {project.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setShowAddProjectDialog(false)
                setSelectedProjectId(null)
              }}
              type="button"
            >
              Cancel
            </Button>
            <Button onClick={handleAddToProject} disabled={!selectedProjectId}>
              Add to Project
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add to Team Dialog */}
      <Dialog
        modal={false}
        open={showAddTeamDialog}
        onOpenChange={(open) => {
          setShowAddTeamDialog(open)
          if (!open) {
            setSelectedTeamId(null)
            setSelectedRoleId(null)
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add User to Team</DialogTitle>
            <DialogDescription>
              Select a team and role for this user
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Team *</Label>
              <Select
                value={selectedTeamId ? String(selectedTeamId) : ""}
                onValueChange={(value) => setSelectedTeamId(parseInt(value))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select team" />
                </SelectTrigger>
                <SelectContent>
                  {minimalTeams?.map((team) => (
                    <SelectItem key={team.id} value={String(team.id)}>
                      {team.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Role *</Label>
              <Select
                value={selectedRoleId ? String(selectedRoleId) : ""}
                onValueChange={(value) => setSelectedRoleId(parseInt(value))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select role" />
                </SelectTrigger>
                <SelectContent>
                  {roles?.map((role) => (
                    <SelectItem key={role.id} value={String(role.id)}>
                      {role.title}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setShowAddTeamDialog(false)
                setSelectedTeamId(null)
                setSelectedRoleId(null)
              }}
            >
              Cancel
            </Button>
            <Button
              onClick={handleAddToTeam}
              disabled={!selectedTeamId || !selectedRoleId}
            >
              Add to Team
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

