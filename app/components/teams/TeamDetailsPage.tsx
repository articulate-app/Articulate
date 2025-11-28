'use client'

import { useState, useMemo } from 'react'
import { useRouter, useSearchParams, usePathname } from 'next/navigation'
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query'
import { 
  Users, 
  MessageSquare, 
  Edit2,
  Save,
  X,
  Loader2,
  Plus,
  Trash2,
  ChevronRight
} from 'lucide-react'
import { Button } from '../ui/button'
import { Input } from '../ui/input'
import { Label } from '../ui/label'
import { Textarea } from '../ui/textarea'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../ui/tabs'
import { 
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../ui/select'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '../ui/alert-dialog'
import { toast } from '../ui/use-toast'
import {
  getTeamProfile,
  updateTeam,
  updateTeamBilling,
  getTeamMembersWithDetails,
  addUserToTeam,
  removeUserFromTeam,
  getTeamProjects,
  addProjectToTeam,
  removeProjectFromTeam,
  getTeamActivity,
  getOrCreateTeamThread,
  getRoles,
  getAvailableUsers,
  getAvailableProjects,
} from '@/lib/services/teams'
import { formatDistanceToNow } from 'date-fns'

interface TeamDetailsPageProps {
  teamId: number
}

export function TeamDetailsPage({ teamId }: TeamDetailsPageProps) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const queryClient = useQueryClient()

  // Active tab from URL
  const activeTab = searchParams.get('tab') || 'overview'

  // Fetch team profile
  const { data: teamProfile, isLoading: profileLoading } = useQuery({
    queryKey: ['team-profile', teamId],
    queryFn: async () => {
      const { data, error } = await getTeamProfile(teamId)
      if (error) throw error
      return data
    },
    enabled: !isNaN(teamId) && teamId > 0,
  })

  const handleTabChange = (value: string) => {
    const params = new URLSearchParams(searchParams.toString())
    params.set('tab', value)
    router.push(`${pathname}?${params.toString()}`)
  }

  const handleChatWithTeam = async () => {
    try {
      const { data: thread, error } = await getOrCreateTeamThread(teamId)

      if (error) throw error
      if (!thread) throw new Error('Failed to create thread')

      const threadId = typeof thread === 'object' && thread && 'id' in thread ? thread.id : thread

      toast({
        title: 'Success',
        description: 'Opening team chat...',
      })

      const params = new URLSearchParams(searchParams.toString())
      params.set('rightView', 'thread-chat')
      params.set('rightThreadId', String(threadId))
      router.push(`${pathname}?${params.toString()}`)
    } catch (err: any) {
      toast({
        title: 'Error',
        description: err.message || 'Failed to open chat',
        variant: 'destructive',
      })
    }
  }

  if (profileLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
      </div>
    )
  }

  if (!teamProfile) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center">
          <p className="text-gray-500">Team not found</p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 bg-white border-t-0">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">
            {teamProfile.title}
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            {teamProfile.full_name}
          </p>
        </div>
        <Button
          onClick={handleChatWithTeam}
          size="sm"
          className="gap-2"
        >
          <MessageSquare className="w-4 h-4" />
          Team Chat
        </Button>
      </div>

      {/* Tabs */}
      <div className="flex-1 overflow-hidden flex flex-col">
        <Tabs value={activeTab} onValueChange={handleTabChange} className="h-full flex flex-col">
          <TabsList className="px-6 bg-transparent border-b border-gray-200 rounded-none justify-start border-t-0 h-auto overflow-x-auto overflow-y-hidden whitespace-nowrap flex-nowrap">
            <TabsTrigger 
              value="overview"
              className="data-[state=active]:border-b-2 data-[state=active]:border-black data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:-mb-px rounded-none relative"
            >
              Overview
            </TabsTrigger>
            <TabsTrigger 
              value="members"
              className="data-[state=active]:border-b-2 data-[state=active]:border-black data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:-mb-px rounded-none relative"
            >
              Members
            </TabsTrigger>
            <TabsTrigger 
              value="projects"
              className="data-[state=active]:border-b-2 data-[state=active]:border-black data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:-mb-px rounded-none relative"
            >
              Projects
            </TabsTrigger>
            <TabsTrigger 
              value="billing"
              className="data-[state=active]:border-b-2 data-[state=active]:border-black data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:-mb-px rounded-none relative"
            >
              Billing
            </TabsTrigger>
            <TabsTrigger 
              value="activity"
              className="data-[state=active]:border-b-2 data-[state=active]:border-black data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:-mb-px rounded-none relative"
            >
              Activity
            </TabsTrigger>
          </TabsList>

          <div className="flex-1 overflow-auto">
            <TabsContent value="overview" className="h-full m-0 mt-0 p-6">
              <TeamOverviewTab teamId={teamId} teamProfile={teamProfile} />
            </TabsContent>

            <TabsContent value="members" className="h-full m-0 mt-0 p-6">
              <TeamMembersTab teamId={teamId} />
            </TabsContent>

            <TabsContent value="projects" className="h-full m-0 mt-0 p-6">
              <TeamProjectsTab teamId={teamId} />
            </TabsContent>

            <TabsContent value="billing" className="h-full m-0 mt-0 p-6">
              <TeamBillingTab teamId={teamId} teamProfile={teamProfile} />
            </TabsContent>

            <TabsContent value="activity" className="h-full m-0 mt-0 p-6">
              <TeamActivityTab teamId={teamId} />
            </TabsContent>
          </div>
        </Tabs>
      </div>
    </div>
  )
}

// Overview Tab Component
function TeamOverviewTab({ teamId, teamProfile }: { teamId: number; teamProfile: any }) {
  const queryClient = useQueryClient()
  const [isEditing, setIsEditing] = useState(false)
  const [editedProfile, setEditedProfile] = useState({
    title: teamProfile.title,
    full_name: teamProfile.full_name,
    description: teamProfile.description || '',
    logo: teamProfile.logo || '',
  })

  const updateMutation = useMutation({
    mutationFn: async () => {
      const { data, error } = await updateTeam(teamId, editedProfile)
      if (error) throw error
      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['team-profile', teamId] })
      setIsEditing(false)
      toast({
        title: 'Success',
        description: 'Team info updated successfully',
      })
    },
    onError: (error: any) => {
      toast({
        title: 'Error',
        description: error.message || 'Failed to update team info',
        variant: 'destructive',
      })
    },
  })

  const handleSave = () => {
    updateMutation.mutate()
  }

  const handleCancel = () => {
    setEditedProfile({
      title: teamProfile.title,
      full_name: teamProfile.full_name,
      description: teamProfile.description || '',
      logo: teamProfile.logo || '',
    })
    setIsEditing(false)
  }

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h2 className="text-xl font-semibold">Team Information</h2>
        {!isEditing ? (
          <Button onClick={() => setIsEditing(true)} variant="outline" size="sm">
            <Edit2 className="w-4 h-4 mr-2" />
            Edit
          </Button>
        ) : (
          <div className="flex gap-2">
            <Button 
              onClick={handleSave} 
              size="sm" 
              disabled={updateMutation.isPending}
            >
              {updateMutation.isPending ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <Save className="w-4 h-4 mr-2" />
              )}
              Save
            </Button>
            <Button 
              onClick={handleCancel} 
              variant="outline" 
              size="sm"
              disabled={updateMutation.isPending}
            >
              <X className="w-4 h-4 mr-2" />
              Cancel
            </Button>
          </div>
        )}
      </div>
      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="title">Short Name</Label>
          {isEditing ? (
            <Input
              id="title"
              value={editedProfile.title}
              onChange={(e) =>
                setEditedProfile({ ...editedProfile, title: e.target.value })
              }
              placeholder="Team short name"
            />
          ) : (
            <p className="text-sm text-gray-900 mt-1">{teamProfile.title}</p>
          )}
        </div>

        <div className="space-y-2">
          <Label htmlFor="full_name">Full Name</Label>
          {isEditing ? (
            <Input
              id="full_name"
              value={editedProfile.full_name}
              onChange={(e) =>
                setEditedProfile({ ...editedProfile, full_name: e.target.value })
              }
              placeholder="Team full name"
            />
          ) : (
            <p className="text-sm text-gray-900 mt-1">{teamProfile.full_name}</p>
          )}
        </div>

        <div className="space-y-2 md:col-span-2">
          <Label htmlFor="description">Description</Label>
          {isEditing ? (
            <Textarea
              id="description"
              value={editedProfile.description}
              onChange={(e) =>
                setEditedProfile({ ...editedProfile, description: e.target.value })
              }
              placeholder="Team description"
              rows={3}
            />
          ) : (
            <p className="text-sm text-gray-700 mt-1">
              {teamProfile.description || 'No description'}
            </p>
          )}
        </div>

        <div className="space-y-2 md:col-span-2">
          <Label htmlFor="logo">Logo URL</Label>
          {isEditing ? (
            <Input
              id="logo"
              value={editedProfile.logo}
              onChange={(e) =>
                setEditedProfile({ ...editedProfile, logo: e.target.value })
              }
              placeholder="https://example.com/logo.png"
            />
          ) : (
            <p className="text-sm text-gray-700 mt-1">
              {teamProfile.logo || 'No logo URL'}
            </p>
          )}
        </div>

        <div className="space-y-2">
          <Label>Created</Label>
          <p className="text-sm text-gray-900 mt-1">
            {new Date(teamProfile.created_at).toLocaleDateString()}
          </p>
        </div>
        <div className="space-y-2">
          <Label>Last Updated</Label>
          <p className="text-sm text-gray-900 mt-1">
            {new Date(teamProfile.updated_at).toLocaleDateString()}
          </p>
        </div>
      </div>
    </div>
  )
}

// Members Tab Component
function TeamMembersTab({ teamId }: { teamId: number }) {
  const queryClient = useQueryClient()
  const [showAddDialog, setShowAddDialog] = useState(false)
  const [showRemoveDialog, setShowRemoveDialog] = useState(false)
  const [selectedMember, setSelectedMember] = useState<any>(null)
  const [selectedUserId, setSelectedUserId] = useState<string>('')
  const [selectedRoleId, setSelectedRoleId] = useState<string>('')
  const [userSearch, setUserSearch] = useState('')

  // Fetch members
  const { data: members, isLoading: membersLoading } = useQuery({
    queryKey: ['team-members-details', teamId],
    queryFn: async () => {
      const { data, error } = await getTeamMembersWithDetails(teamId)
      if (error) throw error
      return data
    },
  })

  // Fetch roles
  const { data: roles } = useQuery({
    queryKey: ['roles'],
    queryFn: async () => {
      const { data, error } = await getRoles()
      if (error) throw error
      return data
    },
    enabled: showAddDialog,
  })

  // Fetch available users
  const { data: availableUsers } = useQuery({
    queryKey: ['available-users', userSearch],
    queryFn: async () => {
      const { data, error } = await getAvailableUsers(userSearch)
      if (error) throw error
      return data
    },
    enabled: showAddDialog,
  })

  const addMemberMutation = useMutation({
    mutationFn: async ({ userId, roleId }: { userId: number; roleId: number }) => {
      const { data, error } = await addUserToTeam(userId, teamId, roleId)
      if (error) throw error
      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['team-members-details', teamId] })
      queryClient.invalidateQueries({ queryKey: ['team-profile', teamId] })
      setShowAddDialog(false)
      setSelectedUserId('')
      setSelectedRoleId('')
      toast({
        title: 'Success',
        description: 'Member added successfully',
      })
    },
    onError: (error: any) => {
      toast({
        title: 'Error',
        description: error.message || 'Failed to add member',
        variant: 'destructive',
      })
    },
  })

  const removeMemberMutation = useMutation({
    mutationFn: async (userId: number) => {
      const { data, error } = await removeUserFromTeam(userId, teamId)
      if (error) throw error
      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['team-members-details', teamId] })
      queryClient.invalidateQueries({ queryKey: ['team-profile', teamId] })
      setShowRemoveDialog(false)
      setSelectedMember(null)
      toast({
        title: 'Success',
        description: 'Member removed successfully',
      })
    },
    onError: (error: any) => {
      toast({
        title: 'Error',
        description: error.message || 'Failed to remove member',
        variant: 'destructive',
      })
    },
  })

  const updateRoleMutation = useMutation({
    mutationFn: async ({ userId, roleId }: { userId: number; roleId: number }) => {
      const { data, error } = await addUserToTeam(userId, teamId, roleId)
      if (error) throw error
      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['team-members-details', teamId] })
      toast({
        title: 'Success',
        description: 'Role updated successfully',
      })
    },
    onError: (error: any) => {
      toast({
        title: 'Error',
        description: error.message || 'Failed to update role',
        variant: 'destructive',
      })
    },
  })

  const handleAddMember = () => {
    if (!selectedUserId || !selectedRoleId) return
    addMemberMutation.mutate({
      userId: parseInt(selectedUserId),
      roleId: parseInt(selectedRoleId),
    })
  }

  const handleRemoveMember = () => {
    if (!selectedMember) return
    removeMemberMutation.mutate(selectedMember.user_id)
  }

  const handleRoleChange = (userId: number, newRoleId: string) => {
    updateRoleMutation.mutate({
      userId,
      roleId: parseInt(newRoleId),
    })
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-xl font-semibold">Team Members</h2>
        <Button onClick={() => setShowAddDialog(true)} size="sm" className="gap-2">
          <Plus className="w-4 h-4" />
          Add Member
        </Button>
      </div>
      {membersLoading ? (
        <div className="flex items-center justify-center py-8">
          <Loader2 className="w-5 h-5 animate-spin text-gray-400" />
        </div>
      ) : members && members.length > 0 ? (
        <div className="space-y-2">
          {members.map((member) => (
            <div
              key={member.user_id}
              className="flex items-center justify-between p-3 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
            >
              <div className="flex items-center gap-3">
                {member.photo ? (
                  <img
                    src={member.photo}
                    alt={member.full_name || ''}
                    className="w-10 h-10 rounded-full object-cover"
                  />
                ) : (
                  <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center">
                    <Users className="w-5 h-5 text-white" />
                  </div>
                )}
                <div>
                  <div className="font-medium text-sm text-gray-900">
                    {member.full_name || `User ${member.user_id}`}
                  </div>
                  <div className="text-xs text-gray-500">{member.email}</div>
                </div>
              </div>

              <div className="flex items-center gap-3">
                <Select
                  value={String(member.role_id)}
                  onValueChange={(value) => handleRoleChange(member.user_id, value)}
                  disabled={updateRoleMutation.isPending}
                >
                  <SelectTrigger className="w-[180px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {roles?.map((role) => (
                      <SelectItem key={role.id} value={String(role.id)}>
                        {role.title}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                {member.has_access_app && (
                  <span className="text-xs bg-green-100 text-green-700 px-2 py-1 rounded">
                    App Access
                  </span>
                )}

                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setSelectedMember(member)
                    setShowRemoveDialog(true)
                  }}
                >
                  <Trash2 className="w-4 h-4 text-red-600" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="text-center py-12 border border-dashed border-gray-300 rounded-lg bg-white">
          <Users className="w-12 h-12 text-gray-300 mx-auto mb-3" />
          <p className="text-sm text-gray-500">No members yet</p>
        </div>
      )}

      {/* Add Member Dialog */}
      <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Member to Team</DialogTitle>
            <DialogDescription>
              Select a user and assign them a role
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div>
              <Label htmlFor="user-search">Search User</Label>
              <Input
                id="user-search"
                placeholder="Search by name or email"
                value={userSearch}
                onChange={(e) => setUserSearch(e.target.value)}
              />
            </div>

            <div>
              <Label htmlFor="user">User</Label>
              <Select value={selectedUserId} onValueChange={setSelectedUserId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select user" />
                </SelectTrigger>
                <SelectContent>
                  {availableUsers?.map((user) => (
                    <SelectItem key={user.id} value={String(user.id)}>
                      {user.full_name || user.email}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label htmlFor="role">Role</Label>
              <Select value={selectedRoleId} onValueChange={setSelectedRoleId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select role" />
                </SelectTrigger>
                <SelectContent>
                  {roles?.map((role) => (
                    <SelectItem key={role.id} value={String(role.id)}>
                      <div>
                        <div>{role.title}</div>
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
            <Button
              variant="outline"
              onClick={() => setShowAddDialog(false)}
              disabled={addMemberMutation.isPending}
            >
              Cancel
            </Button>
            <Button
              onClick={handleAddMember}
              disabled={!selectedUserId || !selectedRoleId || addMemberMutation.isPending}
            >
              {addMemberMutation.isPending && (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              )}
              Add Member
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Remove Member Dialog */}
      <AlertDialog open={showRemoveDialog} onOpenChange={setShowRemoveDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove Member</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to remove {selectedMember?.full_name} from this team?
              This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={removeMemberMutation.isPending}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleRemoveMember}
              disabled={removeMemberMutation.isPending}
              className="bg-red-600 hover:bg-red-700"
            >
              {removeMemberMutation.isPending && (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              )}
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

// Projects Tab Component
function TeamProjectsTab({ teamId }: { teamId: number }) {
  const router = useRouter()
  const queryClient = useQueryClient()
  const [showAddDialog, setShowAddDialog] = useState(false)
  const [showRemoveDialog, setShowRemoveDialog] = useState(false)
  const [selectedProject, setSelectedProject] = useState<any>(null)
  const [selectedProjectId, setSelectedProjectId] = useState<string>('')
  const [projectSearch, setProjectSearch] = useState('')

  // Fetch projects
  const { data: projects, isLoading: projectsLoading } = useQuery({
    queryKey: ['team-projects', teamId],
    queryFn: async () => {
      const { data, error } = await getTeamProjects(teamId)
      if (error) throw error
      return data
    },
  })

  // Fetch available projects
  const { data: availableProjects } = useQuery({
    queryKey: ['available-projects', projectSearch],
    queryFn: async () => {
      const { data, error } = await getAvailableProjects(projectSearch)
      if (error) throw error
      // Filter out projects already in team
      const currentProjectIds = new Set(projects?.map(p => p.project_id) || [])
      return data?.filter(p => !currentProjectIds.has(p.id)) || []
    },
    enabled: showAddDialog,
  })

  const addProjectMutation = useMutation({
    mutationFn: async (projectId: number) => {
      const { data, error } = await addProjectToTeam(teamId, projectId)
      if (error) throw error
      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['team-projects', teamId] })
      queryClient.invalidateQueries({ queryKey: ['team-profile', teamId] })
      setShowAddDialog(false)
      setSelectedProjectId('')
      toast({
        title: 'Success',
        description: 'Project added successfully',
      })
    },
    onError: (error: any) => {
      toast({
        title: 'Error',
        description: error.message || 'Failed to add project',
        variant: 'destructive',
      })
    },
  })

  const removeProjectMutation = useMutation({
    mutationFn: async (projectId: number) => {
      const { data, error } = await removeProjectFromTeam(teamId, projectId)
      if (error) throw error
      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['team-projects', teamId] })
      queryClient.invalidateQueries({ queryKey: ['team-profile', teamId] })
      setShowRemoveDialog(false)
      setSelectedProject(null)
      toast({
        title: 'Success',
        description: 'Project removed successfully',
      })
    },
    onError: (error: any) => {
      toast({
        title: 'Error',
        description: error.message || 'Failed to remove project',
        variant: 'destructive',
      })
    },
  })

  const handleAddProject = () => {
    if (!selectedProjectId) return
    addProjectMutation.mutate(parseInt(selectedProjectId))
  }

  const handleRemoveProject = () => {
    if (!selectedProject) return
    removeProjectMutation.mutate(selectedProject.project_id)
  }

  const handleProjectClick = (projectId: number) => {
    router.push(`/projects/${projectId}?tab=overview`)
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-xl font-semibold">Team Projects</h2>
        <Button onClick={() => setShowAddDialog(true)} size="sm" className="gap-2">
          <Plus className="w-4 h-4" />
          Add Project
        </Button>
      </div>
      {projectsLoading ? (
        <div className="flex items-center justify-center py-8">
          <Loader2 className="w-5 h-5 animate-spin text-gray-400" />
        </div>
      ) : projects && projects.length > 0 ? (
        <div className="space-y-2">
          {projects.map((project) => (
            <div
              key={project.project_id}
              className="flex items-center justify-between p-3 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors cursor-pointer"
              onClick={() => handleProjectClick(project.project_id)}
            >
              <div className="flex items-center gap-3">
                <div
                  className="w-3 h-3 rounded-full flex-shrink-0"
                  style={{ backgroundColor: project.color || '#6b7280' }}
                />
                <div>
                  <div className="font-medium text-sm text-gray-900">
                    {project.name}
                  </div>
                  <div className="flex items-center gap-3 mt-1 text-xs text-gray-500">
                    {project.status && <span>{project.status}</span>}
                    {project.due_date && (
                      <>
                        <span>•</span>
                        <span>Due {new Date(project.due_date).toLocaleDateString()}</span>
                      </>
                    )}
                  </div>
                </div>
              </div>

              <Button
                variant="ghost"
                size="sm"
                onClick={(e) => {
                  e.stopPropagation()
                  setSelectedProject(project)
                  setShowRemoveDialog(true)
                }}
              >
                <Trash2 className="w-4 h-4 text-red-600" />
              </Button>
            </div>
          ))}
        </div>
      ) : (
        <div className="text-center py-12 border border-dashed border-gray-300 rounded-lg bg-white">
          <p className="text-sm text-gray-500">No projects assigned</p>
        </div>
      )}

      {/* Add Project Dialog */}
      <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Project to Team</DialogTitle>
            <DialogDescription>
              Select a project to assign to this team
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div>
              <Label htmlFor="project-search">Search Project</Label>
              <Input
                id="project-search"
                placeholder="Search by name"
                value={projectSearch}
                onChange={(e) => setProjectSearch(e.target.value)}
              />
            </div>

            <div>
              <Label htmlFor="project">Project</Label>
              <Select value={selectedProjectId} onValueChange={setSelectedProjectId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select project" />
                </SelectTrigger>
                <SelectContent>
                  {availableProjects?.map((project) => (
                    <SelectItem key={project.id} value={String(project.id)}>
                      <div className="flex items-center gap-2">
                        <div
                          className="w-2 h-2 rounded-full"
                          style={{ backgroundColor: project.color || '#6b7280' }}
                        />
                        {project.name}
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowAddDialog(false)}
              disabled={addProjectMutation.isPending}
            >
              Cancel
            </Button>
            <Button
              onClick={handleAddProject}
              disabled={!selectedProjectId || addProjectMutation.isPending}
            >
              {addProjectMutation.isPending && (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              )}
              Add Project
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Remove Project Dialog */}
      <AlertDialog open={showRemoveDialog} onOpenChange={setShowRemoveDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove Project</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to remove {selectedProject?.name} from this team?
              This will not delete the project.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={removeProjectMutation.isPending}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleRemoveProject}
              disabled={removeProjectMutation.isPending}
              className="bg-red-600 hover:bg-red-700"
            >
              {removeProjectMutation.isPending && (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              )}
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

// Billing Tab Component
function TeamBillingTab({ teamId, teamProfile }: { teamId: number; teamProfile: any }) {
  const queryClient = useQueryClient()
  const [isEditing, setIsEditing] = useState(false)
  const [billingInfo, setBillingInfo] = useState({
    billing_business_name: teamProfile.billing_business_name || '',
    billing_vat_number: teamProfile.billing_vat_number || '',
    billing_address_line1: teamProfile.billing_address_line1 || '',
    billing_address_line2: teamProfile.billing_address_line2 || '',
    billing_city: teamProfile.billing_city || '',
    billing_postcode: teamProfile.billing_postcode || '',
    billing_region: teamProfile.billing_region || '',
    billing_country_code: teamProfile.billing_country_code || '',
    invoice_provider_name: teamProfile.invoice_provider_name || '',
  })

  const updateBillingMutation = useMutation({
    mutationFn: async () => {
      const { data, error } = await updateTeamBilling(teamId, billingInfo)
      if (error) throw error
      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['team-profile', teamId] })
      setIsEditing(false)
      toast({
        title: 'Success',
        description: 'Billing information updated successfully',
      })
    },
    onError: (error: any) => {
      toast({
        title: 'Error',
        description: error.message || 'Failed to update billing info',
        variant: 'destructive',
      })
    },
  })

  const handleSave = () => {
    updateBillingMutation.mutate()
  }

  const handleCancel = () => {
    setBillingInfo({
      billing_business_name: teamProfile.billing_business_name || '',
      billing_vat_number: teamProfile.billing_vat_number || '',
      billing_address_line1: teamProfile.billing_address_line1 || '',
      billing_address_line2: teamProfile.billing_address_line2 || '',
      billing_city: teamProfile.billing_city || '',
      billing_postcode: teamProfile.billing_postcode || '',
      billing_region: teamProfile.billing_region || '',
      billing_country_code: teamProfile.billing_country_code || '',
      invoice_provider_name: teamProfile.invoice_provider_name || '',
    })
    setIsEditing(false)
  }

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h2 className="text-xl font-semibold">Billing Information</h2>
        {!isEditing ? (
          <Button onClick={() => setIsEditing(true)} variant="outline" size="sm">
            <Edit2 className="w-4 h-4 mr-2" />
            Edit
          </Button>
        ) : (
          <div className="flex gap-2">
            <Button
              onClick={handleSave}
              size="sm"
              disabled={updateBillingMutation.isPending}
            >
              {updateBillingMutation.isPending ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <Save className="w-4 h-4 mr-2" />
              )}
              Save
            </Button>
            <Button
              onClick={handleCancel}
              variant="outline"
              size="sm"
              disabled={updateBillingMutation.isPending}
            >
              <X className="w-4 h-4 mr-2" />
              Cancel
            </Button>
          </div>
        )}
      </div>
      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
        <div className="space-y-2 md:col-span-2">
              <Label htmlFor="billing_business_name">Business Name</Label>
              {isEditing ? (
                <Input
                  id="billing_business_name"
                  value={billingInfo.billing_business_name}
                  onChange={(e) =>
                    setBillingInfo({ ...billingInfo, billing_business_name: e.target.value })
                  }
                  placeholder="Business name"
                />
              ) : (
                <p className="text-sm text-gray-900 mt-1">
                  {billingInfo.billing_business_name || '—'}
                </p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="billing_vat_number">VAT Number</Label>
              {isEditing ? (
                <Input
                  id="billing_vat_number"
                  value={billingInfo.billing_vat_number}
                  onChange={(e) =>
                    setBillingInfo({ ...billingInfo, billing_vat_number: e.target.value })
                  }
                  placeholder="VAT number"
                />
              ) : (
                <p className="text-sm text-gray-900 mt-1">
                  {billingInfo.billing_vat_number || '—'}
                </p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="invoice_provider_name">Invoice Provider</Label>
              {isEditing ? (
                <Input
                  id="invoice_provider_name"
                  value={billingInfo.invoice_provider_name}
                  onChange={(e) =>
                    setBillingInfo({ ...billingInfo, invoice_provider_name: e.target.value })
                  }
                  placeholder="Invoice provider"
                />
              ) : (
                <p className="text-sm text-gray-900 mt-1">
                  {billingInfo.invoice_provider_name || '—'}
                </p>
              )}
            </div>

            <div className="space-y-2 md:col-span-2">
              <Label htmlFor="billing_address_line1">Address Line 1</Label>
              {isEditing ? (
                <Input
                  id="billing_address_line1"
                  value={billingInfo.billing_address_line1}
                  onChange={(e) =>
                    setBillingInfo({ ...billingInfo, billing_address_line1: e.target.value })
                  }
                  placeholder="Address line 1"
                />
              ) : (
                <p className="text-sm text-gray-900 mt-1">
                  {billingInfo.billing_address_line1 || '—'}
                </p>
              )}
            </div>

            <div className="space-y-2 md:col-span-2">
              <Label htmlFor="billing_address_line2">Address Line 2</Label>
              {isEditing ? (
                <Input
                  id="billing_address_line2"
                  value={billingInfo.billing_address_line2}
                  onChange={(e) =>
                    setBillingInfo({ ...billingInfo, billing_address_line2: e.target.value })
                  }
                  placeholder="Address line 2"
                />
              ) : (
                <p className="text-sm text-gray-900 mt-1">
                  {billingInfo.billing_address_line2 || '—'}
                </p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="billing_city">City</Label>
              {isEditing ? (
                <Input
                  id="billing_city"
                  value={billingInfo.billing_city}
                  onChange={(e) =>
                    setBillingInfo({ ...billingInfo, billing_city: e.target.value })
                  }
                  placeholder="City"
                />
              ) : (
                <p className="text-sm text-gray-900 mt-1">
                  {billingInfo.billing_city || '—'}
                </p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="billing_postcode">Postcode</Label>
              {isEditing ? (
                <Input
                  id="billing_postcode"
                  value={billingInfo.billing_postcode}
                  onChange={(e) =>
                    setBillingInfo({ ...billingInfo, billing_postcode: e.target.value })
                  }
                  placeholder="Postcode"
                />
              ) : (
                <p className="text-sm text-gray-900 mt-1">
                  {billingInfo.billing_postcode || '—'}
                </p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="billing_region">Region/State</Label>
              {isEditing ? (
                <Input
                  id="billing_region"
                  value={billingInfo.billing_region}
                  onChange={(e) =>
                    setBillingInfo({ ...billingInfo, billing_region: e.target.value })
                  }
                  placeholder="Region/State"
                />
              ) : (
                <p className="text-sm text-gray-900 mt-1">
                  {billingInfo.billing_region || '—'}
                </p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="billing_country_code">Country Code</Label>
              {isEditing ? (
                <Input
                  id="billing_country_code"
                  value={billingInfo.billing_country_code}
                  onChange={(e) =>
                    setBillingInfo({ ...billingInfo, billing_country_code: e.target.value })
                  }
                  placeholder="e.g. US, GB, PT"
                  maxLength={2}
                />
              ) : (
                <p className="text-sm text-gray-900 mt-1">
                  {billingInfo.billing_country_code || '—'}
                </p>
              )}
            </div>
      </div>
    </div>
  )
}

// Activity Tab Component
function TeamActivityTab({ teamId }: { teamId: number }) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const [limit] = useState(50)
  const [offset, setOffset] = useState(0)

  const { data: activities, isLoading: activitiesLoading } = useQuery({
    queryKey: ['team-activity', teamId, limit, offset],
    queryFn: async () => {
      const { data, error } = await getTeamActivity(teamId, limit, offset)
      if (error) throw error
      return data
    },
  })

  const handleLoadMore = () => {
    setOffset((prev) => prev + limit)
  }

  const handleTaskClick = (taskId: number) => {
    const params = new URLSearchParams(searchParams.toString())
    params.set('rightView', 'task-details')
    params.set('rightTaskId', String(taskId))
    router.push(`${pathname}?${params.toString()}`)
  }

  return (
    <div>
      <div className="mb-6">
        <h2 className="text-xl font-semibold">Team Activity</h2>
        <p className="text-sm text-gray-500 mt-1">Recent activity from all team projects</p>
      </div>
      {activitiesLoading ? (
        <div className="flex items-center justify-center py-8">
          <Loader2 className="w-5 h-5 animate-spin text-gray-400" />
        </div>
      ) : activities && activities.length > 0 ? (
        <div className="space-y-4">
          {activities.map((activity) => (
            <div
              key={activity.id}
              className="flex gap-4 p-4 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
            >
              <div className="flex-shrink-0 pt-1">
                <div
                  className="w-2 h-2 rounded-full"
                  style={{ backgroundColor: activity.project_color || '#6b7280' }}
                />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-sm font-medium text-gray-900">
                    {activity.project_name}
                  </span>
                  <span className="text-xs text-gray-400">
                    {formatDistanceToNow(new Date(activity.timestamp), {
                      addSuffix: true,
                    })}
                  </span>
                </div>
                <div className="text-sm text-gray-700 mb-1">{activity.action}</div>
                {activity.details && (
                  <div className="text-xs text-gray-500">{activity.details}</div>
                )}
                {activity.task_id && (
                  <Button
                    variant="link"
                    size="sm"
                    className="text-xs p-0 h-auto mt-1"
                    onClick={() => handleTaskClick(activity.task_id!)}
                  >
                    View Task <ChevronRight className="w-3 h-3 ml-1" />
                  </Button>
                )}
              </div>
            </div>
          ))}

          {activities.length >= limit && (
            <div className="text-center pt-4">
              <Button onClick={handleLoadMore} variant="outline">
                Load More
              </Button>
            </div>
          )}
        </div>
      ) : (
        <div className="text-center py-12 border border-dashed border-gray-300 rounded-lg bg-white">
          <p className="text-sm text-gray-500">No activity yet</p>
        </div>
      )}
    </div>
  )
}

