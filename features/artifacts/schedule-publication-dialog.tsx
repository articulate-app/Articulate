"use client"

import { useMemo, useState } from "react"
import { Loader2 } from "lucide-react"
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../../app/components/ui/dialog"
import { Button } from "../../app/components/ui/button"
import { Input } from "../../app/components/ui/input"
import { Label } from "../../app/components/ui/label"
import { startPublication } from "../../app/lib/services/agentic-publishing"
import { openBrowserTabForPublication } from "./open-browser-tab-for-publication"
import { toast } from "../../app/components/ui/use-toast"

function pad(n: number) {
  return String(n).padStart(2, "0")
}

function defaultLocalParts(timeZone: string): { date: string; time: string } {
  const now = new Date(Date.now() + 60 * 60 * 1000)
  try {
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).formatToParts(now)
    const get = (type: string) => parts.find((p) => p.type === type)?.value ?? ""
    return {
      date: `${get("year")}-${get("month")}-${get("day")}`,
      time: `${get("hour")}:${get("minute")}`,
    }
  } catch {
    return {
      date: `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`,
      time: `${pad(now.getHours())}:${pad(now.getMinutes())}`,
    }
  }
}

/** Build an ISO timestamptz from local date/time interpreted in the given IANA zone. */
export function localDateTimeToIso(date: string, time: string, timeZone: string): string | null {
  if (!date || !time) return null
  const rough = new Date(`${date}T${time}:00`)
  if (Number.isNaN(rough.getTime())) return null
  try {
    const formatter = new Intl.DateTimeFormat("en-US", {
      timeZone,
      timeZoneName: "shortOffset",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
    })
    const tip = formatter.formatToParts(rough)
    const tzName = tip.find((p) => p.type === "timeZoneName")?.value ?? "GMT"
    const match = tzName.match(/GMT([+-]\d{1,2})(?::?(\d{2}))?/)
    let offsetMinutes = 0
    if (match) {
      const hours = Number(match[1])
      const mins = Number(match[2] ?? "0")
      offsetMinutes = hours * 60 + Math.sign(hours || 1) * mins
      if (Object.is(hours, -0) || String(match[1]).startsWith("-")) {
        offsetMinutes = -Math.abs(Number(match[1])) * 60 - mins
      } else {
        offsetMinutes = Number(match[1]) * 60 + mins
      }
    }
    // Treat date/time as wall clock in zone: UTC = wall - offset
    const asUtc = Date.UTC(
      Number(date.slice(0, 4)),
      Number(date.slice(5, 7)) - 1,
      Number(date.slice(8, 10)),
      Number(time.slice(0, 2)),
      Number(time.slice(3, 5)),
      0,
    )
    const instant = new Date(asUtc - offsetMinutes * 60_000)
    return Number.isNaN(instant.getTime()) ? null : instant.toISOString()
  } catch {
    return rough.toISOString()
  }
}

export function SchedulePublicationDialog(props: {
  open: boolean
  onOpenChange: (open: boolean) => void
  artifactId: string
  destinationId: string
  destinationName: string
  projectId?: number | null
  defaultTimezone?: string | null
}) {
  const timezone = props.defaultTimezone?.trim() || "Europe/Lisbon"
  const defaults = useMemo(() => defaultLocalParts(timezone), [timezone])
  const [date, setDate] = useState(defaults.date)
  const [time, setTime] = useState(defaults.time)
  const [isSubmitting, setIsSubmitting] = useState(false)

  const previewIso = localDateTimeToIso(date, time, timezone)

  const submit = async () => {
    const scheduledAt = localDateTimeToIso(date, time, timezone)
    if (!scheduledAt) {
      toast({ title: "Invalid date/time", variant: "destructive" })
      return
    }
    setIsSubmitting(true)
    try {
      const result = await startPublication({
        artifactId: props.artifactId,
        destinationId: props.destinationId,
        publishMode: "scheduled",
        scheduledAt,
        timezone,
      })
      const run = result.run
      if (run?.status === "scheduled") {
        toast({
          title: "Scheduled",
          description: `${props.destinationName} · ${run.scheduled_at_display ?? scheduledAt}`,
        })
      } else if (run?.id) {
        openBrowserTabForPublication({
          publicationRunId: run.id,
          liveViewUrl: result.live_view_url ?? run.live_view_url,
          destinationId: props.destinationId,
          destinationName: props.destinationName,
          artifactId: props.artifactId,
          activate: true,
          phase: run.status,
        })
      }
      props.onOpenChange(false)
    } catch (error) {
      toast({
        title: "Could not schedule publication",
        description: error instanceof Error ? error.message : "Try again",
        variant: "destructive",
      })
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Schedule publication</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-1">
          <div className="space-y-1">
            <Label>Destination</Label>
            <p className="text-sm text-gray-800">{props.destinationName}</p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="schedule-date">Date</Label>
            <Input
              id="schedule-date"
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="schedule-time">Time</Label>
            <Input
              id="schedule-time"
              type="time"
              value={time}
              onChange={(e) => setTime(e.target.value)}
            />
          </div>
          <div className="space-y-1">
            <Label>Timezone</Label>
            <p className="text-sm text-gray-700">{timezone}</p>
            {previewIso ? (
              <p className="text-[11px] text-gray-500">UTC: {previewIso}</p>
            ) : null}
          </div>
        </div>
        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => props.onOpenChange(false)}
            disabled={isSubmitting}
          >
            Cancel
          </Button>
          <Button type="button" onClick={() => void submit()} disabled={isSubmitting}>
            {isSubmitting ? <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" /> : null}
            Schedule
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
