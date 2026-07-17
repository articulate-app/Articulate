import { describe, it, expect } from 'vitest'

/**
 * Regression: clicking a Team card in the User Overview must STACK the team detail over the existing
 * user detail. The user stays in the URL as back-history (selectedDetailTarget) and the team becomes
 * the active middle target via `stackTeamId`. The middle pane renders ONLY the team (TeamDetailsPage)
 * with a back chevron (onStackBack -> handleTeamStackBack) that clears `stackTeamId` to return to the
 * user. All other params (right pane / AI, left task filters) are preserved untouched.
 *
 * Mirrors TasksLayout `handleOpenTeamKeepingDetailContext`, which only adds `stackTeamId`.
 */
function openTeamFromUserOverview(base: URLSearchParams, teamId: number): URLSearchParams {
  const next = new URLSearchParams(base.toString())
  next.set('stackTeamId', String(teamId))
  return next
}

/** Mirrors TasksLayout `handleTeamStackBack`. */
function teamStackBack(base: URLSearchParams): URLSearchParams {
  const next = new URLSearchParams(base.toString())
  next.delete('stackTeamId')
  return next
}

describe('User Overview → Team card click URL', () => {
  // Mirrors the bug report URL: user open in center, AI pane open, task filters applied.
  const START =
    'layout=right&centerUserId=40&rightView=ai&taskAiOpen=true&aiThreadId=20748fee-d2d4-41df-b71c-63a5228fd949&object=task&mode=grouped&groupBy=delivery_date&groupOrder=desc&assignedTo=40&overdueStatus=delivery_overdue'

  it('stacks the team over the user (user preserved as back-history)', () => {
    const next = openTeamFromUserOverview(new URLSearchParams(START), 22)

    // Team becomes the active stacked middle target.
    expect(next.get('stackTeamId')).toBe('22')
    // Previous user detail target stays for back navigation.
    expect(next.get('centerUserId')).toBe('40')
  })

  it('back chevron clears the stacked team and returns to the user', () => {
    const stacked = openTeamFromUserOverview(new URLSearchParams(START), 22)
    const back = teamStackBack(stacked)

    expect(back.get('stackTeamId')).toBeNull()
    expect(back.get('centerUserId')).toBe('40')
  })

  it('preserves right pane / AI params', () => {
    const next = openTeamFromUserOverview(new URLSearchParams(START), 22)

    expect(next.get('layout')).toBe('right')
    expect(next.get('rightView')).toBe('ai')
    expect(next.get('taskAiOpen')).toBe('true')
    expect(next.get('aiThreadId')).toBe('20748fee-d2d4-41df-b71c-63a5228fd949')
    expect(next.get('object')).toBe('task')
  })

  it('preserves left task-list filters', () => {
    const next = openTeamFromUserOverview(new URLSearchParams(START), 22)

    expect(next.get('mode')).toBe('grouped')
    expect(next.get('groupBy')).toBe('delivery_date')
    expect(next.get('groupOrder')).toBe('desc')
    expect(next.get('assignedTo')).toBe('40')
    expect(next.get('overdueStatus')).toBe('delivery_overdue')
  })
})
