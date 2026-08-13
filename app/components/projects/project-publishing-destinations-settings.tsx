"use client"

import { useCallback, useEffect, useState } from "react"
import { Loader2, Save, Trash2 } from "lucide-react"
import { Button } from "../ui/button"
import { Input } from "../ui/input"
import { Label } from "../ui/label"
import { Textarea } from "../ui/textarea"
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
  createPublishingDestination,
  deletePublishingDestination,
  listPublishingDestinations,
  removePublishingDestinationProfile,
  updatePublishingDestination,
} from "../../lib/services/agentic-publishing"
import type {
  PublishingDestination,
  PublishingDestinationEntryPoints,
} from "../../lib/publishing/types"
import { toast } from "../ui/use-toast"
import { ProjectPublishingOperations } from "./project-publishing-operations"
import { cn } from "../../lib/utils"

type EntryPointKey = keyof PublishingDestinationEntryPoints

const ENTRY_POINT_FIELDS: Array<{
  key: EntryPointKey
  label: string
  placeholder: string
}> = [
  {
    key: "article",
    label: "Article / blog",
    placeholder: "https://…/blog or editor URL",
  },
  {
    key: "newsletter",
    label: "Newsletter / email",
    placeholder: "https://…/campaigns or compose URL",
  },
  {
    key: "social_post",
    label: "Social post",
    placeholder: "https://…/composer or posts URL",
  },
  {
    key: "landing_page",
    label: "Landing page",
    placeholder: "https://…/pages or builder URL",
  },
  {
    key: "other",
    label: "Other content",
    placeholder: "https://… preferred start URL for other types",
  },
]

type DestinationDraft = {
  name: string
  startUrl: string
  guidance: string
  entryPoints: Record<EntryPointKey, string>
}

function emptyEntryPoints(): Record<EntryPointKey, string> {
  return {
    article: "",
    newsletter: "",
    social_post: "",
    landing_page: "",
    other: "",
  }
}

function draftFromDestination(row: PublishingDestination): DestinationDraft {
  const points = row.memory?.entry_points ?? {}
  return {
    name: row.name ?? "",
    startUrl: row.start_url ?? "",
    guidance: row.memory?.guidance ?? "",
    entryPoints: {
      article: points.article ?? "",
      newsletter: points.newsletter ?? "",
      social_post: points.social_post ?? "",
      landing_page: points.landing_page ?? "",
      other: points.other ?? "",
    },
  }
}

function statusLabel(status: string): string {
  switch (status) {
    case "connected":
      return "Connected"
    case "connecting":
      return "Connecting"
    case "needs_login":
      return "Needs login"
    case "error":
      return "Error"
    default:
      return "Disconnected"
  }
}

export function ProjectPublishingDestinationsSettings({
  projectId,
}: {
  projectId: number
}) {
  const [section, setSection] = useState<"destinations" | "operations">("destinations")
  const [destinations, setDestinations] = useState<PublishingDestination[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [savingId, setSavingId] = useState<string | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [drafts, setDrafts] = useState<Record<string, DestinationDraft>>({})
  const [newName, setNewName] = useState("")
  const [newUrl, setNewUrl] = useState("")
  const [isCreating, setIsCreating] = useState(false)
  const [confirmRemoveProfileId, setConfirmRemoveProfileId] = useState<string | null>(null)
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)

  const load = useCallback(async () => {
    setIsLoading(true)
    try {
      const rows = await listPublishingDestinations({ projectId })
      setDestinations(rows)
      const nextDrafts: Record<string, DestinationDraft> = {}
      for (const row of rows) {
        nextDrafts[row.id] = draftFromDestination(row)
      }
      setDrafts(nextDrafts)
    } catch (error) {
      toast({
        title: "Could not load publishing destinations",
        description: error instanceof Error ? error.message : "Try again",
        variant: "destructive",
      })
    } finally {
      setIsLoading(false)
    }
  }, [projectId])

  useEffect(() => {
    void load()
  }, [load])

  useEffect(() => {
    const onOpen = (event: Event) => {
      const detail = (event as CustomEvent<{ projectId?: number }>).detail
      if (detail?.projectId != null && detail.projectId !== projectId) return
      setSection("operations")
    }
    window.addEventListener("articulate:open-project-publishing", onOpen)
    return () => window.removeEventListener("articulate:open-project-publishing", onOpen)
  }, [projectId])

  const saveDestination = async (destinationId: string) => {
    const draft = drafts[destinationId]
    if (!draft) return
    setSavingId(destinationId)
    try {
      const entryPoints: PublishingDestinationEntryPoints = {}
      for (const field of ENTRY_POINT_FIELDS) {
        const value = draft.entryPoints[field.key].trim()
        entryPoints[field.key] = value || null
      }
      const updated = await updatePublishingDestination({
        destinationId,
        name: draft.name.trim(),
        startUrl: draft.startUrl.trim(),
        guidance: draft.guidance.trim() || null,
        entryPoints,
      })
      setDestinations((prev) =>
        prev.map((row) => (row.id === destinationId ? updated : row)),
      )
      setDrafts((prev) => ({
        ...prev,
        [destinationId]: draftFromDestination(updated),
      }))
      toast({ title: "Destination updated" })
    } catch (error) {
      toast({
        title: "Could not save destination",
        description: error instanceof Error ? error.message : "Try again",
        variant: "destructive",
      })
    } finally {
      setSavingId(null)
    }
  }

  const removeProfile = async (destinationId: string) => {
    setBusyId(destinationId)
    try {
      const updated = await removePublishingDestinationProfile(destinationId)
      setDestinations((prev) =>
        prev.map((row) => (row.id === destinationId ? updated : row)),
      )
      toast({
        title: "Profile removed",
        description: "Reconnect this destination before publishing again.",
      })
    } catch (error) {
      toast({
        title: "Could not remove profile",
        description: error instanceof Error ? error.message : "Try again",
        variant: "destructive",
      })
    } finally {
      setBusyId(null)
      setConfirmRemoveProfileId(null)
    }
  }

  const deleteDestination = async (destinationId: string) => {
    setBusyId(destinationId)
    try {
      await deletePublishingDestination(destinationId)
      setDestinations((prev) => prev.filter((row) => row.id !== destinationId))
      setDrafts((prev) => {
        const next = { ...prev }
        delete next[destinationId]
        return next
      })
      toast({ title: "Destination deleted" })
    } catch (error) {
      toast({
        title: "Could not delete destination",
        description: error instanceof Error ? error.message : "Try again",
        variant: "destructive",
      })
    } finally {
      setBusyId(null)
      setConfirmDeleteId(null)
    }
  }

  const createDestination = async () => {
    const name = newName.trim()
    const startUrl = newUrl.trim()
    if (!name || !startUrl) {
      toast({
        title: "Name and default URL are required",
        variant: "destructive",
      })
      return
    }
    setIsCreating(true)
    try {
      await createPublishingDestination({ projectId, name, startUrl })
      setNewName("")
      setNewUrl("")
      await load()
      toast({ title: "Destination created" })
    } catch (error) {
      toast({
        title: "Could not create destination",
        description: error instanceof Error ? error.message : "Try again",
        variant: "destructive",
      })
    } finally {
      setIsCreating(false)
    }
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12 text-sm text-gray-500">
        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
        Loading destinations…
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap gap-1">
        {(
          [
            ["destinations", "Destinations"],
            ["operations", "Scheduled & history"],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            className={cn(
              "rounded-md px-2.5 py-1 text-xs",
              section === id
                ? "bg-gray-900 text-white"
                : "text-gray-600 hover:bg-gray-50 hover:text-gray-900",
            )}
            onClick={() => setSection(id)}
          >
            {label}
          </button>
        ))}
      </div>

      {section === "operations" ? (
        <div className="space-y-2">
          <div>
            <h3 className="text-sm font-medium text-gray-900">Publishing activity</h3>
            <p className="mt-0.5 text-xs text-gray-500">
              Upcoming schedules, completed publications, and items that need attention.
            </p>
          </div>
          <ProjectPublishingOperations projectId={projectId} />
        </div>
      ) : null}

      {section !== "destinations" ? null : (
      <>
      <div>
        <h3 className="text-sm font-medium text-gray-900">Publishing destinations</h3>
        <p className="mt-0.5 text-xs text-gray-500">
          Default URL plus optional entry points per content type. The agent picks the entry
          point that matches what you are publishing. Browser login profiles can be removed so
          you can reconnect from scratch.
        </p>
      </div>

      {destinations.length === 0 ? (
        <p className="text-sm text-gray-500">No publishing destinations yet.</p>
      ) : (
        <div className="space-y-4">
          {destinations.map((destination) => {
            const draft = drafts[destination.id] ?? {
              name: destination.name,
              startUrl: destination.start_url,
              guidance: "",
              entryPoints: emptyEntryPoints(),
            }
            const isBusy = busyId === destination.id
            return (
              <div
                key={destination.id}
                className="space-y-3 rounded-lg border border-gray-200 p-4"
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <div className="truncate text-sm font-medium text-gray-900">
                      {destination.name}
                    </div>
                    <div className="text-xs text-gray-500">{statusLabel(destination.status)}</div>
                  </div>
                  {destination.has_profile ? (
                    <span className="rounded bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-700">
                      Profile connected
                    </span>
                  ) : (
                    <span className="rounded bg-gray-100 px-2 py-0.5 text-[11px] font-medium text-gray-600">
                      No profile
                    </span>
                  )}
                </div>

                <div className="space-y-2">
                  <Label htmlFor={`dest-name-${destination.id}`}>Name</Label>
                  <Input
                    id={`dest-name-${destination.id}`}
                    value={draft.name}
                    onChange={(e) =>
                      setDrafts((prev) => ({
                        ...prev,
                        [destination.id]: { ...draft, name: e.target.value },
                      }))
                    }
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor={`dest-url-${destination.id}`}>Default URL</Label>
                  <Input
                    id={`dest-url-${destination.id}`}
                    value={draft.startUrl}
                    onChange={(e) =>
                      setDrafts((prev) => ({
                        ...prev,
                        [destination.id]: { ...draft, startUrl: e.target.value },
                      }))
                    }
                    placeholder="https://account.squarespace.com/"
                  />
                  <p className="text-[11px] text-gray-500">
                    Fallback when no content-type entry point matches.
                  </p>
                </div>

                <div className="space-y-2">
                  <Label>Content entry points</Label>
                  <p className="text-[11px] text-gray-500">
                    Optional. Fill only the types you publish to this destination.
                  </p>
                  <div className="space-y-3 rounded-md border border-gray-100 bg-gray-50/60 p-3">
                    {ENTRY_POINT_FIELDS.map((field) => (
                      <div key={field.key} className="space-y-1.5">
                        <Label
                          htmlFor={`dest-${field.key}-${destination.id}`}
                          className="text-xs font-medium text-gray-700"
                        >
                          {field.label}
                        </Label>
                        <Input
                          id={`dest-${field.key}-${destination.id}`}
                          value={draft.entryPoints[field.key]}
                          onChange={(e) =>
                            setDrafts((prev) => ({
                              ...prev,
                              [destination.id]: {
                                ...draft,
                                entryPoints: {
                                  ...draft.entryPoints,
                                  [field.key]: e.target.value,
                                },
                              },
                            }))
                          }
                          placeholder={field.placeholder}
                        />
                      </div>
                    ))}
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor={`dest-guidance-${destination.id}`}>Guidance</Label>
                  <Textarea
                    id={`dest-guidance-${destination.id}`}
                    value={draft.guidance}
                    onChange={(e) =>
                      setDrafts((prev) => ({
                        ...prev,
                        [destination.id]: { ...draft, guidance: e.target.value },
                      }))
                    }
                    rows={3}
                    placeholder="Articles go in Blog. Newsletters use the campaign composer. Social posts go to LinkedIn company page."
                  />
                </div>

                {destination.memory?.last_successful_publication_url ? (
                  <div className="text-xs text-gray-500">
                    Last successful publication:{" "}
                    <a
                      href={destination.memory.last_successful_publication_url}
                      target="_blank"
                      rel="noreferrer"
                      className="underline"
                    >
                      {destination.memory.last_successful_publication_url}
                    </a>
                  </div>
                ) : null}

                <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                  <div className="flex flex-wrap gap-2">
                    {destination.has_profile ? (
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        disabled={isBusy}
                        onClick={() => setConfirmRemoveProfileId(destination.id)}
                      >
                        Remove profile
                      </Button>
                    ) : null}
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      className="text-red-600 hover:bg-red-50 hover:text-red-700"
                      disabled={isBusy}
                      onClick={() => setConfirmDeleteId(destination.id)}
                    >
                      <Trash2 className="mr-1.5 h-3.5 w-3.5" />
                      Delete destination
                    </Button>
                  </div>
                  <Button
                    type="button"
                    size="sm"
                    onClick={() => void saveDestination(destination.id)}
                    disabled={savingId === destination.id || isBusy}
                    className="gap-1.5"
                  >
                    {savingId === destination.id ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Save className="h-3.5 w-3.5" />
                    )}
                    Save
                  </Button>
                </div>
              </div>
            )
          })}
        </div>
      )}

      <div className="space-y-3 border-t border-gray-100 pt-5">
        <h4 className="text-sm font-medium text-gray-900">Add destination</h4>
        <div className="space-y-2">
          <Label htmlFor="new-dest-name">Name</Label>
          <Input
            id="new-dest-name"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="Articulate Squarespace"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="new-dest-url">Default URL</Label>
          <Input
            id="new-dest-url"
            value={newUrl}
            onChange={(e) => setNewUrl(e.target.value)}
            placeholder="https://account.squarespace.com/"
          />
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => void createDestination()}
          disabled={isCreating}
        >
          {isCreating ? <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" /> : null}
          Add destination
        </Button>
      </div>

      <AlertDialog
        open={confirmRemoveProfileId != null}
        onOpenChange={(open) => {
          if (!open) setConfirmRemoveProfileId(null)
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove browser profile?</AlertDialogTitle>
            <AlertDialogDescription>
              This clears the saved login session for this destination. The next publish or
              connect will ask you to sign in again.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (confirmRemoveProfileId) void removeProfile(confirmRemoveProfileId)
              }}
            >
              Remove profile
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={confirmDeleteId != null}
        onOpenChange={(open) => {
          if (!open) setConfirmDeleteId(null)
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete destination?</AlertDialogTitle>
            <AlertDialogDescription>
              This removes the destination, its memory, and any attached browser profile.
              Existing publication history is kept.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 hover:bg-red-700"
              onClick={() => {
                if (confirmDeleteId) void deleteDestination(confirmDeleteId)
              }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      </>
      )}
    </div>
  )
}
