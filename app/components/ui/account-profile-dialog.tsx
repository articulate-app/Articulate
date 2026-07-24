"use client"

import * as React from "react"
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs"
import { Edit2, Loader2 } from "lucide-react"
import { Dialog, DialogContent, DialogTitle } from "./dialog"
import { Button } from "./button"
import { Input } from "./input"
import { Label } from "./label"
import { UserAvatar } from "../UserAvatar"
import { useCurrentUserStore } from "../../store/current-user"
import { getImageUrl, PUBLIC_MEDIA_BUCKET, uploadImage } from "../../lib/public-media"
import { updateUserPhoto } from "../../lib/services/users"
import { toast } from "./use-toast"

interface AccountProfileDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function AccountProfileDialog({ open, onOpenChange }: AccountProfileDialogProps) {
  const publicUserId = useCurrentUserStore((s) => s.publicUserId)
  const fullName = useCurrentUserStore((s) => s.fullName)
  const photo = useCurrentUserStore((s) => s.photo)
  const userMetadata = useCurrentUserStore((s) => s.userMetadata)
  const setFullName = useCurrentUserStore((s) => s.setFullName)
  const setPhoto = useCurrentUserStore((s) => s.setPhoto)
  const setUserMetadata = useCurrentUserStore((s) => s.setUserMetadata)

  const photoInputRef = React.useRef<HTMLInputElement | null>(null)
  const [draftName, setDraftName] = React.useState("")
  const [photoPath, setPhotoPath] = React.useState<string | null>(null)
  const [isLoading, setIsLoading] = React.useState(false)
  const [isSaving, setIsSaving] = React.useState(false)
  const [isPhotoUploading, setIsPhotoUploading] = React.useState(false)

  const photoUrl = React.useMemo(
    () => getImageUrl(photoPath || photo || userMetadata?.photo || userMetadata?.avatar_url || null),
    [photo, photoPath, userMetadata],
  )

  React.useEffect(() => {
    if (!open) return

    // Radix DropdownMenu can leave body pointer-events:none when opening a dialog from a menu item.
    const clearPointerEvents = () => {
      document.body.style.pointerEvents = ""
    }
    clearPointerEvents()
    const clearTimers = [
      window.setTimeout(clearPointerEvents, 0),
      window.setTimeout(clearPointerEvents, 50),
      window.setTimeout(clearPointerEvents, 150),
    ]

    let cancelled = false
    const load = async () => {
      setIsLoading(true)
      setDraftName(fullName || userMetadata?.full_name || "")
      setPhotoPath(photo)
      try {
        if (!publicUserId) return
        const supabase = createClientComponentClient()
        const { data } = await supabase
          .from("users")
          .select("full_name, photo")
          .eq("id", publicUserId)
          .maybeSingle()
        if (cancelled || !data) return
        setDraftName(data.full_name || "")
        setPhotoPath(data.photo || null)
        if (data.photo) setPhoto(data.photo)
      } finally {
        if (!cancelled) setIsLoading(false)
      }
    }
    void load()
    return () => {
      cancelled = true
      clearTimers.forEach((id) => window.clearTimeout(id))
      clearPointerEvents()
    }
    // Only reload when the dialog opens / user id changes — not when photo/name update mid-edit.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional
  }, [open, publicUserId])

  const handleOpenChange = React.useCallback(
    (nextOpen: boolean) => {
      onOpenChange(nextOpen)
      document.body.style.pointerEvents = ""
      if (!nextOpen) {
        window.setTimeout(() => {
          document.body.style.pointerEvents = ""
        }, 0)
      }
    },
    [onOpenChange],
  )

  const handleSaveName = React.useCallback(async () => {
    if (!publicUserId) return
    const nextName = draftName.trim()
    if (!nextName) {
      toast({ title: "Name required", description: "Please enter your name.", variant: "destructive" })
      return
    }
    setIsSaving(true)
    try {
      const supabase = createClientComponentClient()
      const { error } = await supabase
        .from("users")
        .update({ full_name: nextName })
        .eq("id", publicUserId)
      if (error) throw error
      setFullName(nextName)
      setUserMetadata({
        ...(userMetadata || {}),
        full_name: nextName,
      })
      toast({ title: "Saved", description: "Your name was updated." })
    } catch (err: any) {
      toast({
        title: "Could not save",
        description: err?.message || "Failed to update name",
        variant: "destructive",
      })
    } finally {
      setIsSaving(false)
    }
  }, [draftName, publicUserId, setFullName, setUserMetadata, userMetadata])

  const handlePhotoChange = React.useCallback(
    async (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0]
      if (!file || !publicUserId) return

      setIsPhotoUploading(true)
      try {
        const { storagePath, error: uploadError } = await uploadImage({
          bucket: PUBLIC_MEDIA_BUCKET,
          path: `users/${publicUserId}`,
          file,
          upsert: true,
        })
        if (uploadError || !storagePath) throw uploadError ?? new Error("Upload failed")

        const { error: updateError } = await updateUserPhoto(publicUserId, storagePath)
        if (updateError) throw updateError

        setPhotoPath(storagePath)
        setPhoto(storagePath)
        setUserMetadata({
          ...(userMetadata || {}),
          photo: storagePath,
        })
        toast({ title: "Photo updated", description: "Your profile picture was updated." })
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
    },
    [publicUserId, setPhoto, setUserMetadata, userMetadata],
  )

  const displayName = draftName.trim() || fullName || userMetadata?.full_name || "User"
  const isDirty = draftName.trim() !== (fullName || "").trim()

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-sm gap-0 overflow-hidden p-0 sm:rounded-2xl">
        <DialogTitle className="sr-only">Profile</DialogTitle>
        {isLoading ? (
          <div className="flex items-center justify-center gap-2 px-6 py-12 text-sm text-gray-500">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading...
          </div>
        ) : (
          <div className="space-y-5 px-6 py-6">
            <div className="flex flex-col items-center gap-3">
              <div className="relative">
                <UserAvatar name={displayName} photoUrl={photoUrl} size="xl" />
                <input
                  ref={photoInputRef}
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  className="hidden"
                  disabled={isPhotoUploading || !publicUserId}
                  onChange={(event) => {
                    void handlePhotoChange(event)
                  }}
                />
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  className="absolute -bottom-1 -right-1 h-7 w-7 rounded-full"
                  onClick={() => photoInputRef.current?.click()}
                  disabled={isPhotoUploading || !publicUserId}
                  title="Change photo"
                  aria-label="Change photo"
                >
                  {isPhotoUploading ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Edit2 className="h-3.5 w-3.5" />
                  )}
                </Button>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="account-profile-name">Name</Label>
              <Input
                id="account-profile-name"
                value={draftName}
                onChange={(event) => setDraftName(event.target.value)}
                disabled={isSaving || !publicUserId}
                placeholder="Your name"
              />
            </div>

            <div className="flex justify-end">
              <Button
                size="sm"
                onClick={() => void handleSaveName()}
                disabled={isSaving || !isDirty || !draftName.trim() || !publicUserId}
              >
                {isSaving ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Saving...
                  </>
                ) : (
                  "Save"
                )}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
