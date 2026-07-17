import { describe, it, expect } from 'vitest'
import {
  applyTaskListDefaultGroupingMode,
  buildGroupingSearchParams,
  isUngroupedTaskMode,
  parseActiveGroupByFromParam,
} from '../app/lib/tasks-grouping-url'

const GROUPED_URL =
  'layout=right&centerTaskId=13113&rightView=ai&taskAiOpen=true&aiThreadId=abc-123&object=task&mode=grouped&groupBy=delivery_date&groupOrder=desc&assignedTo=40&overdueStatus=overdue'

describe('buildGroupingSearchParams: Group by > No group', () => {
  it('removes groupBy + groupOrder and sets mode=list (ungrouped view)', () => {
    const next = buildGroupingSearchParams(new URLSearchParams(GROUPED_URL), null)
    expect(next.get('groupBy')).toBeNull()
    expect(next.get('groupOrder')).toBeNull()
    expect(next.get('mode')).toBe('list')
  })

  it("treats the 'none' sentinel like No group", () => {
    const next = buildGroupingSearchParams(new URLSearchParams(GROUPED_URL), 'none')
    expect(next.get('groupBy')).toBeNull()
    expect(next.get('mode')).toBe('list')
  })

  it('preserves layout / center+right pane / object and active filters', () => {
    const next = buildGroupingSearchParams(new URLSearchParams(GROUPED_URL), null)
    expect(next.get('layout')).toBe('right')
    expect(next.get('centerTaskId')).toBe('13113')
    expect(next.get('rightView')).toBe('ai')
    expect(next.get('taskAiOpen')).toBe('true')
    expect(next.get('aiThreadId')).toBe('abc-123')
    expect(next.get('object')).toBe('task')
    // Filters use camelCase keys and must survive the switch to ungrouped mode.
    expect(next.get('assignedTo')).toBe('40')
    expect(next.get('overdueStatus')).toBe('overdue')
  })

  it('selecting a grouped option restores grouped mode + canonical order', () => {
    const ungrouped = 'layout=right&object=task&mode=list&assignedTo=40'
    const next = buildGroupingSearchParams(new URLSearchParams(ungrouped), 'delivery_date')
    expect(next.get('mode')).toBe('grouped')
    expect(next.get('groupBy')).toBe('delivery_date')
    expect(next.get('groupOrder')).toBe('desc')
    expect(next.get('assignedTo')).toBe('40')
  })

  it('non-date group-by uses asc as the canonical order', () => {
    const next = buildGroupingSearchParams(new URLSearchParams('object=task'), 'status')
    expect(next.get('groupBy')).toBe('status')
    expect(next.get('groupOrder')).toBe('asc')
  })

  it('round-trips grouped -> No group -> grouped without leaking groupBy', () => {
    const toUngrouped = buildGroupingSearchParams(new URLSearchParams(GROUPED_URL), null)
    expect(parseActiveGroupByFromParam(toUngrouped.get('groupBy'))).toBeNull()
    const backToGrouped = buildGroupingSearchParams(toUngrouped, 'delivery_date')
    expect(backToGrouped.get('groupBy')).toBe('delivery_date')
    expect(backToGrouped.get('mode')).toBe('grouped')
  })
})

describe('applyTaskListDefaultGroupingMode: first-load normalization', () => {
  it('seeds grouped default only when no mode is present (first load)', () => {
    const sp = new URLSearchParams('object=task')
    const changed = applyTaskListDefaultGroupingMode(sp)
    expect(changed).toBe(true)
    expect(sp.get('mode')).toBe('grouped')
    expect(sp.get('groupBy')).toBe('delivery_date')
    expect(sp.get('groupOrder')).toBe('desc')
  })

  it('does NOT re-group an explicit mode=list (no normalization loop)', () => {
    const sp = new URLSearchParams('object=task&mode=list')
    const changed = applyTaskListDefaultGroupingMode(sp)
    expect(changed).toBe(false)
    expect(sp.get('groupBy')).toBeNull()
    expect(sp.get('groupOrder')).toBeNull()
    expect(sp.get('mode')).toBe('list')
  })

  it('does NOT re-group an explicit mode=ungrouped', () => {
    const sp = new URLSearchParams('object=task&mode=ungrouped')
    expect(applyTaskListDefaultGroupingMode(sp)).toBe(false)
    expect(sp.get('groupBy')).toBeNull()
  })

  it('leaves an already-grouped URL untouched (idempotent, no flicker)', () => {
    const sp = new URLSearchParams('object=task&mode=grouped&groupBy=delivery_date&groupOrder=desc')
    expect(applyTaskListDefaultGroupingMode(sp)).toBe(false)
  })

  it('fills only the missing groupOrder when grouped without an order', () => {
    const sp = new URLSearchParams('object=task&mode=grouped&groupBy=status')
    const changed = applyTaskListDefaultGroupingMode(sp)
    expect(changed).toBe(true)
    // groupBy already set, so the seeded default groupBy must not override it.
    expect(sp.get('groupBy')).toBe('status')
    expect(sp.get('groupOrder')).toBe('desc')
  })
})

describe('isUngroupedTaskMode', () => {
  it('recognizes list/ungrouped and nothing else', () => {
    expect(isUngroupedTaskMode('list')).toBe(true)
    expect(isUngroupedTaskMode('ungrouped')).toBe(true)
    expect(isUngroupedTaskMode('grouped')).toBe(false)
    expect(isUngroupedTaskMode(null)).toBe(false)
  })
})
