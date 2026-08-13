import { describe, expect, it } from "vitest"
import {
  formatScheduledAtForDisplay,
  isScheduleDue,
  isScheduleStale,
  normalizeIanaTimezone,
  parsePublishMode,
  parseScheduledAt,
} from "../supabase/functions/_shared/publishing/scheduling"
import { canTransitionPublicationStatus } from "../supabase/functions/_shared/publishing/state-machine"

describe("publication scheduling helpers", () => {
  it("parses publish mode and scheduled instants", () => {
    expect(parsePublishMode("scheduled")).toBe("scheduled")
    expect(parsePublishMode("now")).toBe("now")
    const at = parseScheduledAt("2026-08-12T09:30:00.000Z")
    expect(at?.toISOString()).toBe("2026-08-12T09:30:00.000Z")
  })

  it("normalizes IANA timezones and formats display", () => {
    expect(normalizeIanaTimezone("Europe/Lisbon")).toBe("Europe/Lisbon")
    expect(normalizeIanaTimezone("not-a-zone", "UTC")).toBe("UTC")
    const label = formatScheduledAtForDisplay("2026-08-12T09:30:00.000Z", "UTC")
    expect(label).toMatch(/12/)
    expect(label).toMatch(/2026/)
  })

  it("detects due and stale schedules", () => {
    const past = new Date(Date.now() - 5 * 60_000).toISOString()
    const ancient = new Date(Date.now() - 48 * 60 * 60_000).toISOString()
    expect(isScheduleDue(past)).toBe(true)
    expect(isScheduleStale(ancient, 24)).toBe(true)
    expect(isScheduleStale(past, 24)).toBe(false)
  })

  it("allows scheduled → queued claim transition", () => {
    expect(canTransitionPublicationStatus("scheduled", "queued")).toBe(true)
    expect(canTransitionPublicationStatus("scheduled", "cancelled")).toBe(true)
    expect(canTransitionPublicationStatus("awaiting_publish_confirmation", "scheduled")).toBe(true)
  })
})
