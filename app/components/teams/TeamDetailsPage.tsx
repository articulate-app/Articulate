'use client'

import { useEffect, useState } from 'react'
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query'
import { 
  MessageSquare, 
  Edit2,
  Save,
  X,
  Loader2,
  Plus,
  Trash2,
  Maximize2,
  Minimize2,
  ChevronLeft,
} from 'lucide-react'
import { Button } from '../ui/button'
import { Input } from '../ui/input'
import { Label } from '../ui/label'
import { Textarea } from '../ui/textarea'
import { toast } from '../ui/use-toast'
import { mergeWorkspaceUrlState } from '../../lib/workspace-url-state'
import { useMobileDetection } from '../../hooks/use-mobile-detection'
import { MobileDetailHeader, type MobileDetailAction } from '../ui/mobile-detail-header'
import {
  getTeamProfile,
  updateTeam,
  updateTeamBilling,
  getTeamMembersWithDetails,
  addUserToTeam,
  removeUserFromTeam,
  getTeamActivity,
  getOrCreateTeamThread,
  getRoles,
  getAvailableUsers,
} from '@/lib/services/teams'
import { formatDistanceToNow } from 'date-fns'
import { cn } from '@/lib/utils'
import { getImageUrl } from '@/lib/public-media'
import { UserAvatar } from '../UserAvatar'
import { TeamAiUsageSection } from './team-ai-usage-section'

interface TeamDetailsPageProps {
  teamId: number
  onClose?: () => void
  isDetailsFocused?: boolean
  onFocusToggle?: () => void
  /** Drilled from user profile stack in tasks shell — clears `stackTeamId` only. */
  onStackBack?: () => void
  /**
   * Embed inside preferences modals: use local tab state (no URL sync) and a compact chrome
   * suitable for nested dialogs.
   */
  embedded?: boolean
  /** When true, omit the page header (parent supplies back/title chrome). */
  hideHeader?: boolean
  /** When team profile loads, report a friendly label for the middle-pane tab strip. */
  onResolvedTitle?: (title: string) => void
}

export function TeamDetailsPage({
  teamId,
  onClose,
  isDetailsFocused = false,
  onFocusToggle,
  onStackBack,
  embedded = false,
  hideHeader = false,
  onResolvedTitle,
}: TeamDetailsPageProps) {
  const isMobile = useMobileDetection()
  const queryClient = useQueryClient()

  const { data: teamProfile, isLoading: profileLoading, isFetching: profileFetching } = useQuery({
    queryKey: ['team-profile', teamId],
    queryFn: async () => {
      const { data, error } = await getTeamProfile(teamId)
      if (error) throw error
      return data
    },
    enabled: !isNaN(teamId) && teamId > 0,
    initialData: () => queryClient.getQueryData(['team-profile', teamId]),
    staleTime: 0,
  })

  useEffect(() => {
    const resolved =
      (typeof teamProfile?.title === "string" && teamProfile.title.trim()) ||
      (typeof teamProfile?.full_name === "string" && teamProfile.full_name.trim()) ||
      ""
    if (resolved) onResolvedTitle?.(resolved)
  }, [onResolvedTitle, teamProfile?.full_name, teamProfile?.title])

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

      mergeWorkspaceUrlState(
        {
          rightView: "thread-chat",
          rightThreadId: String(threadId),
        },
        { source: "team-chat-open", mode: "push" },
      )
    } catch (err: any) {
      toast({
        title: 'Error',
        description: err.message || 'Failed to open chat',
        variant: 'destructive',
      })
    }
  }

  if (profileLoading && !teamProfile) {
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

  const mobileTeamActions: MobileDetailAction[] = [
    {
      id: 'team-chat',
      label: 'Team Chat',
      icon: <MessageSquare className="h-4 w-4" />,
      onSelect: () => {
        void handleChatWithTeam()
      },
    },
  ]

  return (
    <div className="flex h-full flex-col">
      {!hideHeader && isMobile ? (
        <MobileDetailHeader
          onBack={onStackBack ?? onClose}
          backLabel={onStackBack ? 'Back to user profile' : 'Close details'}
          title={teamProfile.title}
          subtitle={teamProfile.full_name}
          actions={embedded ? [] : mobileTeamActions}
        />
      ) : !hideHeader ? (
      <div className="flex items-center justify-between border-t-0 bg-white px-6 py-4">
        <div className="flex min-w-0 flex-1 items-start gap-2">
          {onStackBack ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="mt-0.5 h-8 w-8 shrink-0 p-0 text-gray-600 hover:bg-gray-100 hover:text-gray-900"
              onClick={onStackBack}
              aria-label="Back"
              title="Back"
            >
              <ChevronLeft className="h-5 w-5" />
            </Button>
          ) : null}
          <div className="min-w-0">
          <h1 className="flex items-center gap-2 text-xl font-semibold text-gray-900">
            {teamProfile.title}
            {profileFetching && (teamProfile as { __partial?: boolean }).__partial ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin text-gray-400" aria-label="Loading full details" />
            ) : null}
          </h1>
          <p className="mt-1 text-sm text-gray-500">
            {teamProfile.full_name}
          </p>
          </div>
        </div>
        <div className="flex items-center gap-1">
          {!embedded ? (
            <Button
              onClick={handleChatWithTeam}
              size="sm"
              className="gap-2"
            >
              <MessageSquare className="w-4 h-4" />
              Team Chat
            </Button>
          ) : null}
          {onFocusToggle ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={onFocusToggle}
              className="h-8 w-8 p-0 text-gray-500 hover:bg-gray-100 hover:text-gray-700"
              aria-label={isDetailsFocused ? "Restore details pane" : "Expand details pane"}
              title={isDetailsFocused ? "Restore details pane" : "Expand details pane"}
            >
              {isDetailsFocused ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
            </Button>
          ) : null}
          {onClose ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={onClose}
              className="h-8 w-8 p-0 text-gray-500 hover:bg-gray-100 hover:text-gray-700"
              aria-label="Close details"
              title="Close details"
            >
              <X className="w-4 h-4" />
            </Button>
          ) : null}
        </div>
      </div>
      ) : null}

      <div
        className={cn(
          "min-h-0 flex-1",
          // Embedded team settings: let the parent settings pane own the scrollbar
          // so it stays aligned with the teams list.
          embedded ? "overflow-visible px-0 pb-2" : "overflow-auto px-6 py-6",
        )}
      >
        <div className="space-y-8">
          <section>
            <TeamOverviewSection teamId={teamId} teamProfile={teamProfile} />
          </section>

          <section className="space-y-4 border-t border-gray-100 pt-6">
            <TeamMembersSection teamId={teamId} />
          </section>

          <section className="space-y-4 border-t border-gray-100 pt-6">
            <TeamBillingSection teamId={teamId} teamProfile={teamProfile} />
          </section>

          <section className="space-y-4 border-t border-gray-100 pt-6">
            <TeamAiUsageSection teamId={teamId} />
          </section>

          <section className="space-y-4 border-t border-gray-100 pt-6">
            <TeamActivitySection teamId={teamId} />
          </section>
        </div>
      </div>
    </div>
  )
}

function TeamOverviewSection({ teamId, teamProfile }: { teamId: number; teamProfile: any }) {
  const queryClient = useQueryClient()
  const [isEditing, setIsEditing] = useState(false)
  const [editedProfile, setEditedProfile] = useState({
    title: teamProfile.title,
    description: teamProfile.description || '',
  })

  const updateMutation = useMutation({
    mutationFn: async () => {
      const { data, error } = await updateTeam(teamId, {
        title: editedProfile.title,
        description: editedProfile.description,
      })
      if (error) throw error
      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['team-profile', teamId] })
      setIsEditing(false)
      toast({ title: 'Success', description: 'Team info updated successfully' })
    },
    onError: (error: any) => {
      toast({
        title: 'Error',
        description: error.message || 'Failed to update team info',
        variant: 'destructive',
      })
    },
  })

  const handleCancel = () => {
    setEditedProfile({
      title: teamProfile.title,
      description: teamProfile.description || '',
    })
    setIsEditing(false)
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-sm font-medium text-gray-900">Overview</h3>
        {!isEditing ? (
          <Button onClick={() => setIsEditing(true)} variant="outline" size="sm">
            <Edit2 className="mr-2 h-4 w-4" />
            Edit
          </Button>
        ) : (
          <div className="flex gap-2">
            <Button size="sm" onClick={() => updateMutation.mutate()} disabled={updateMutation.isPending}>
              {updateMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
              Save
            </Button>
            <Button variant="outline" size="sm" onClick={handleCancel} disabled={updateMutation.isPending}>
              <X className="mr-2 h-4 w-4" />
              Cancel
            </Button>
          </div>
        )}
      </div>

      <div className="space-y-5">
        <div className="space-y-2">
          <Label htmlFor="team-title">Name</Label>
          {isEditing ? (
            <Input
              id="team-title"
              value={editedProfile.title}
              onChange={(e) => setEditedProfile({ ...editedProfile, title: e.target.value })}
              placeholder="Team name"
            />
          ) : (
            <Input id="team-title" value={teamProfile.title || ''} disabled className="bg-gray-50" />
          )}
        </div>

        <div className="space-y-2">
          <Label htmlFor="team-description">Description</Label>
          {isEditing ? (
            <Textarea
              id="team-description"
              value={editedProfile.description}
              onChange={(e) => setEditedProfile({ ...editedProfile, description: e.target.value })}
              placeholder="Team description"
              rows={3}
            />
          ) : (
            <Input
              id="team-description"
              value={teamProfile.description || ''}
              disabled
              className="bg-gray-50"
              placeholder="—"
            />
          )}
        </div>
      </div>
    </div>
  )
}

function TeamMembersSection({ teamId }: { teamId: number }) {
  const queryClient = useQueryClient()
  const [showAddPanel, setShowAddPanel] = useState(false)
  const [memberPendingRemove, setMemberPendingRemove] = useState<any>(null)
  const [selectedUserId, setSelectedUserId] = useState('')
  const [selectedRoleId, setSelectedRoleId] = useState('')
  const [userSearch, setUserSearch] = useState('')

  const { data: members, isLoading: membersLoading } = useQuery({
    queryKey: ['team-members-details', teamId],
    queryFn: async () => {
      const { data, error } = await getTeamMembersWithDetails(teamId)
      if (error) throw error
      return data
    },
  })

  const { data: roles } = useQuery({
    queryKey: ['roles'],
    queryFn: async () => {
      const { data, error } = await getRoles()
      if (error) throw error
      return data
    },
  })

  const { data: availableUsers } = useQuery({
    queryKey: ['available-users', userSearch],
    queryFn: async () => {
      const { data, error } = await getAvailableUsers(userSearch)
      if (error) throw error
      return data
    },
    enabled: showAddPanel,
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
      setShowAddPanel(false)
      setSelectedUserId('')
      setSelectedRoleId('')
      setUserSearch('')
      toast({ title: 'Success', description: 'Member added successfully' })
    },
    onError: (error: any) => {
      toast({ title: 'Error', description: error.message || 'Failed to add member', variant: 'destructive' })
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
      setMemberPendingRemove(null)
      toast({ title: 'Success', description: 'Member removed successfully' })
    },
    onError: (error: any) => {
      toast({ title: 'Error', description: error.message || 'Failed to remove member', variant: 'destructive' })
    },
  })

  const addMemberForm = (
    <div className="space-y-4 rounded-lg border border-gray-200 bg-gray-50/80 p-4">
      <div className="flex items-center justify-between gap-2">
        <h4 className="text-sm font-medium text-gray-900">Add member</h4>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-7 px-2"
          onClick={() => setShowAddPanel(false)}
          disabled={addMemberMutation.isPending}
        >
          Cancel
        </Button>
      </div>
      <div className="space-y-2">
        <Label htmlFor="user-search">Search user</Label>
        <Input
          id="user-search"
          placeholder="Search by name or email"
          value={userSearch}
          onChange={(e) => setUserSearch(e.target.value)}
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="add-member-user">User</Label>
        <select
          id="add-member-user"
          value={selectedUserId}
          onChange={(event) => setSelectedUserId(event.target.value)}
          className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
        >
          <option value="">Select user</option>
          {availableUsers?.map((user) => (
            <option key={user.id} value={String(user.id)}>
              {user.full_name || user.email}
            </option>
          ))}
        </select>
      </div>
      <div className="space-y-2">
        <Label htmlFor="add-member-role">Role</Label>
        <select
          id="add-member-role"
          value={selectedRoleId}
          onChange={(event) => setSelectedRoleId(event.target.value)}
          className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
        >
          <option value="">Select role</option>
          {roles?.map((role) => (
            <option key={role.id} value={String(role.id)}>
              {role.title}
            </option>
          ))}
        </select>
      </div>
      <Button
        type="button"
        onClick={() =>
          addMemberMutation.mutate({
            userId: parseInt(selectedUserId, 10),
            roleId: parseInt(selectedRoleId, 10),
          })
        }
        disabled={!selectedUserId || !selectedRoleId || addMemberMutation.isPending}
      >
        {addMemberMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
        Add member
      </Button>
    </div>
  )

  const updateRoleMutation = useMutation({
    mutationFn: async ({ userId, roleId }: { userId: number; roleId: number }) => {
      const { data, error } = await addUserToTeam(userId, teamId, roleId)
      if (error) throw error
      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['team-members-details', teamId] })
      toast({ title: 'Success', description: 'Role updated successfully' })
    },
    onError: (error: any) => {
      toast({ title: 'Error', description: error.message || 'Failed to update role', variant: 'destructive' })
    },
  })

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-sm font-medium text-gray-900">Members</h3>
        {!showAddPanel ? (
          <Button
            type="button"
            onClick={() => setShowAddPanel(true)}
            size="sm"
            variant="outline"
            className="gap-2"
          >
            <Plus className="h-4 w-4" />
            Add
          </Button>
        ) : null}
      </div>

      {showAddPanel ? addMemberForm : null}

      {memberPendingRemove ? (
        <div className="space-y-3 rounded-lg border border-red-100 bg-red-50/70 p-4">
          <div>
            <h4 className="text-sm font-medium text-gray-900">Remove member?</h4>
            <p className="mt-1 text-sm text-gray-600">
              Remove {memberPendingRemove.full_name || 'this member'} from the team.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setMemberPendingRemove(null)}
              disabled={removeMemberMutation.isPending}
            >
              Cancel
            </Button>
            <Button
              type="button"
              size="sm"
              className="bg-red-600 hover:bg-red-700"
              onClick={() => removeMemberMutation.mutate(memberPendingRemove.user_id)}
              disabled={removeMemberMutation.isPending}
            >
              {removeMemberMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Remove
            </Button>
          </div>
        </div>
      ) : null}

      {membersLoading ? (
        <div className="flex items-center justify-center py-8">
          <Loader2 className="h-5 w-5 animate-spin text-gray-400" />
        </div>
      ) : members && members.length > 0 ? (
        <div>
          {members.map((member) => (
            <div
              key={member.user_id}
              className="flex items-center justify-between gap-3 border-b border-gray-100 py-3 last:border-b-0"
            >
              <div className="flex min-w-0 items-center gap-3">
                <UserAvatar
                  name={member.full_name || member.email || null}
                  photoUrl={getImageUrl(member.photo)}
                  size="sm"
                />
                <div className="min-w-0">
                  <div className="truncate text-sm font-medium text-gray-900">
                    {member.full_name || `User ${member.user_id}`}
                  </div>
                  <p className="truncate text-sm text-gray-500">
                    {member.email || 'No email'}
                    {member.role_title ? ` · ${member.role_title}` : ''}
                  </p>
                </div>
              </div>

              <div className="flex shrink-0 items-center gap-1.5">
                <select
                  value={String(member.role_id)}
                  disabled={updateRoleMutation.isPending}
                  onChange={(event) =>
                    updateRoleMutation.mutate({
                      userId: member.user_id,
                      roleId: parseInt(event.target.value, 10),
                    })
                  }
                  aria-label={`Role for ${member.full_name || member.email || `user ${member.user_id}`}`}
                  className="h-8 w-[8.5rem] cursor-pointer rounded-md border-0 bg-transparent px-2 text-xs text-gray-700 hover:bg-gray-100 focus:outline-none focus:ring-0"
                >
                  {roles?.map((role) => (
                    <option key={role.id} value={String(role.id)}>
                      {role.title}
                    </option>
                  ))}
                </select>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-8 w-8 p-0 text-gray-400 hover:text-red-600"
                  onClick={() => setMemberPendingRemove(member)}
                  aria-label="Remove member"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <p className="py-6 text-sm text-gray-500">No members yet.</p>
      )}

    </div>
  )
}

function TeamBillingSection({ teamId, teamProfile }: { teamId: number; teamProfile: any }) {
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
      toast({ title: 'Success', description: 'Billing information updated successfully' })
    },
    onError: (error: any) => {
      toast({
        title: 'Error',
        description: error.message || 'Failed to update billing info',
        variant: 'destructive',
      })
    },
  })

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

  const field = (
    id: keyof typeof billingInfo,
    label: string,
    opts?: { className?: string; placeholder?: string; maxLength?: number },
  ) => (
    <div className={cn('space-y-2', opts?.className)}>
      <Label htmlFor={id}>{label}</Label>
      {isEditing ? (
        <Input
          id={id}
          value={billingInfo[id]}
          onChange={(e) => setBillingInfo({ ...billingInfo, [id]: e.target.value })}
          placeholder={opts?.placeholder}
          maxLength={opts?.maxLength}
        />
      ) : (
        <Input id={id} value={billingInfo[id] || ''} disabled className="bg-gray-50" placeholder="—" />
      )}
    </div>
  )

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-sm font-medium text-gray-900">Billing info</h3>
        {!isEditing ? (
          <Button onClick={() => setIsEditing(true)} variant="outline" size="sm">
            <Edit2 className="mr-2 h-4 w-4" />
            Edit
          </Button>
        ) : (
          <div className="flex gap-2">
            <Button size="sm" onClick={() => updateBillingMutation.mutate()} disabled={updateBillingMutation.isPending}>
              {updateBillingMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
              Save
            </Button>
            <Button variant="outline" size="sm" onClick={handleCancel} disabled={updateBillingMutation.isPending}>
              <X className="mr-2 h-4 w-4" />
              Cancel
            </Button>
          </div>
        )}
      </div>

      <div className="space-y-5">
        {field('billing_business_name', 'Business name', { placeholder: 'Business name' })}
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
          {field('billing_vat_number', 'VAT number', { placeholder: 'VAT number' })}
          {field('invoice_provider_name', 'Invoice provider', { placeholder: 'Invoice provider' })}
        </div>
        {field('billing_address_line1', 'Address line 1', { placeholder: 'Address line 1' })}
        {field('billing_address_line2', 'Address line 2', { placeholder: 'Address line 2' })}
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
          {field('billing_city', 'City', { placeholder: 'City' })}
          {field('billing_postcode', 'Postcode', { placeholder: 'Postcode' })}
          {field('billing_region', 'Region / state', { placeholder: 'Region/State' })}
          {field('billing_country_code', 'Country code', { placeholder: 'e.g. US', maxLength: 2 })}
        </div>
      </div>
    </div>
  )
}

function TeamActivitySection({ teamId }: { teamId: number }) {
  const [limit] = useState(30)
  const [offset, setOffset] = useState(0)

  const { data: activities, isLoading: activitiesLoading } = useQuery({
    queryKey: ['team-activity', teamId, limit, offset],
    queryFn: async () => {
      const { data, error } = await getTeamActivity(teamId, limit, offset)
      if (error) throw error
      return data
    },
  })

  return (
    <div className="space-y-4">
      <h3 className="text-sm font-medium text-gray-900">Activity</h3>

      {activitiesLoading ? (
        <div className="flex items-center justify-center py-8">
          <Loader2 className="h-5 w-5 animate-spin text-gray-400" />
        </div>
      ) : activities && activities.length > 0 ? (
        <div>
          {activities.map((activity) => (
            <div
              key={activity.id}
              className="flex items-start justify-between gap-3 border-b border-gray-100 py-2.5 last:border-b-0"
            >
              <div className="min-w-0">
                <div className="truncate text-sm text-gray-900">{activity.action}</div>
                <p className="truncate text-xs text-gray-500">
                  {[activity.project_name, activity.details].filter(Boolean).join(' · ')}
                </p>
              </div>
              <span className="shrink-0 text-xs text-gray-400">
                {formatDistanceToNow(new Date(activity.timestamp), { addSuffix: true })}
              </span>
            </div>
          ))}
          {activities.length >= limit ? (
            <div className="pt-3">
              <Button variant="outline" size="sm" onClick={() => setOffset((prev) => prev + limit)}>
                Load more
              </Button>
            </div>
          ) : null}
        </div>
      ) : (
        <p className="py-6 text-sm text-gray-500">No activity yet.</p>
      )}
    </div>
  )
}
