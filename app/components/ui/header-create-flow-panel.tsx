"use client"

import { AddTaskForm } from "../tasks/AddTaskForm"
import { ThreadParticipantsInline } from "../comments-section/thread-participants-inline"
import { cn } from "@/lib/utils"
import { Button } from "./button"
import { Input } from "./input"
import { Label } from "./label"
import { RichTextEditor } from "./rich-text-editor"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./select"
import { CREATE_POPUP_SELECT_CONTENT_PROPS, type HeaderCreateFlow } from "./use-header-create-flow"

interface HeaderCreateFlowPanelProps {
  flow: HeaderCreateFlow
  onCancel: () => void
  onSuccess: () => void
}

export function HeaderCreateFlowPanel({ flow, onCancel, onSuccess }: HeaderCreateFlowPanelProps) {
  const {
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
    resetCreateState,
    handleNonTaskSubmit,
  } = flow

  const handleTaskSuccess = () => {
    resetCreateState()
    onSuccess()
  }

  const handleCancel = () => {
    resetCreateState()
    onCancel()
  }

  const handleSubmit = async () => {
    const didSucceed = await handleNonTaskSubmit()
    if (didSucceed) onSuccess()
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <div
        className={cn(
          "min-h-0 flex-1 overscroll-contain",
          createType === "task" ? "flex flex-col overflow-hidden" : "overflow-y-auto p-4",
        )}
      >
        {createType === "task" ? (
          <AddTaskForm isModal={true} variant="composer" onSuccess={handleTaskSuccess} />
        ) : null}
        {createType === "project" ? (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="create-project-name">Project name</Label>
              <Input
                id="create-project-name"
                value={projectName}
                onChange={(event) => setProjectName(event.target.value)}
                placeholder="e.g. Website redesign"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="create-project-team">Team</Label>
              <Select
                value={projectTeamId == null ? "" : String(projectTeamId)}
                onValueChange={(value) => setProjectTeamId(value ? Number(value) : null)}
              >
                <SelectTrigger id="create-project-team">
                  <SelectValue placeholder="Select team" />
                </SelectTrigger>
                <SelectContent {...CREATE_POPUP_SELECT_CONTENT_PROPS}>
                  {(teamsQuery.data ?? []).map((team: any) => (
                    <SelectItem key={team.id} value={String(team.id)}>
                      {team.title}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        ) : null}
        {createType === "user" ? (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="create-user-email">Email</Label>
              <Input
                id="create-user-email"
                type="email"
                value={userEmail}
                onChange={(event) => setUserEmail(event.target.value)}
                placeholder="e.g. user@company.com"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="create-user-name">Full name</Label>
              <Input
                id="create-user-name"
                value={userName}
                onChange={(event) => setUserName(event.target.value)}
                placeholder="Optional"
              />
            </div>
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="create-user-team">Team</Label>
                <Select
                  value={userTeamId == null ? "none" : String(userTeamId)}
                  onValueChange={(value) => setUserTeamId(value === "none" ? null : Number(value))}
                >
                  <SelectTrigger id="create-user-team">
                    <SelectValue placeholder="Optional" />
                  </SelectTrigger>
                  <SelectContent {...CREATE_POPUP_SELECT_CONTENT_PROPS}>
                    <SelectItem value="none">None</SelectItem>
                    {(teamsQuery.data ?? []).map((team: any) => (
                      <SelectItem key={team.id} value={String(team.id)}>
                        {team.title}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="create-user-role">Role</Label>
                <Select
                  value={userRoleId == null ? "none" : String(userRoleId)}
                  onValueChange={(value) => setUserRoleId(value === "none" ? null : Number(value))}
                >
                  <SelectTrigger id="create-user-role">
                    <SelectValue placeholder="Optional" />
                  </SelectTrigger>
                  <SelectContent {...CREATE_POPUP_SELECT_CONTENT_PROPS}>
                    <SelectItem value="none">None</SelectItem>
                    {(rolesQuery.data ?? []).map((role: any) => (
                      <SelectItem key={role.id} value={String(role.id)}>
                        {role.title}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <label className="flex items-center gap-2 text-sm text-gray-700">
              <input
                type="checkbox"
                checked={userSendInvite}
                onChange={(event) => setUserSendInvite(event.target.checked)}
              />
              Send invite email
            </label>
          </div>
        ) : null}
        {createType === "thread" ? (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="create-thread-title">Title (optional)</Label>
              <Input
                id="create-thread-title"
                value={threadTitle}
                onChange={(event) => setThreadTitle(event.target.value)}
                placeholder="e.g. Content review"
              />
            </div>
            <div className="space-y-2">
              <Label>Message</Label>
              <RichTextEditor
                value={threadMessage}
                onChange={setThreadMessage}
                placeholder="Write a message..."
                height={150}
                toolbarId="ql-toolbar-create-thread-modal"
              />
            </div>
            {threadAssociationTags.length > 0 ? (
              <div className="space-y-2">
                <Label>Tagged in message</Label>
                <div className="flex flex-wrap gap-2">
                  {threadAssociationTags.map((tag) => (
                    <button
                      key={`${tag.type}:${tag.id}`}
                      type="button"
                      onClick={() => removeThreadAssociationTag(tag.type, tag.id)}
                      className="inline-flex items-center gap-1 rounded-full bg-gray-100 px-2 py-1 text-xs text-gray-700 hover:bg-gray-200"
                      title="Remove tag"
                    >
                      <span>{`@${tag.label}`}</span>
                      <span aria-hidden>×</span>
                    </button>
                  ))}
                </div>
              </div>
            ) : null}
            {threadAssociationQuery && threadAssociationSuggestionsQuery.data?.length ? (
              <div className="space-y-1">
                <p className="text-xs text-gray-500">Tag task, project, or user from message</p>
                <div className="max-h-36 overflow-y-auto rounded-md border border-gray-200 bg-white">
                  {threadAssociationSuggestionsQuery.data.map((item, index) => (
                    <button
                      key={`assoc-suggestion:${item.entity_type}:${item.entity_id ?? index}`}
                      type="button"
                      onClick={() => addThreadAssociationTag(item)}
                      className="flex w-full items-center justify-between px-2 py-1.5 text-left text-sm hover:bg-gray-50"
                    >
                      <span className="truncate">{item.title || item.preview || "Untitled"}</span>
                      <span className="ml-2 shrink-0 text-[11px] uppercase text-gray-500">
                        {item.entity_type}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            ) : null}
          </div>
        ) : null}
      </div>
      {createError ? <div className="px-4 pb-2 text-sm text-red-600">{createError}</div> : null}
      {createType !== "task" ? (
        <div className="relative z-0 flex shrink-0 justify-end gap-2 border-t bg-white px-4 py-3">
          {createType === "thread" ? (
            <div className="mr-auto min-w-0">
              <div className="mb-1 text-xs font-medium text-gray-600">Participants</div>
              <ThreadParticipantsInline
                pendingMode={true}
                pendingParticipants={threadParticipantUsers}
                setPendingParticipants={setThreadParticipantUsers}
                allProjectUsers={teamUsersWithoutMe}
                currentUserId={currentPublicUserId}
              />
            </div>
          ) : null}
          <Button type="button" variant="outline" onClick={handleCancel} disabled={isSubmittingCreate}>
            Cancel
          </Button>
          <Button
            type="button"
            onClick={() => {
              void handleSubmit()
            }}
            disabled={isSubmittingCreate || (createType === "thread" && isThreadMessageEmpty)}
          >
            {isSubmittingCreate ? "Creating..." : "Create"}
          </Button>
        </div>
      ) : null}
    </div>
  )
}
