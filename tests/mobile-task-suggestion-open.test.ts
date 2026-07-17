import { describe, it, expect } from 'vitest'
import {
  clearActiveCenterSelectionParams,
  getActiveCenterSelection,
} from '../app/lib/center-pane-selection-url'

/**
 * Mirrors TasksLayout `handleMobileTaskSelect`: clear all conflicting center/detail selection params,
 * then set the one matching the clicked item. List/filter params are preserved. (Mobile does not add
 * desktop-only layout/rightView params.)
 */
function mobileSelect(base: URLSearchParams, item: { kind: 'task' | 'suggestion'; id: number }): URLSearchParams {
  const next = new URLSearchParams(base.toString())
  clearActiveCenterSelectionParams(next)
  if (item.kind === 'suggestion') {
    next.set('itemKind', 'suggestion')
    next.set('centerSuggestionId', String(item.id))
    next.delete('stackTeamId')
  } else {
    next.set('id', String(item.id))
  }
  next.delete('focusOutputs')
  return next
}

/** Mirrors TasksLayout `handleMobileTaskDetailBack`: clear the whole center selection. */
function mobileBack(base: URLSearchParams): URLSearchParams {
  const next = new URLSearchParams(base.toString())
  clearActiveCenterSelectionParams(next)
  return next
}

/** Whether the mobile detail view should be open for a given URL (URL-derived visibility). */
function isMobileDetailOpen(sp: URLSearchParams): boolean {
  return getActiveCenterSelection(sp) != null
}

const LIST_URL = 'object=task&mode=grouped&groupBy=delivery_date&groupOrder=desc'

const LIST_PARAMS_PRESERVED = (sp: URLSearchParams) => {
  expect(sp.get('object')).toBe('task')
  expect(sp.get('mode')).toBe('grouped')
  expect(sp.get('groupBy')).toBe('delivery_date')
  expect(sp.get('groupOrder')).toBe('desc')
}

describe('getActiveCenterSelection', () => {
  it('treats itemKind=suggestion + centerSuggestionId as a first-class selection (no layout/rightView needed)', () => {
    const sp = new URLSearchParams(`${LIST_URL}&itemKind=suggestion&centerSuggestionId=2147`)
    expect(getActiveCenterSelection(sp)).toEqual({ type: 'task-suggestion', id: '2147' })
  })

  it('resolves task / user / project center selections', () => {
    expect(getActiveCenterSelection(new URLSearchParams('centerTaskId=13063'))).toEqual({ type: 'task', id: '13063' })
    expect(getActiveCenterSelection(new URLSearchParams('centerUserId=40'))).toEqual({ type: 'user', id: '40' })
    expect(getActiveCenterSelection(new URLSearchParams('centerProjectId=7'))).toEqual({ type: 'project', id: '7' })
  })

  it('suggestion takes precedence over a stale centerTaskId/centerUserId', () => {
    const sp = new URLSearchParams('itemKind=suggestion&centerSuggestionId=2147&centerTaskId=999&centerUserId=40')
    expect(getActiveCenterSelection(sp)).toEqual({ type: 'task-suggestion', id: '2147' })
  })

  it('returns null when nothing is selected, and ignores empty values', () => {
    expect(getActiveCenterSelection(new URLSearchParams(LIST_URL))).toBeNull()
    expect(getActiveCenterSelection(new URLSearchParams('itemKind=suggestion&centerSuggestionId='))).toBeNull()
  })
})

describe('Mobile suggestion click → open detail', () => {
  it('A. clicking a suggestion sets suggestion params and opens detail, preserving list state', () => {
    const next = mobileSelect(new URLSearchParams(LIST_URL), { kind: 'suggestion', id: 2147 })
    expect(next.get('itemKind')).toBe('suggestion')
    expect(next.get('centerSuggestionId')).toBe('2147')
    LIST_PARAMS_PRESERVED(next)
    // No competing center params introduced.
    expect(next.get('centerTaskId')).toBeNull()
    expect(next.get('centerUserId')).toBeNull()
    expect(next.get('centerProjectId')).toBeNull()
    expect(next.get('id')).toBeNull()
    // Mobile does not require desktop-only params.
    expect(next.get('layout')).toBeNull()
    expect(next.get('rightView')).toBeNull()
    // Detail view is open.
    expect(isMobileDetailOpen(next)).toBe(true)
    expect(getActiveCenterSelection(next)?.type).toBe('task-suggestion')
  })

  it('B. direct mobile suggestion URL load reports detail open immediately', () => {
    const sp = new URLSearchParams(`${LIST_URL}&itemKind=suggestion&centerSuggestionId=2147`)
    expect(isMobileDetailOpen(sp)).toBe(true)
    expect(getActiveCenterSelection(sp)).toEqual({ type: 'task-suggestion', id: '2147' })
  })

  it('C. mobile back clears suggestion params and restores the list', () => {
    const detail = mobileSelect(new URLSearchParams(LIST_URL), { kind: 'suggestion', id: 2147 })
    const back = mobileBack(detail)
    expect(back.get('itemKind')).toBeNull()
    expect(back.get('centerSuggestionId')).toBeNull()
    LIST_PARAMS_PRESERVED(back)
    expect(isMobileDetailOpen(back)).toBe(false)
  })

  it('D. normal mobile task click still opens task detail (via id), no suggestion params', () => {
    const next = mobileSelect(new URLSearchParams(LIST_URL), { kind: 'task', id: 555 })
    expect(next.get('id')).toBe('555')
    expect(next.get('itemKind')).toBeNull()
    expect(next.get('centerSuggestionId')).toBeNull()
    LIST_PARAMS_PRESERVED(next)
  })

  it('switching from a task to a suggestion clears the previous task selection', () => {
    const taskDetail = mobileSelect(new URLSearchParams(LIST_URL), { kind: 'task', id: 555 })
    const suggestionDetail = mobileSelect(taskDetail, { kind: 'suggestion', id: 2147 })
    expect(suggestionDetail.get('id')).toBeNull()
    expect(suggestionDetail.get('centerTaskId')).toBeNull()
    expect(suggestionDetail.get('itemKind')).toBe('suggestion')
    expect(suggestionDetail.get('centerSuggestionId')).toBe('2147')
  })
})

describe('clearActiveCenterSelectionParams', () => {
  it('removes every center/detail selection param but keeps list/filter params', () => {
    const sp = new URLSearchParams(
      `${LIST_URL}&itemKind=suggestion&centerSuggestionId=2147&centerTaskId=1&centerUserId=2&centerProjectId=3&centerTeamId=4&centerThreadId=5&centerTab=overview&rightTaskId=6&id=7`,
    )
    clearActiveCenterSelectionParams(sp)
    for (const key of [
      'itemKind',
      'centerSuggestionId',
      'centerTaskId',
      'centerUserId',
      'centerProjectId',
      'centerTeamId',
      'centerThreadId',
      'centerTab',
      'rightTaskId',
      'id',
    ]) {
      expect(sp.get(key)).toBeNull()
    }
    LIST_PARAMS_PRESERVED(sp)
  })
})
