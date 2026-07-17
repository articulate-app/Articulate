export const CALENDAR_WEEKDAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const

export function toLocalDayKey(input: Date | string | null | undefined): string | null {
  if (!input) return null

  if (typeof input === 'string') {
    const parsed = parseLocalDayKey(input)
    if (parsed) return formatLocalDayKey(parsed)

    const fallback = new Date(input)
    if (Number.isNaN(fallback.getTime())) return null
    return formatLocalDayKey(fallback)
  }

  if (Number.isNaN(input.getTime())) return null
  return formatLocalDayKey(input)
}

export function parseLocalDayKey(dayKey: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(dayKey)
  if (!match) return null

  const year = Number.parseInt(match[1], 10)
  const month = Number.parseInt(match[2], 10)
  const day = Number.parseInt(match[3], 10)
  if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) return null

  const date = new Date(year, month - 1, day, 12, 0, 0, 0)
  if (Number.isNaN(date.getTime())) return null
  return date
}

export function formatLocalDayKey(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

export function addDaysLocal(date: Date, days: number): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + days, 12, 0, 0, 0)
}

export function addWeeksFromDayKey(weekStartDayKey: string, weeks: number): string {
  const parsed = parseLocalDayKey(weekStartDayKey)
  if (!parsed) return weekStartDayKey
  return formatLocalDayKey(addDaysLocal(parsed, weeks * 7))
}

export function startOfWeekSunday(input: Date): Date {
  const day = input.getDay()
  return new Date(input.getFullYear(), input.getMonth(), input.getDate() - day, 12, 0, 0, 0)
}

export function getWeekStartDayKey(input: Date | string): string {
  const base = typeof input === 'string' ? parseLocalDayKey(input) : input
  if (!base || Number.isNaN(base.getTime())) {
    const fallback = startOfWeekSunday(new Date())
    return formatLocalDayKey(fallback)
  }
  return formatLocalDayKey(startOfWeekSunday(base))
}

export function getWeekDays(weekStartDayKey: string): string[] {
  const weekStart = parseLocalDayKey(weekStartDayKey)
  if (!weekStart) return []
  return Array.from({ length: 7 }, (_, dayOffset) => {
    return formatLocalDayKey(addDaysLocal(weekStart, dayOffset))
  })
}

export function getMonthStartWeekDayKey(input: Date): string {
  const monthStart = new Date(input.getFullYear(), input.getMonth(), 1, 12, 0, 0, 0)
  return getWeekStartDayKey(monthStart)
}

export function isSameMonth(dayKey: string, month: Date): boolean {
  const day = parseLocalDayKey(dayKey)
  if (!day) return false
  return day.getFullYear() === month.getFullYear() && day.getMonth() === month.getMonth()
}

export function getMonthLabelFromWeekStart(weekStartDayKey: string): Date {
  const parsed = parseLocalDayKey(weekStartDayKey)
  if (!parsed) return new Date()
  return new Date(parsed.getFullYear(), parsed.getMonth(), 1, 12, 0, 0, 0)
}
