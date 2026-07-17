import { describe, it, expect } from 'vitest'
import {
  ADAPTIVE_OBJECT_SWITCHER_BREAKPOINTS,
  LEFT_PANE_OBJECTS,
  OBJECT_PILL_VISIBLE_PRIORITY,
  getAdaptiveObjectSwitcherState,
  leftPaneObjectLabel,
  type LeftPaneObject,
} from '../app/lib/left-pane-object'

const WIDE = ADAPTIVE_OBJECT_SWITCHER_BREAKPOINTS.wideMin + 40 // generous: every pill fits
const MEDIUM = ADAPTIVE_OBJECT_SWITCHER_BREAKPOINTS.compactMax + 20 // between compact and wide
const NARROW = ADAPTIVE_OBJECT_SWITCHER_BREAKPOINTS.compactMax - 20 // below compact threshold

/** Mirrors the overflow-trigger label logic in LeftObjectSwitcher. */
function overflowTriggerLabel(state: ReturnType<typeof getAdaptiveObjectSwitcherState>, active: LeftPaneObject) {
  return state.overflowObjects.includes(active) ? leftPaneObjectLabel(active) : 'More'
}

describe('getAdaptiveObjectSwitcherState', () => {
  it('wide, non-task: exposes all object pills directly (no overflow needed)', () => {
    const state = getAdaptiveObjectSwitcherState({
      containerWidth: WIDE,
      activeObject: 'all',
      isTaskView: false,
    })
    expect(state.mode).toBe('hybrid')
    expect(state.visibleObjects).toEqual(OBJECT_PILL_VISIBLE_PRIORITY)
    expect(state.overflowObjects).toEqual([])
  })

  it('non-task with limited space: greedily fits the highest-priority pills, rest go to overflow', () => {
    const state = getAdaptiveObjectSwitcherState({
      containerWidth: MEDIUM,
      activeObject: 'all',
      isTaskView: false,
    })
    expect(state.mode).toBe('hybrid')
    // Highest priority objects show; less common ones (mentions/users/teams/ai_chats) overflow.
    expect(state.visibleObjects.length).toBeGreaterThan(0)
    expect(state.visibleObjects[0]).toBe('all')
    expect(state.overflowObjects.length).toBeGreaterThan(0)
  })

  it('narrow: preserves the compact dropdown (no visible pills, everything in overflow)', () => {
    const state = getAdaptiveObjectSwitcherState({
      containerWidth: NARROW,
      activeObject: 'tasks',
      isTaskView: true,
    })
    expect(state.mode).toBe('dropdown')
    expect(state.visibleObjects).toEqual([])
    expect(state.overflowObjects).toEqual([...LEFT_PANE_OBJECTS])
  })

  it('task view stays lean: at most 3 object pills even when wide, protecting task controls', () => {
    const wideTask = getAdaptiveObjectSwitcherState({
      containerWidth: WIDE,
      activeObject: 'tasks',
      isTaskView: true,
    })
    expect(wideTask.visibleObjects).toEqual(['all', 'tasks', 'projects'])
    // The remaining objects stay reachable via overflow rather than crowding task controls.
    expect(wideTask.overflowObjects).toContain('users')
    expect(wideTask.overflowObjects).toContain('teams')
  })

  it('task view narrower than wideMin shows only the two leanest pills', () => {
    const narrowTask = getAdaptiveObjectSwitcherState({
      containerWidth: ADAPTIVE_OBJECT_SWITCHER_BREAKPOINTS.wideMin - 1,
      activeObject: 'tasks',
      isTaskView: true,
    })
    expect(narrowTask.visibleObjects).toEqual(['all', 'tasks'])
    expect(narrowTask.overflowObjects).toContain('projects')
  })

  describe('the active object is always represented', () => {
    it('surfaces an off-priority active object as a visible pill when wide & non-task', () => {
      const state = getAdaptiveObjectSwitcherState({
        containerWidth: WIDE,
        activeObject: 'users',
        isTaskView: false,
      })
      expect(state.visibleObjects).toContain('users')
      expect(state.overflowObjects).not.toContain('users')
    })

    it('leaves an off-priority active object in overflow when space is limited, but indicates it on the trigger', () => {
      const state = getAdaptiveObjectSwitcherState({
        containerWidth: MEDIUM,
        activeObject: 'users',
        isTaskView: false,
      })
      expect(state.visibleObjects).not.toContain('users')
      expect(state.overflowObjects).toContain('users')
      // Overflow trigger reflects the selected object instead of the generic "More".
      expect(overflowTriggerLabel(state, 'users')).toBe('Users')
    })

    it('never loses or duplicates an object across visible + overflow', () => {
      const widths = [NARROW, MEDIUM, WIDE, 360, 420, 600, 900]
      for (const activeObject of LEFT_PANE_OBJECTS) {
        for (const isTaskView of [false, true]) {
          for (const containerWidth of widths) {
            const state = getAdaptiveObjectSwitcherState({ containerWidth, activeObject, isTaskView })
            const combined = [...state.visibleObjects, ...state.overflowObjects].sort()
            // Every object stays selectable exactly once (same keys -> same URL/query behavior).
            expect(combined).toEqual([...LEFT_PANE_OBJECTS].sort())
            // The active object is always either a visible pill or in overflow.
            expect(
              state.visibleObjects.includes(activeObject) || state.overflowObjects.includes(activeObject),
            ).toBe(true)
          }
        }
      }
    })
  })

  it('treats a non-finite width as compact (safe fallback, no flicker before measurement)', () => {
    const state = getAdaptiveObjectSwitcherState({
      containerWidth: Number.NaN,
      activeObject: 'all',
      isTaskView: false,
    })
    expect(state.mode).toBe('dropdown')
  })
})
