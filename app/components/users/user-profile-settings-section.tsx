"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { Loader2 } from "lucide-react"

import { Button } from "../ui/button"
import { Input } from "../ui/input"
import { Label } from "../ui/label"
import { toast } from "../ui/use-toast"
import { UserAvatar } from "../UserAvatar"
import { PUBLIC_MEDIA_BUCKET, getImageUrl, uploadImage } from "../../lib/public-media"
import {
  getUserProfile,
  updateUserPhoto,
  updateUserProfile,
  type UserProfile,
} from "../../lib/services/users"

type UserProfileSettingsSectionProps = {
  userId: number
  onDirtyChange?: (dirty: boolean) => void
}

function normalizeBrand(value: unknown): string {
  const raw = String(value ?? "").trim()
  if (!raw) return "#000000"
  return raw.startsWith("#") ? raw : `#${raw}`
}

export function UserProfileSettingsSection({
  userId,
  onDirtyChange,
}: UserProfileSettingsSectionProps) {
  const queryClient = useQueryClient()
  const photoInputRef = useRef<HTMLInputElement | null>(null)
  const [fullName, setFullName] = useState("")
  const [brand, setBrand] = useState("#000000")
  const [isSaving, setIsSaving] = useState(false)
  const [isPhotoUploading, setIsPhotoUploading] = useState(false)

  const { data: profile, isLoading, error } = useQuery({
    queryKey: ["user-profile", userId],
    queryFn: async () => {
      const result = await getUserProfile(userId)
      if (result.error) throw result.error
      return result.data
    },
  })

  useEffect(() => {
    if (!profile) return
    setFullName(profile.full_name || "")
    setBrand(normalizeBrand(profile.brand))
  }, [profile])

  const isDirty = useMemo(() => {
    if (!profile) return false
    const nameChanged = fullName.trim() !== (profile.full_name || "").trim()
    const brandChanged = normalizeBrand(brand) !== normalizeBrand(profile.brand)
    return nameChanged || brandChanged
  }, [brand, fullName, profile])

  useEffect(() => {
    onDirtyChange?.(isDirty)
  }, [isDirty, onDirtyChange])

  const handleSave = useCallback(async () => {
    if (!profile || isSaving) return
    const trimmedName = fullName.trim()
    if (!trimmedName) {
      toast({
        title: "Error",
        description: "Name is required",
        variant: "destructive",
      })
      return
    }

    setIsSaving(true)
    try {
      const nextBrand = normalizeBrand(brand)
      const { error: updateError } = await updateUserProfile(userId, {
        full_name: trimmedName,
        brand: nextBrand,
      })
      if (updateError) throw updateError

      queryClient.setQueryData(["user-profile", userId], (prev: UserProfile | null | undefined) =>
        prev ? { ...prev, full_name: trimmedName, brand: nextBrand } : prev,
      )
      queryClient.invalidateQueries({ queryKey: ["user-profile", userId] })
      toast({
        title: "Saved",
        description: "Profile updated successfully",
      })
    } catch (err: any) {
      toast({
        title: "Error",
        description: err?.message || "Failed to update profile",
        variant: "destructive",
      })
    } finally {
      setIsSaving(false)
    }
  }, [brand, fullName, isSaving, profile, queryClient, userId])

  const handlePhotoUpload = useCallback(
    async (file: File) => {
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

        queryClient.setQueryData(["user-profile", userId], (prev: UserProfile | null | undefined) =>
          prev ? { ...prev, photo: storagePath } : prev,
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
    },
    [queryClient, userId],
  )

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12 text-sm text-gray-500">
        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
        Loading...
      </div>
    )
  }

  if (error || !profile) {
    return (
      <div className="py-12 text-center text-sm text-red-500">Failed to load user profile.</div>
    )
  }

  const photoUrl = getImageUrl(profile.photo)

  return (
    <div className="space-y-5">
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
            onChange={(e) => {
              const file = e.target.files?.[0]
              if (file) void handlePhotoUpload(file)
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
            {isPhotoUploading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Change photo
          </Button>
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="user-settings-full-name">Full name</Label>
        <Input
          id="user-settings-full-name"
          value={fullName}
          onChange={(e) => setFullName(e.target.value)}
          disabled={isSaving}
          placeholder="Enter full name"
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="user-settings-brand">Color</Label>
        <div className="flex items-center gap-3">
          <input
            id="user-settings-brand"
            type="color"
            value={normalizeBrand(brand)}
            onChange={(e) => setBrand(e.target.value)}
            disabled={isSaving}
            className="h-9 w-16 rounded border border-gray-200 bg-white p-1"
          />
          <Input
            value={normalizeBrand(brand)}
            onChange={(e) => setBrand(e.target.value)}
            disabled={isSaving}
            placeholder="#000000"
            className="max-w-[9rem] font-mono text-sm uppercase"
          />
        </div>
      </div>

      <div className="flex justify-end border-t border-gray-100 pt-4">
        <Button
          size="sm"
          onClick={() => void handleSave()}
          disabled={isSaving || !isDirty || !fullName.trim()}
        >
          {isSaving ? "Saving..." : "Save changes"}
        </Button>
      </div>
    </div>
  )
}
