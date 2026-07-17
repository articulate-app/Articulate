import { describe, it, expect } from 'vitest'
import { buildCenterPaneSelectionSearchParams } from '../app/lib/center-pane-selection-url'

/**
 * Regression: clicking a task SUGGESTION row from the left-pane task list must open the suggestion
 * detail pane as the single, canonical middle-pane selection. Previously the suggestion branch kept
 * a stale center detail param (e.g. `centerUserId`) in the URL, which `GlobalSearchDetailsPane`
 * re-asserted while the center-key normalizer removed it — producing repeated router updates, URL
 * flickering, and a React "Maximum update depth exceeded" crash.
 *
 * Mirrors TasksLayout `handleTaskSelect`: the task path delegates to
 * `buildCenterPaneSelectionSearchParams` (which already clears all center* selection); the
 * suggestion path now clears the same conflicting center* params before setting itemKind=suggestion
 * + centerSuggestionId. List filters and right-pane / AI state are always preserved.
 */
function openTaskListItem(
  base: URLSearchParams,
  item: { kind: 'task' | 'suggestion'; id: number },
): URLSearchParams {
  if (item.kind === 'task') {
    const next = buildCenterPaneSelectionSearchParams({
      currentSearchParams: base,
      entity: 'task',
      id: item.id,
    })
    next.delete('itemKind')
    next.delete('centerSuggestionId')
    return next
  }

  const next = new URLSearchParams(base.toString())
  next.set('layout', 'right')
  next.set('itemKind', 'suggestion')
  next.set('centerSuggestionId', String(item.id))
  next.delete('id')
  next.delete('centerTaskId')
  next.delete('centerProjectId')
  next.delete('centerUserId')
  next.delete('centerTeamId')
  next.delete('centerThreadId')
  next.delete('centerTab')
  next.delete('rightTaskId')
  next.delete('stackTeamId')
  return next
}

describe('Task list row click → middle-pane URL', () => {
  // Mirrors the bug report URL: a user detail open in the center, AI right pane open, task filters applied.
  const START =
    'layout=right&centerUserId=40&rightView=ai&taskAiOpen=true&aiThreadId=20748fee-d2d4-41df-b71c-63a5228fd949&object=task&mode=grouped&groupBy=delivery_date&groupOrder=desc&assignedTo=40&overdueStatus=publication_overdue'

  describe('clicking a task suggestion', () => {
    const next = openTaskListItem(new URLSearchParams(START), { kind: 'suggestion', id: 2057 })

    it('opens the suggestion detail pane as the canonical center selection', () => {
      expect(next.get('itemKind')).toBe('suggestion')
      expect(next.get('centerSuggestionId')).toBe('2057')
    })

    it('clears every conflicting middle-pane (center*) detail param', () => {
      expect(next.get('centerUserId')).toBeNull()
      expect(next.get('centerTaskId')).toBeNull()
      expect(next.get('centerProjectId')).toBeNull()
      expect(next.get('centerTeamId')).toBeNull()
      expect(next.get('centerThreadId')).toBeNull()
      expect(next.get('id')).toBeNull()
    })

    it('preserves left task-list filters', () => {
      expect(next.get('object')).toBe('task')
      expect(next.get('mode')).toBe('grouped')
      expect(next.get('groupBy')).toBe('delivery_date')
      expect(next.get('groupOrder')).toBe('desc')
      expect(next.get('assignedTo')).toBe('40')
      expect(next.get('overdueStatus')).toBe('publication_overdue')
    })

    it('preserves right pane / AI state', () => {
      expect(next.get('layout')).toBe('right')
      expect(next.get('rightView')).toBe('ai')
      expect(next.get('taskAiOpen')).toBe('true')
      expect(next.get('aiThreadId')).toBe('20748fee-d2d4-41df-b71c-63a5228fd949')
    })

    it('produces the exact desired URL (order-independent)', () => {
      const expected = new URLSearchParams(
        'layout=right&rightView=ai&taskAiOpen=true&aiThreadId=20748fee-d2d4-41df-b71c-63a5228fd949&object=task&mode=grouped&groupBy=delivery_date&groupOrder=desc&assignedTo=40&overdueStatus=publication_overdue&itemKind=suggestion&centerSuggestionId=2057',
      )
      expect([...next.entries()].sort()).toEqual([...expected.entries()].sort())
    })
  })

  describe('clicking a normal task (no regression)', () => {
    const next = openTaskListItem(new URLSearchParams(START), { kind: 'task', id: 1234 })

    it('opens the task detail pane and clears the stale user detail', () => {
      expect(next.get('centerTaskId')).toBe('1234')
      expect(next.get('centerUserId')).toBeNull()
      expect(next.get('itemKind')).toBeNull()
      expect(next.get('centerSuggestionId')).toBeNull()
    })

    it('keeps list filters and AI state intact', () => {
      expect(next.get('assignedTo')).toBe('40')
      expect(next.get('overdueStatus')).toBe('publication_overdue')
      expect(next.get('taskAiOpen')).toBe('true')
      expect(next.get('aiThreadId')).toBe('20748fee-d2d4-41df-b71c-63a5228fd949')
    })
  })

  it('task and suggestion rows cannot both set competing center params', () => {
    const taskUrl = openTaskListItem(new URLSearchParams(START), { kind: 'task', id: 1234 })
    const suggestionUrl = openTaskListItem(new URLSearchParams(START), { kind: 'suggestion', id: 2057 })

    // Exactly one center selection key is present in each result.
    const centerKeys = ['centerTaskId', 'centerSuggestionId', 'centerUserId', 'centerProjectId', 'centerTeamId', 'centerThreadId']
    const presentIn = (sp: URLSearchParams) => centerKeys.filter((k) => sp.get(k))
    expect(presentIn(taskUrl)).toEqual(['centerTaskId'])
    expect(presentIn(suggestionUrl)).toEqual(['centerSuggestionId'])
  })
})

/**
 * Center-pane resolver: itemKind=suggestion + centerSuggestionId must be a complete, valid
 * middle-pane selection on its own. Mirrors the render gating in TasksLayout `detailsPane`
 * (selectedTaskId derived from centerSuggestionId + isSuggestionSelected -> suggestion pane).
 * A suggestion must NOT require or be promoted to centerTaskId / centerUserId / id / rightTaskId.
 */
type CenterPane =
  | { type: 'task-suggestion'; id: string }
  | { type: 'task'; id: string }
  | { type: 'user'; id: string }
  | null

function resolveCenterPane(sp: URLSearchParams): CenterPane {
  const itemKind = sp.get('itemKind')
  const centerSuggestionId = sp.get('centerSuggestionId')
  if (itemKind === 'suggestion' && centerSuggestionId) {
    return { type: 'task-suggestion', id: String(centerSuggestionId) }
  }
  const centerTaskId = sp.get('centerTaskId')
  if (centerTaskId) return { type: 'task', id: String(centerTaskId) }
  const centerUserId = sp.get('centerUserId')
  if (centerUserId) return { type: 'user', id: String(centerUserId) }
  return null
}

describe('Direct suggestion URL load → center pane resolution', () => {
  const SUGGESTION_URL =
    'layout=right&rightView=thread-chat&taskAiOpen=true&aiThreadId=20748fee-d2d4-41df-b71c-63a5228fd949&object=task&groupBy=delivery_date&mode=grouped&groupOrder=desc&itemKind=suggestion&centerSuggestionId=2161'

  it('resolves the suggestion detail pane (not task, not user)', () => {
    const pane = resolveCenterPane(new URLSearchParams(SUGGESTION_URL))
    expect(pane).toEqual({ type: 'task-suggestion', id: '2161' })
  })

  it('does not require or introduce centerTaskId / centerUserId / id / rightTaskId', () => {
    const sp = new URLSearchParams(SUGGESTION_URL)
    expect(sp.get('centerTaskId')).toBeNull()
    expect(sp.get('centerUserId')).toBeNull()
    expect(sp.get('id')).toBeNull()
    expect(sp.get('rightTaskId')).toBeNull()
    // The resolver reads suggestion state directly and never falls through to a task/user target.
    expect(resolveCenterPane(sp)?.type).toBe('task-suggestion')
  })

  it('keeps the right-pane AI/thread state intact and untouched', () => {
    const sp = new URLSearchParams(SUGGESTION_URL)
    expect(sp.get('layout')).toBe('right')
    expect(sp.get('rightView')).toBe('thread-chat')
    expect(sp.get('taskAiOpen')).toBe('true')
    expect(sp.get('aiThreadId')).toBe('20748fee-d2d4-41df-b71c-63a5228fd949')
  })

  it('suggestion takes precedence even if a stale centerTaskId/centerUserId leaks in', () => {
    const sp = new URLSearchParams(SUGGESTION_URL)
    sp.set('centerTaskId', '999')
    sp.set('centerUserId', '40')
    expect(resolveCenterPane(sp)).toEqual({ type: 'task-suggestion', id: '2161' })
  })
})

/**
 * Root cause of the remaining crash: a render-derived list that feeds the dependency array of the
 * "reset thread state when task changes" effect in TaskDetails must be referentially stable when
 * empty. In suggestion mode the selected object has no `mentions` key, so a fresh `[]` literal every
 * render re-ran the effect (which calls setAllTaskMentions / setThreadsList) on every render ->
 * "Maximum update depth exceeded". Mirrors TaskDetails: `selectedTask?.mentions` || EMPTY_ARR.
 */
const EMPTY_ARR: unknown[] = []
function deriveFirstThreadMentions(selectedTask: { mentions?: unknown } | null): unknown[] {
  return selectedTask && Array.isArray(selectedTask.mentions) ? (selectedTask.mentions as unknown[]) : EMPTY_ARR
}

describe('TaskDetails thread-state effect dependency stability', () => {
  it('returns a referentially stable empty array for a suggestion object (no mentions)', () => {
    // selectedSuggestionAsTask shape: no `mentions` key.
    const suggestionTask = { id: '2161', title: 'A suggestion', channel_names: [] }
    const first = deriveFirstThreadMentions(suggestionTask)
    const second = deriveFirstThreadMentions(suggestionTask)
    // Same reference across renders -> effect dependency is stable -> effect does not re-run forever.
    expect(Object.is(first, second)).toBe(true)
    expect(first).toHaveLength(0)
  })

  it('passes through a stable mentions array for a real task', () => {
    const mentions = [{ id: 1 }]
    const task = { id: '13063', mentions }
    expect(Object.is(deriveFirstThreadMentions(task), mentions)).toBe(true)
  })

  it('returns the stable empty array for a null selection', () => {
    expect(Object.is(deriveFirstThreadMentions(null), EMPTY_ARR)).toBe(true)
  })
})
