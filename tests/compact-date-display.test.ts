import { describe, it, expect } from 'vitest'
import { formatCompactDateDisplay, formatDateDisplay } from '../app/lib/utils'

describe('formatCompactDateDisplay', () => {
  it('renders current-year dates as dd/mmm', () => {
    const year = new Date().getFullYear()
    expect(formatCompactDateDisplay(`${year}-06-08`)).toBe('08/Jun')
    expect(formatCompactDateDisplay(`${year}-07-21`)).toBe('21/Jul')
    // Day is zero-padded.
    expect(formatCompactDateDisplay(`${year}-01-05`)).toBe('05/Jan')
  })

  it('falls back to the standard dd/mm/yyyy format for other years', () => {
    const otherYear = new Date().getFullYear() - 3
    const iso = `${otherYear}-06-08`
    expect(formatCompactDateDisplay(iso)).toBe(formatDateDisplay(iso))
    expect(formatCompactDateDisplay(iso)).toContain(String(otherYear))
  })

  it('returns empty string for null/undefined/invalid dates', () => {
    expect(formatCompactDateDisplay(null)).toBe('')
    expect(formatCompactDateDisplay(undefined)).toBe('')
    expect(formatCompactDateDisplay('not-a-date')).toBe('')
  })
})
