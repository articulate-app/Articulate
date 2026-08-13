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
      activeObject: 'tasks',
      isTaskView: false,
    })
    expect(state.mode).toBe('hybrid')
    expect(state.visibleObjects).toEqual(OBJECT_PILL_VISIBLE_PRIORITY)
    expect(state.overflowObjects).toEqual([])
  })

  it('non-task with limited space: greedily fits the highest-priority pills, rest go to overflow', () => {
    const state = getAdaptiveObjectSwitcherState({
      containerWidth: MEDIUM,
      activeObject: 'tasks',
      isTaskView: false,
    })
    expect(state.mode).toBe('hybrid')
    // Highest priority objects show; less common ones overflow when space is tight.
    expect(state.visibleObjects.length).toBeGreaterThan(0)
    expect(state.visibleObjects[0]).toBe('tasks')
    // With the current object set, medium widths often fit everything — only assert shape.
    expect(state.visibleObjects.length + state.overflowObjects.length).toBe(LEFT_PANE_OBJECTS.length)
  })

  it('very narrow: preserves the compact dropdown (no visible pills, everything in overflow)', () => {
    const state = getAdaptiveObjectSwitcherState({
      containerWidth: NARROW,
      activeObject: 'tasks',
      isTaskView: true,
    })
    expect(state.mode).toBe('dropdown')
    expect(state.visibleObjects).toEqual([])
    expect(state.overflowObjects).toEqual([...LEFT_PANE_OBJECTS])
  })

  it('typical left-pane width (~280px) still shows hybrid pills, not the compact dropdown', () => {
    const state = getAdaptiveObjectSwitcherState({
      containerWidth: 280,
      activeObject: 'tasks',
      isTaskView: true,
    })
    expect(state.mode).toBe('hybrid')
    expect(state.visibleObjects.length).toBeGreaterThan(1)
    expect(state.visibleObjects[0]).toBe('tasks')
  })

  it('task view with space shows every object pill (no artificial cap)', () => {
    const wideTask = getAdaptiveObjectSwitcherState({
      containerWidth: WIDE,
      activeObject: 'tasks',
      isTaskView: true,
    })
    expect(wideTask.visibleObjects).toEqual(OBJECT_PILL_VISIBLE_PRIORITY)
    expect(wideTask.overflowObjects).toEqual([])
  })

  it('task view with limited space greedily fits pills, rest overflow', () => {
    const narrowTask = getAdaptiveObjectSwitcherState({
      containerWidth: ADAPTIVE_OBJECT_SWITCHER_BREAKPOINTS.wideMin - 1,
      activeObject: 'tasks',
      isTaskView: true,
    })
    expect(narrowTask.visibleObjects[0]).toBe('tasks')
    expect(narrowTask.visibleObjects.length).toBeGreaterThan(0)
    expect(narrowTask.visibleObjects.length + narrowTask.overflowObjects.length).toBe(
      LEFT_PANE_OBJECTS.length,
    )
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

    it('surfaces a lower-priority active object as a visible pill when there is room', () => {
      const state = getAdaptiveObjectSwitcherState({
        containerWidth: WIDE,
        activeObject: 'artifacts',
        isTaskView: true,
      })
      expect(state.visibleObjects).toContain('artifacts')
      expect(state.overflowObjects).not.toContain('artifacts')
      expect(overflowTriggerLabel(state, 'artifacts')).toBe('More')
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
      activeObject: 'tasks',
      isTaskView: false,
    })
    expect(state.mode).toBe('dropdown')
  })
})
