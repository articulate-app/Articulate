"use client"

import { useEffect, useState } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { Loader2 } from "lucide-react"

import { Button } from "../ui/button"
import { Input } from "../ui/input"
import { Label } from "../ui/label"
import { toast } from "../ui/use-toast"
import {
  DEFAULT_DAILY_CAPACITY_HOURS,
  getActiveUserWorkloadSetting,
  parseDailyCapacityInput,
  upsertCurrentDailyCapacity,
} from "../../lib/services/user-workload-settings"

type UserCapacitySettingsSectionProps = {
  userId: number
}

export function UserCapacitySettingsSection({ userId }: UserCapacitySettingsSectionProps) {
  const queryClient = useQueryClient()
  const numericUserId = Number(userId)

  const { data: activeWorkloadSetting, isLoading } = useQuery({
    queryKey: ["user-workload-setting", numericUserId],
    queryFn: () => getActiveUserWorkloadSetting(numericUserId),
    enabled: Number.isFinite(numericUserId),
  })

  const currentDailyCapacity =
    activeWorkloadSetting?.daily_capacity_hours ?? DEFAULT_DAILY_CAPACITY_HOURS
  const [capacityInput, setCapacityInput] = useState(String(currentDailyCapacity))

  useEffect(() => {
    setCapacityInput(String(currentDailyCapacity))
  }, [currentDailyCapacity])

  const capacityMutation = useMutation({
    mutationFn: (hours: number) => upsertCurrentDailyCapacity(numericUserId, hours),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["user-workload-setting", numericUserId] })
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

  const handleSave = () => {
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

  const isDirty = String(currentDailyCapacity) !== capacityInput.trim()

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12 text-sm text-gray-500">
        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
        Loading...
      </div>
    )
  }

  return (
    <div className="space-y-5">
      <div>
        <h3 className="text-sm font-medium text-gray-900">Daily capacity</h3>
        <p className="mt-0.5 text-xs text-gray-500">
          Hours available per working day used for occupation and backlog calculations.
        </p>
      </div>

      <div className="space-y-2">
        <Label htmlFor="user-settings-daily-capacity">Daily capacity (hours)</Label>
        <div className="flex items-center gap-2">
          <Input
            id="user-settings-daily-capacity"
            type="number"
            min="0"
            step="0.5"
            value={capacityInput}
            onChange={(e) => setCapacityInput(e.target.value)}
            disabled={capacityMutation.isPending}
            className="max-w-[8rem]"
          />
          <Button
            size="sm"
            onClick={handleSave}
            disabled={capacityMutation.isPending || !isDirty}
          >
            {capacityMutation.isPending ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : null}
            Save
          </Button>
        </div>
      </div>
    </div>
  )
}
