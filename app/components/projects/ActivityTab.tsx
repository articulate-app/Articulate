"use client"

import { useState, useEffect, useRef, useCallback } from "react"
import { useQuery } from "@tanstack/react-query"
import { Input } from "../ui/input"
import { Label } from "../ui/label"
import { Loader2 } from "lucide-react"
import { format } from "date-fns"
import {
  listActivity,
  type ProjectActivity,
} from "../../lib/services/projects-briefing"

interface ActivityTabProps {
  projectId: number
}

export function ActivityTab({ projectId }: ActivityTabProps) {
  const [activities, setActivities] = useState<ProjectActivity[]>([])
  const [offset, setOffset] = useState(0)
  const [hasMore, setHasMore] = useState(true)
  const [isLoading, setIsLoading] = useState(false)
  const [typeFilter, setTypeFilter] = useState<string>("")
  const [searchQuery, setSearchQuery] = useState<string>("")
  const scrollContainerRef = useRef<HTMLDivElement>(null)
  const sentinelRef = useRef<HTMLDivElement>(null)
  const limit = 50

  const fetchActivities = useCallback(async () => {
    if (isLoading || !hasMore) return

    setIsLoading(true)
    try {
      const { data, error } = await listActivity(projectId, limit, offset)

      if (error) {
        console.error("Error fetching activities:", error)
        return
      }

      if (data && Array.isArray(data)) {
        if (data.length < limit) {
          setHasMore(false)
        }
        setActivities((prev) => [...prev, ...data])
        setOffset((prev) => prev + data.length)
      } else {
        setHasMore(false)
      }
    } catch (err) {
      console.error("Error fetching activities:", err)
    } finally {
      setIsLoading(false)
    }
  }, [projectId, limit, offset, isLoading, hasMore])

  useEffect(() => {
    // Reset and fetch from beginning when filters change
    setActivities([])
    setOffset(0)
    setHasMore(true)
    setIsLoading(true)
  }, [typeFilter, searchQuery])

  useEffect(() => {
    if (offset === 0 && hasMore && !isLoading) {
      fetchActivities()
    }
  }, [offset, hasMore])

  // Intersection observer for infinite scroll
  useEffect(() => {
    if (!sentinelRef.current || !hasMore || isLoading) return

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting && hasMore && !isLoading) {
          fetchActivities()
        }
      },
      { root: scrollContainerRef.current, threshold: 0.1 }
    )

    observer.observe(sentinelRef.current)

    return () => {
      observer.disconnect()
    }
  }, [hasMore, isLoading, fetchActivities])

  const filteredActivities = activities.filter((activity) => {
    if (typeFilter && activity.type !== typeFilter) return false
    if (
      searchQuery &&
      !activity.details?.toLowerCase().includes(searchQuery.toLowerCase())
    )
      return false
    return true
  })

  // Get unique activity types for filter
  const activityTypes = Array.from(
    new Set(activities.map((a) => a.type).filter((type): type is string => type !== null))
  )

  return (
    <div>
      <div className="mb-6">
        <h2 className="text-xl font-semibold">Activity Log</h2>
      </div>
      {/* Filters */}
        <div className="mb-4 grid grid-cols-1 gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="type-filter">Filter by Type</Label>
            <select
              id="type-filter"
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value)}
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <option value="">All Types</option>
              {activityTypes.map((type) => (
                <option key={type} value={type}>
                  {type}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="search">Search in Details</Label>
            <Input
              id="search"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search activity details..."
            />
          </div>
        </div>

        {/* Activity List */}
        <div
          ref={scrollContainerRef}
          className="max-h-[600px] overflow-y-auto space-y-2"
        >
          {filteredActivities.length === 0 && !isLoading && (
            <div className="py-8 text-center text-gray-500">
              No activity found
            </div>
          )}

          {filteredActivities.map((activity) => (
            <div
              key={activity.id}
              className="rounded-lg border border-gray-200 p-4 hover:bg-gray-50"
            >
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="font-medium text-sm">
                      {`User ${activity.user_id}`}
                    </span>
                    {activity.type && (
                      <span className="text-xs px-2 py-0.5 rounded bg-gray-100 text-gray-600">
                        {activity.type}
                      </span>
                    )}
                  </div>
                  <div className="text-sm text-gray-700 mb-1">
                    {activity.action}
                  </div>
                  {activity.details && (
                    <div className="text-sm text-gray-600 mb-2">
                      {activity.details}
                    </div>
                  )}
                  {activity.task_id && (
                    <div className="text-xs text-blue-600">
                      Task #{activity.task_id}
                    </div>
                  )}
                  <div className="text-xs text-gray-400 mt-1">
                    {format(new Date(activity.timestamp), "PPp")}
                  </div>
                </div>
              </div>
            </div>
          ))}

          {/* Loading sentinel */}
          <div ref={sentinelRef} className="h-4" />
          {isLoading && (
            <div className="flex items-center justify-center py-4">
              <Loader2 className="w-5 h-5 animate-spin text-gray-400" />
            </div>
          )}
          {!hasMore && filteredActivities.length > 0 && (
            <div className="py-4 text-center text-xs text-gray-400">
              No more activities
            </div>
          )}
        </div>
    </div>
  )
}

