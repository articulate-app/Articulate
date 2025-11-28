"use client"

import { useState, useCallback } from "react"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { useRouter, useSearchParams } from "next/navigation"
import { 
  Loader2, Trash2, MessageSquare, Mail, FileText, Lightbulb, BarChart3, 
  Plus, Edit2, X, UserPlus, FolderPlus, Users
} from "lucide-react"
import { Button } from "../ui/button"
import { Switch } from "../ui/switch"
import { Label } from "../ui/label"
import { Input } from "../ui/input"
import { Textarea } from "../ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../ui/select"
import { toast } from "../ui/use-toast"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../ui/dialog"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "../ui/alert-dialog"
import {
  getUserProfile,
  getUserProjects,
  getUserTasks,
  updateUserPreferences,
  softDeleteUser,
  getOrCreateUserThread,
  type UserProfile,
  type UserProject,
  type UserTask,
} from "../../lib/services/users"
import {
  getUserContentSkills,
  addUserContentSkill,
  updateUserContentSkill,
  deleteUserContentSkill,
  getUserTeamsWithRoles,
  addUserToTeam,
  removeUserFromTeam,
  addUserToProject,
  removeUserFromProject,
  getContentTypes,
  getProductionTypes,
  getLanguages,
  getRoles,
  getMinimalProjects,
  type UserContentSkill,
  type UserTeamWithRole,
} from "../../lib/services/userSkillsAndMemberships"

interface UserDetailsPageProps {
  userId: number
}

/**
 * Get user initials from full name or email
 */
function getInitials(name: string | null | undefined): string {
  if (!name) return "?"
  const parts = name.trim().split(/\s+/)
  if (parts.length >= 2) {
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
  }
  return name.substring(0, 2).toUpperCase()
}

export function UserDetailsPage({ userId }: UserDetailsPageProps) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const queryClient = useQueryClient()
  
  // Get active thread ID from URL params
  const activeThreadId = searchParams.get('rightThreadId') 
    ? parseInt(searchParams.get('rightThreadId')!, 10) 
    : null

  const [showDeleteDialog, setShowDeleteDialog] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)
  const [isChatLoading, setIsChatLoading] = useState(false)

  // Content Skills state
  const [showSkillDialog, setShowSkillDialog] = useState(false)
  const [editingSkill, setEditingSkill] = useState<UserContentSkill | null>(null)
  const [showDeleteSkillDialog, setShowDeleteSkillDialog] = useState(false)
  const [deletingSkillId, setDeletingSkillId] = useState<number | null>(null)
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
  const [showRemoveProjectDialog, setShowRemoveProjectDialog] = useState(false)
  const [removingProjectId, setRemovingProjectId] = useState<number | null>(null)

  // Team membership state
  const [showAddTeamDialog, setShowAddTeamDialog] = useState(false)
  const [selectedTeamId, setSelectedTeamId] = useState<number | null>(null)
  const [selectedRoleId, setSelectedRoleId] = useState<number | null>(null)
  const [showRemoveTeamDialog, setShowRemoveTeamDialog] = useState(false)
  const [removingTeamId, setRemovingTeamId] = useState<number | null>(null)

  // Fetch user profile
  const {
    data: profile,
    isLoading: profileLoading,
    error: profileError,
  } = useQuery({
    queryKey: ["user-profile", userId],
    queryFn: async () => {
      const result = await getUserProfile(userId)
      if (result.error) throw result.error
      return result.data
    },
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

  // Fetch user teams with roles
  const { data: teams } = useQuery({
    queryKey: ["user-teams-roles", userId],
    queryFn: async () => {
      const result = await getUserTeamsWithRoles(userId)
      if (result.error) throw result.error
      return result.data || []
    },
  })

  // Fetch user content skills
  const { data: skills } = useQuery({
    queryKey: ["user-content-skills", userId],
    queryFn: async () => {
      const result = await getUserContentSkills(userId)
      if (result.error) throw result.error
      return result.data || []
    },
  })

  // Fetch lookup data for dropdowns
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

  const { data: allProjects } = useQuery({
    queryKey: ["minimal-projects"],
    queryFn: async () => {
      const result = await getMinimalProjects()
      if (result.error) throw result.error
      return result.data || []
    },
  })

  const { data: allTeams } = useQuery({
    queryKey: ["teams-minimal"],
    queryFn: async () => {
      const result = await getMinimalProjects() // Should be teams but reusing existing
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

      // Navigate back to users list or home
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

  // Handle chat with user (default DM)
  const handleChatWithUser = async () => {
    setIsChatLoading(true)
    try {
      const { data: thread, error } = await getOrCreateUserThread(userId)
      
      if (error) throw error
      
      if (!thread) {
        throw new Error("Failed to create thread")
      }

      // Assuming thread data has an id property
      const threadId = typeof thread === 'object' && thread && 'id' in thread ? thread.id : thread

      toast({
        title: "Success",
        description: "Opening chat...",
      })

      // Navigate to user page with chat open
      router.push(`/users/${userId}?rightView=thread-chat&rightThreadId=${threadId}`)
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


  // Content Skills Handlers
  const handleOpenSkillDialog = useCallback((skill?: UserContentSkill) => {
    if (skill) {
      setEditingSkill(skill)
      setSkillForm({
        contentTypeId: skill.content_type_id?.toString() || "",
        productionTypeId: skill.production_type_id?.toString() || "",
        languageId: skill.language_id?.toString() || "",
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
    if (!skillForm.contentTypeId || !skillForm.productionTypeId || !skillForm.languageId) {
      toast({
        title: "Validation Error",
        description: "Content type, production type, and language are required",
        variant: "destructive",
      })
      return
    }

    try {
      if (editingSkill) {
        const { error } = await updateUserContentSkill({
          costId: editingSkill.id,
          contentTypeId: Number(skillForm.contentTypeId),
          productionTypeId: Number(skillForm.productionTypeId),
          languageId: Number(skillForm.languageId),
          validFrom: skillForm.validFrom,
          priceNoVat: Number(skillForm.priceNoVat) || 0,
          priceWithVat: Number(skillForm.priceWithVat) || 0,
          notes: skillForm.notes || null,
        })
        if (error) throw error
        toast({ title: "Success", description: "Skill updated successfully" })
      } else {
        const { error } = await addUserContentSkill({
          userId,
          contentTypeId: Number(skillForm.contentTypeId),
          productionTypeId: Number(skillForm.productionTypeId),
          languageId: Number(skillForm.languageId),
          validFrom: skillForm.validFrom,
          priceNoVat: Number(skillForm.priceNoVat) || 0,
          priceWithVat: Number(skillForm.priceWithVat) || 0,
          notes: skillForm.notes,
        })
        if (error) throw error
        toast({ title: "Success", description: "Skill added successfully" })
      }

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

  const handleDeleteSkill = async () => {
    if (!deletingSkillId) return

    try {
      const { error } = await deleteUserContentSkill(deletingSkillId)
      if (error) throw error

      toast({ title: "Success", description: "Skill deleted successfully" })
      queryClient.invalidateQueries({ queryKey: ["user-content-skills", userId] })
      setShowDeleteSkillDialog(false)
      setDeletingSkillId(null)
    } catch (err: any) {
      toast({
        title: "Error",
        description: err.message || "Failed to delete skill",
        variant: "destructive",
      })
    }
  }

  // Project Membership Handlers
  const handleAddToProject = async () => {
    if (!selectedProjectId) return

    try {
      const { error } = await addUserToProject(userId, selectedProjectId)
      if (error) throw error

      toast({ title: "Success", description: "Added to project successfully" })
      queryClient.invalidateQueries({ queryKey: ["user-projects", userId] })
      setShowAddProjectDialog(false)
      setSelectedProjectId(null)
    } catch (err: any) {
      toast({
        title: "Error",
        description: err.message || "Failed to add to project",
        variant: "destructive",
      })
    }
  }

  const handleRemoveFromProject = async () => {
    if (!removingProjectId) return

    try {
      const { error } = await removeUserFromProject(userId, removingProjectId)
      if (error) throw error

      toast({ title: "Success", description: "Removed from project successfully" })
      queryClient.invalidateQueries({ queryKey: ["user-projects", userId] })
      setShowRemoveProjectDialog(false)
      setRemovingProjectId(null)
    } catch (err: any) {
      toast({
        title: "Error",
        description: err.message || "Failed to remove from project",
        variant: "destructive",
      })
    }
  }

  // Team Membership Handlers
  const handleAddToTeam = async () => {
    if (!selectedTeamId || !selectedRoleId) {
      toast({
        title: "Validation Error",
        description: "Please select both team and role",
        variant: "destructive",
      })
      return
    }

    try {
      const { error } = await addUserToTeam(userId, selectedTeamId, selectedRoleId)
      if (error) throw error

      toast({ title: "Success", description: "Added to team successfully" })
      queryClient.invalidateQueries({ queryKey: ["user-teams-roles", userId] })
      setShowAddTeamDialog(false)
      setSelectedTeamId(null)
      setSelectedRoleId(null)
    } catch (err: any) {
      toast({
        title: "Error",
        description: err.message || "Failed to add to team",
        variant: "destructive",
      })
    }
  }

  const handleRemoveFromTeam = async () => {
    if (!removingTeamId) return

    try {
      const { error } = await removeUserFromTeam(userId, removingTeamId)
      if (error) throw error

      toast({ title: "Success", description: "Removed from team successfully" })
      queryClient.invalidateQueries({ queryKey: ["user-teams-roles", userId] })
      setShowRemoveTeamDialog(false)
      setRemovingTeamId(null)
    } catch (err: any) {
      toast({
        title: "Error",
        description: err.message || "Failed to remove from team",
        variant: "destructive",
      })
    }
  }

  if (profileLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="w-8 h-8 animate-spin text-gray-400" />
      </div>
    )
  }

  if (profileError) {
    return (
      <div className="p-6 text-red-600">
        Error loading user profile: {(profileError as Error).message}
      </div>
    )
  }

  if (!profile) {
    return <div className="p-6 text-gray-500">User not found</div>
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 bg-white border-t-0">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">
            {profile.full_name || profile.auth_email}
          </h1>
          <p className="text-sm text-gray-500 mt-1">{profile.auth_email}</p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            onClick={handleChatWithUser}
            disabled={isChatLoading}
            className="gap-2"
          >
            {isChatLoading ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <MessageSquare className="w-4 h-4" />
            )}
            Chat
          </Button>
          <Button
            variant="destructive"
            onClick={() => setShowDeleteDialog(true)}
            className="gap-2"
          >
            <Trash2 className="w-4 h-4" />
            Archive User
          </Button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto p-6">
        {/* Profile Info */}
        <div className="mb-6">
          <div className="flex items-center gap-4 mb-6">
            {profile.photo ? (
              <img
                src={profile.photo}
                alt={profile.full_name || profile.auth_email}
                className="w-16 h-16 rounded-full object-cover border-2 border-gray-200"
              />
            ) : (
              <div className="w-16 h-16 rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center text-xl font-semibold text-white border-2 border-gray-200">
                {getInitials(profile.full_name || profile.auth_email)}
              </div>
            )}
            <div className="flex-1">
              {profile.brand && (
                <p className="text-sm text-gray-600">
                  <span className="font-medium">Brand:</span> {profile.brand}
                </p>
              )}
              {profile.phone && (
                <p className="text-sm text-gray-600">
                  <span className="font-medium">Phone:</span> {profile.phone}
                </p>
              )}
              {profile.start_date && (
                <p className="text-sm text-gray-600">
                  <span className="font-medium">Start Date:</span>{" "}
                  {new Date(profile.start_date).toLocaleDateString()}
                </p>
              )}
            </div>
          </div>
        </div>

        {/* Two-column layout */}
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
          {/* Left Column */}
          <div className="space-y-6">
            {/* Projects */}
            <div>
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-semibold">Projects Watching</h2>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setShowAddProjectDialog(true)}
                  className="gap-2"
                >
                  <FolderPlus className="w-4 h-4" />
                  Add to Project
                </Button>
              </div>
              {projects && projects.length > 0 ? (
                <div className="space-y-2">
                  {projects.map((project) => (
                    <div
                      key={project.project_id}
                      className="flex items-center gap-3 p-3 bg-white border border-gray-200 rounded-lg"
                    >
                      <div
                        className="w-3 h-3 rounded-full flex-shrink-0"
                        style={{ backgroundColor: project.project_color || '#gray' }}
                      />
                      <div className="flex-1 min-w-0">
                        <div className="font-medium text-sm text-gray-900 truncate">
                          {project.project_name}
                        </div>
                        {project.project_status && (
                          <div className="text-xs text-gray-500">
                            Status: {project.project_status}
                          </div>
                        )}
                      </div>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => {
                          setRemovingProjectId(project.project_id)
                          setShowRemoveProjectDialog(true)
                        }}
                        className="text-red-600 hover:text-red-700 hover:bg-red-50"
                      >
                        <X className="w-4 h-4" />
                      </Button>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-12 border border-dashed border-gray-300 rounded-lg bg-white">
                  <p className="text-sm text-gray-500">No projects</p>
                </div>
              )}
            </div>

            {/* Tasks */}
            <div>
              <h2 className="text-lg font-semibold mb-4">Assigned Tasks</h2>
              {tasks && tasks.length > 0 ? (
                <div className="space-y-2 max-h-96 overflow-y-auto">
                  {tasks.map((task) => (
                    <div
                      key={task.id}
                      className="p-3 bg-white border border-gray-200 rounded-lg"
                    >
                      <div className="font-medium text-sm text-gray-900 mb-1">
                        {task.title}
                      </div>
                      <div className="flex items-center gap-2 text-xs text-gray-500">
                        {task.project_name && (
                          <span className="flex items-center gap-1">
                            <div
                              className="w-2 h-2 rounded-full"
                              style={{ backgroundColor: task.project_color || '#gray' }}
                            />
                            {task.project_name}
                          </span>
                        )}
                        {task.project_status_name && (
                          <span>• {task.project_status_name}</span>
                        )}
                        {task.is_overdue && (
                          <span className="text-red-600 font-medium">• Overdue</span>
                        )}
                      </div>
                      {task.delivery_date && (
                        <div className="text-xs text-gray-500 mt-1">
                          Due: {new Date(task.delivery_date).toLocaleDateString()}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-12 border border-dashed border-gray-300 rounded-lg bg-white">
                  <p className="text-sm text-gray-500">No assigned tasks</p>
                </div>
              )}
            </div>
          </div>

          {/* Right Column */}
          <div className="space-y-6">
            {/* Teams */}
            <div>
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-semibold">Teams & Roles</h2>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setShowAddTeamDialog(true)}
                  className="gap-2"
                >
                  <UserPlus className="w-4 h-4" />
                  Add to Team
                </Button>
              </div>
              {teams && teams.length > 0 ? (
                <div className="space-y-2">
                  {teams.map((team) => (
                    <div
                      key={team.team_id}
                      className="flex items-center justify-between p-3 bg-white border border-gray-200 rounded-lg"
                    >
                      <div className="flex-1">
                        <div className="font-medium text-sm text-gray-900">
                          {team.team_title}
                        </div>
                        {team.team_full_name && team.team_full_name !== team.team_title && (
                          <div className="text-xs text-gray-500">
                            {team.team_full_name}
                          </div>
                        )}
                        <div className="flex items-center gap-2 mt-1">
                          <span className="text-xs bg-blue-100 text-blue-700 px-2 py-1 rounded">
                            {team.role_title}
                          </span>
                          {team.has_access_app && (
                            <span className="text-xs bg-green-100 text-green-700 px-2 py-1 rounded">
                              App Access
                            </span>
                          )}
                        </div>
                      </div>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => {
                          setRemovingTeamId(team.team_id)
                          setShowRemoveTeamDialog(true)
                        }}
                        className="text-red-600 hover:text-red-700 hover:bg-red-50"
                      >
                        <X className="w-4 h-4" />
                      </Button>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-12 border border-dashed border-gray-300 rounded-lg bg-white">
                  <p className="text-sm text-gray-500">No teams</p>
                </div>
              )}
            </div>

            {/* Communication Preferences */}
            <div>
              <h2 className="text-lg font-semibold mb-4">Communication Preferences</h2>
              <div className="space-y-4 p-4 bg-white border border-gray-200 rounded-lg">
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Mail className="w-4 h-4 text-gray-400" />
                    <Label htmlFor="send-invoices" className="cursor-pointer">
                      Send Invoices
                    </Label>
                  </div>
                  <Switch
                    id="send-invoices"
                    checked={profile.send_invoices || false}
                    onCheckedChange={(checked) =>
                      handlePreferenceToggle("send_invoices", checked)
                    }
                  />
                </div>

                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <FileText className="w-4 h-4 text-gray-400" />
                    <Label htmlFor="send-content" className="cursor-pointer">
                      Send Content
                    </Label>
                  </div>
                  <Switch
                    id="send-content"
                    checked={profile.send_content || false}
                    onCheckedChange={(checked) =>
                      handlePreferenceToggle("send_content", checked)
                    }
                  />
                </div>

                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Lightbulb className="w-4 h-4 text-gray-400" />
                    <Label htmlFor="send-inspiration" className="cursor-pointer">
                      Send Inspiration
                    </Label>
                  </div>
                  <Switch
                    id="send-inspiration"
                    checked={profile.send_inspiration || false}
                    onCheckedChange={(checked) =>
                      handlePreferenceToggle("send_inspiration", checked)
                    }
                  />
                </div>

                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <BarChart3 className="w-4 h-4 text-gray-400" />
                    <Label htmlFor="send-reports" className="cursor-pointer">
                      Send Reports
                    </Label>
                  </div>
                  <Switch
                    id="send-reports"
                    checked={profile.send_reports || false}
                    onCheckedChange={(checked) =>
                      handlePreferenceToggle("send_reports", checked)
                    }
                  />
                </div>
              </div>
              </div>
            </div>

            {/* Content Skills */}
            <div>
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-semibold">Content Skills</h2>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => handleOpenSkillDialog()}
                  className="gap-2"
                >
                  <Plus className="w-4 h-4" />
                  Add Skill
                </Button>
              </div>
              {skills && skills.length > 0 ? (
                <div className="overflow-x-auto bg-white border border-gray-200 rounded-lg">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b">
                        <th className="text-left py-2 px-2 text-xs font-medium text-gray-600">
                          Content Type
                        </th>
                        <th className="text-left py-2 px-2 text-xs font-medium text-gray-600">
                          Production
                        </th>
                        <th className="text-left py-2 px-2 text-xs font-medium text-gray-600">
                          Language
                        </th>
                        <th className="text-left py-2 px-2 text-xs font-medium text-gray-600">
                          Valid From
                        </th>
                        <th className="text-right py-2 px-2 text-xs font-medium text-gray-600">
                          Price (No VAT)
                        </th>
                        <th className="text-right py-2 px-2 text-xs font-medium text-gray-600">
                          Price (With VAT)
                        </th>
                        <th className="text-right py-2 px-2 text-xs font-medium text-gray-600">
                          Actions
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {skills.map((skill) => (
                        <tr key={skill.id} className="border-b last:border-b-0 hover:bg-gray-50">
                          <td className="py-2 px-2 text-xs">
                            {skill.content_type_title || '-'}
                          </td>
                          <td className="py-2 px-2 text-xs">
                            {skill.production_type_title || '-'}
                          </td>
                          <td className="py-2 px-2 text-xs">
                            {skill.language_name || skill.language_code || '-'}
                          </td>
                          <td className="py-2 px-2 text-xs">
                            {skill.valid_from ? new Date(skill.valid_from).toLocaleDateString() : '-'}
                          </td>
                          <td className="py-2 px-2 text-xs text-right">
                            {skill.price_novat ? `€${skill.price_novat}` : '-'}
                          </td>
                          <td className="py-2 px-2 text-xs text-right">
                            {skill.price_withvat ? `€${skill.price_withvat}` : '-'}
                          </td>
                          <td className="py-2 px-2 text-xs text-right">
                            <div className="flex items-center justify-end gap-1">
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => handleOpenSkillDialog(skill)}
                                className="h-6 w-6 p-0"
                              >
                                <Edit2 className="w-3 h-3" />
                              </Button>
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => {
                                  setDeletingSkillId(skill.id)
                                  setShowDeleteSkillDialog(true)
                                }}
                                className="h-6 w-6 p-0 text-red-600 hover:text-red-700 hover:bg-red-50"
                              >
                                <Trash2 className="w-3 h-3" />
                              </Button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="text-center py-12 border border-dashed border-gray-300 rounded-lg bg-white">
                  <p className="text-sm text-gray-500">No content skills defined</p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Content Skill Dialog */}
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
                  {contentTypes?.map((ct) => (
                    <SelectItem key={ct.id} value={ct.id.toString()}>
                      {ct.title}
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
                  {productionTypes?.map((pt) => (
                    <SelectItem key={pt.id} value={pt.id.toString()}>
                      {pt.title}
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
                    <SelectItem key={lang.id} value={lang.id.toString()}>
                      {lang.long_name || lang.code}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Valid From</Label>
              <Input
                type="date"
                value={skillForm.validFrom}
                onChange={(e) =>
                  setSkillForm({ ...skillForm, validFrom: e.target.value })
                }
              />
            </div>
            <div className="space-y-2">
              <Label>Price (No VAT)</Label>
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
              <Label>Price (With VAT)</Label>
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
            <div className="space-y-2 col-span-2">
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

      {/* Delete Skill Confirmation */}
      <AlertDialog open={showDeleteSkillDialog} onOpenChange={setShowDeleteSkillDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Skill</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this content skill? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteSkill}
              className="bg-red-600 hover:bg-red-700"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Add to Project Dialog */}
      <Dialog open={showAddProjectDialog} onOpenChange={setShowAddProjectDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add User to Project</DialogTitle>
            <DialogDescription>
              Select a project to add this user as a watcher
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Project</Label>
              <Select
                value={selectedProjectId?.toString() || ""}
                onValueChange={(value) => setSelectedProjectId(Number(value))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select a project" />
                </SelectTrigger>
                <SelectContent>
                  {allProjects?.map((project: any) => (
                    <SelectItem key={project.id} value={project.id.toString()}>
                      {project.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAddProjectDialog(false)}>
              Cancel
            </Button>
            <Button onClick={handleAddToProject} disabled={!selectedProjectId}>
              Add to Project
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Remove from Project Confirmation */}
      <AlertDialog open={showRemoveProjectDialog} onOpenChange={setShowRemoveProjectDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove from Project</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to remove this user from the project?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleRemoveFromProject} className="bg-red-600 hover:bg-red-700">
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Add to Team Dialog */}
      <Dialog open={showAddTeamDialog} onOpenChange={setShowAddTeamDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add User to Team</DialogTitle>
            <DialogDescription>
              Select a team and role for this user
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Team</Label>
              <Select
                value={selectedTeamId?.toString() || ""}
                onValueChange={(value) => setSelectedTeamId(Number(value))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select a team" />
                </SelectTrigger>
                <SelectContent>
                  {allTeams?.map((team: any) => (
                    <SelectItem key={team.id} value={team.id.toString()}>
                      {team.title || team.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Role</Label>
              <Select
                value={selectedRoleId?.toString() || ""}
                onValueChange={(value) => setSelectedRoleId(Number(value))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select a role" />
                </SelectTrigger>
                <SelectContent>
                  {roles?.map((role) => (
                    <SelectItem key={role.id} value={role.id.toString()}>
                      <div>
                        <div className="font-medium">{role.title}</div>
                        {role.description && (
                          <div className="text-xs text-gray-500">{role.description}</div>
                        )}
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAddTeamDialog(false)}>
              Cancel
            </Button>
            <Button onClick={handleAddToTeam} disabled={!selectedTeamId || !selectedRoleId}>
              Add to Team
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Remove from Team Confirmation */}
      <AlertDialog open={showRemoveTeamDialog} onOpenChange={setShowRemoveTeamDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove from Team</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to remove this user from the team?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleRemoveFromTeam} className="bg-red-600 hover:bg-red-700">
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete User Confirmation Dialog */}
      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Archive User</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to archive {profile.full_name || profile.auth_email}?
              This will deactivate and hide the user from the system.
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
    </div>
  )
}

