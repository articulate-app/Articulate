import { describe, it, expect } from 'vitest'
import { buildSectionSwitchUrl, leftObjectToSectionKey } from '../app/lib/section-switch-url'
import { resolveLeftPaneObject } from '../app/lib/left-pane-object'

/**
 * Mirrors TasksLayout `navigateToLeftObject`: build the next section URL from the current params.
 * The `object` query param is the source of truth, so on mobile the content renderer branches on the
 * resolved left-pane object (tasks vs. projects/users/mentions/ai-chats).
 */
function switchObject(currentUrl: string, targetSection: ReturnType<typeof leftObjectToSectionKey>): {
  url: string
  params: URLSearchParams
  pathname: string
} {
  const url = buildSectionSwitchUrl(targetSection, new URLSearchParams(currentUrl))
  const [pathname, query = ''] = url.split('?')
  return { url, params: new URLSearchParams(query), pathname }
}

const TASK_LIST_URL =
  'object=task&mode=grouped&groupBy=delivery_date&groupOrder=desc&assignedTo=40&centerTaskId=999&id=999&itemKind=suggestion&centerSuggestionId=2147'

describe('Mobile object pill switching', () => {
  it('tasks -> projects: object becomes project and the content resolver reports projects', () => {
    const { params, pathname } = switchObject(TASK_LIST_URL, leftObjectToSectionKey('projects'))
    expect(params.get('object')).toBe('project')
    expect(resolveLeftPaneObject(params, pathname)).toBe('projects')
  })

  it('tasks -> projects: task-only list + selection params are dropped (no stale task state)', () => {
    const { params } = switchObject(TASK_LIST_URL, leftObjectToSectionKey('projects'))
    for (const key of [
      'mode',
      'groupBy',
      'groupOrder',
      'assignedTo',
      'centerTaskId',
      'rightTaskId',
      'centerSuggestionId',
      'itemKind',
      'id',
    ]) {
      expect(params.get(key)).toBeNull()
    }
  })

  it('projects -> tasks: object becomes task and the content resolver reports tasks', () => {
    const { params, pathname } = switchObject('object=project', leftObjectToSectionKey('tasks'))
    expect(params.get('object')).toBe('task')
    expect(resolveLeftPaneObject(params, pathname)).toBe('tasks')
  })

  it('round-trips across every object (URL is the single source of truth)', () => {
    const objects = ['tasks', 'projects', 'users', 'mentions', 'ai_chats'] as const
    for (const object of objects) {
      const { params, pathname } = switchObject(TASK_LIST_URL, leftObjectToSectionKey(object))
      expect(resolveLeftPaneObject(params, pathname)).toBe(object)
    }
  })

  it('legacy homepage ("all") resolves to tasks', () => {
    const { params, pathname } = switchObject(TASK_LIST_URL, leftObjectToSectionKey('all'))
    expect(resolveLeftPaneObject(params, pathname)).toBe('tasks')
  })
})
