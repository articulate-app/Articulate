import { describe, it, expect } from 'vitest'
import {
  buildFilterSearchParams,
  buildSeeMoreTasksSearchParams,
  type TaskFiltersForUrl,
} from '../app/lib/tasks-filter-url'

/**
 * Regression: User Overview "See more" must write task-list filter params (assignedTo + overdueStatus
 * / delivery date range) into the URL WITHOUT clobbering the selected user / right-pane state, so the
 * left task list (which reads these params) can react.
 *
 * See `UserDetailsPageTabs` handleSeeMoreOverview* handlers + `unified-grouped-task-list` urlFilters.
 */
const EMPTY: TaskFiltersForUrl = {
  assignedTo: [],
  status: [],
  deliveryDate: {},
  publicationDate: {},
  project: [],
  contentType: [],
  productionType: [],
  language: [],
  channels: [],
  overdueStatus: [],
}

// Mirrors the live URL captured in the bug report (right pane + workspace object state).
const RIGHT_PANE_PARAMS =
  'layout=right&rightView=thread-chat&taskAiOpen=true&aiThreadId=20748fee-d2d4-41df-b71c-63a5228fd949&object=project&rightUserId=40'

describe('User Overview "See more" → task list filter URL', () => {
  it('delivery overdue: sets assignedTo + overdueStatus=delivery_overdue and preserves right pane', () => {
    const base = new URLSearchParams(RIGHT_PANE_PARAMS)
    const next = buildFilterSearchParams(base, {
      ...EMPTY,
      assignedTo: ['40'],
      overdueStatus: ['delivery_overdue'],
    })

    expect(next.get('assignedTo')).toBe('40')
    expect(next.get('overdueStatus')).toBe('delivery_overdue')

    // Right pane / workspace state must survive (requirements #5/#6).
    expect(next.get('layout')).toBe('right')
    expect(next.get('rightView')).toBe('thread-chat')
    expect(next.get('taskAiOpen')).toBe('true')
    expect(next.get('aiThreadId')).toBe('20748fee-d2d4-41df-b71c-63a5228fd949')
    expect(next.get('object')).toBe('project')
    expect(next.get('rightUserId')).toBe('40')
  })

  it('publication overdue: sets assignedTo + overdueStatus=publication_overdue', () => {
    const base = new URLSearchParams(RIGHT_PANE_PARAMS)
    const next = buildFilterSearchParams(base, {
      ...EMPTY,
      assignedTo: ['40'],
      overdueStatus: ['publication_overdue'],
    })

    expect(next.get('assignedTo')).toBe('40')
    expect(next.get('overdueStatus')).toBe('publication_overdue')
    expect(next.get('rightUserId')).toBe('40')
  })

  it('upcoming: sets assignedTo + a delivery date range and no overdueStatus', () => {
    const base = new URLSearchParams(RIGHT_PANE_PARAMS)
    const from = new Date('2026-06-05T00:00:00.000Z')
    const to = new Date('2026-06-13T00:00:00.000Z')
    const next = buildFilterSearchParams(base, {
      ...EMPTY,
      assignedTo: ['40'],
      deliveryDate: { from, to },
    })

    expect(next.get('assignedTo')).toBe('40')
    expect(next.get('overdueStatus')).toBeNull()
    expect(next.get('deliveryDateFrom')).toBe('2026-06-05')
    expect(next.get('deliveryDateTo')).toBe('2026-06-13')
  })

  it('forces left/main list to Tasks + grouped defaults when on another object (Projects)', () => {
    const base = new URLSearchParams(
      'layout=right&rightView=thread-chat&rightUserId=10&taskAiOpen=true&aiThreadId=abc&object=project',
    )
    const next = buildSeeMoreTasksSearchParams(base, {
      ...EMPTY,
      assignedTo: ['10'],
      overdueStatus: ['delivery_overdue'],
    })

    // Left/main list switched to Tasks + grouped list mode.
    expect(next.get('object')).toBe('task')
    expect(next.get('mode')).toBe('grouped')
    expect(next.get('groupBy')).toBe('delivery_date')
    expect(next.get('groupOrder')).toBe('desc')

    // Filters applied.
    expect(next.get('assignedTo')).toBe('10')
    expect(next.get('overdueStatus')).toBe('delivery_overdue')

    // Right pane preserved (the user warned not to clobber right/center detail).
    expect(next.get('layout')).toBe('right')
    expect(next.get('rightView')).toBe('thread-chat')
    expect(next.get('rightUserId')).toBe('10')
    expect(next.get('taskAiOpen')).toBe('true')
    expect(next.get('aiThreadId')).toBe('abc')
  })

  it('respects an intentionally chosen grouping instead of forcing defaults', () => {
    const base = new URLSearchParams('object=task&mode=grouped&groupBy=status&groupOrder=asc')
    const next = buildSeeMoreTasksSearchParams(base, {
      ...EMPTY,
      assignedTo: ['10'],
      overdueStatus: ['publication_overdue'],
    })

    expect(next.get('object')).toBe('task')
    expect(next.get('groupBy')).toBe('status')
    expect(next.get('groupOrder')).toBe('asc')
    expect(next.get('mode')).toBe('grouped')
    expect(next.get('overdueStatus')).toBe('publication_overdue')
  })

  it('clearing filters removes assignedTo + overdueStatus while keeping right pane', () => {
    const withFilters = buildFilterSearchParams(new URLSearchParams(RIGHT_PANE_PARAMS), {
      ...EMPTY,
      assignedTo: ['40'],
      overdueStatus: ['delivery_overdue'],
    })

    const reset = buildFilterSearchParams(withFilters, EMPTY)

    expect(reset.get('assignedTo')).toBeNull()
    expect(reset.get('overdueStatus')).toBeNull()
    expect(reset.get('deliveryDateFrom')).toBeNull()
    // Right pane untouched after reset.
    expect(reset.get('layout')).toBe('right')
    expect(reset.get('rightUserId')).toBe('40')
    expect(reset.get('aiThreadId')).toBe('20748fee-d2d4-41df-b71c-63a5228fd949')
  })
})
