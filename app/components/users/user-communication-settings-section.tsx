"use client"

import { useCallback } from "react"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { BarChart3, FileText, Lightbulb, Loader2, Mail } from "lucide-react"

import { Switch } from "../ui/switch"
import { toast } from "../ui/use-toast"
import {
  getUserProfile,
  updateUserPreferences,
  type UserProfile,
} from "../../lib/services/users"

type PreferenceField = keyof Pick<
  UserProfile,
  "send_invoices" | "send_content" | "send_inspiration" | "send_reports"
>

type UserCommunicationSettingsSectionProps = {
  userId: number
}

const PREFERENCE_ROWS: Array<{
  field: PreferenceField
  label: string
  description: string
  icon: typeof Mail
}> = [
  {
    field: "send_invoices",
    label: "Invoices",
    description: "Receive invoice notifications",
    icon: Mail,
  },
  {
    field: "send_content",
    label: "Content",
    description: "Receive content updates",
    icon: FileText,
  },
  {
    field: "send_inspiration",
    label: "Inspiration",
    description: "Receive inspiration emails",
    icon: Lightbulb,
  },
  {
    field: "send_reports",
    label: "Reports",
    description: "Receive report summaries",
    icon: BarChart3,
  },
]

export function UserCommunicationSettingsSection({
  userId,
}: UserCommunicationSettingsSectionProps) {
  const queryClient = useQueryClient()

  const { data: profile, isLoading } = useQuery({
    queryKey: ["user-profile", userId],
    queryFn: async () => {
      const result = await getUserProfile(userId)
      if (result.error) throw result.error
      return result.data
    },
  })

  const handlePreferenceToggle = useCallback(
    async (field: PreferenceField, value: boolean) => {
      if (!profile) return

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
        queryClient.setQueryData(["user-profile", userId], profile)
        toast({
          title: "Error",
          description: err?.message || "Failed to update preference",
          variant: "destructive",
        })
      }
    },
    [profile, queryClient, userId],
  )

  if (isLoading || !profile) {
    return (
      <div className="flex items-center justify-center py-12 text-sm text-gray-500">
        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
        Loading...
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-sm font-medium text-gray-900">Communication</h3>
        <p className="mt-0.5 text-xs text-gray-500">
          Choose which email notifications this user receives.
        </p>
      </div>

      <div>
        {PREFERENCE_ROWS.map(({ field, label, description, icon: Icon }) => (
          <div
            key={field}
            className="flex items-center justify-between gap-3 border-b border-gray-100 py-3 last:border-b-0"
          >
            <div className="flex min-w-0 items-center gap-3">
              <Icon className="h-4 w-4 shrink-0 text-gray-400" />
              <div className="min-w-0">
                <div className="text-sm font-medium text-gray-900">{label}</div>
                <div className="text-sm text-gray-500">{description}</div>
              </div>
            </div>
            <Switch
              checked={Boolean(profile[field])}
              onCheckedChange={(checked) => void handlePreferenceToggle(field, checked)}
            />
          </div>
        ))}
      </div>
    </div>
  )
}
