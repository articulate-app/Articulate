# Calendar Scroll Bug Analysis

## Issue Summary
Calendar scrolling up stops working after some rebases, particularly after the initial load.

## Root Cause Analysis

### The Rebase System
The calendar uses an "infinite scroll" pattern with a "rebase" mechanism:
- Shows 12 weeks at a time
- When scrolling near top (< 240px) or bottom (< 240px remaining), it loads 4 more weeks
- After loading, it adjusts `scrollTop` to maintain visual continuity

### The Bug: Armed/Disarmed State Problem

**Key Code Locations:**
- Line 267: `topRebaseArmedRef.current = true` (initial state)
- Line 480: `if (scrollTop > topRelease) topRebaseArmedRef.current = true` (re-arm condition)
- Line 482: `const shouldPrepend = scrollingUp && topRebaseArmedRef.current && scrollTop < topTrigger`
- Line 506: `topRebaseArmedRef.current = false` (disarm on rebase)

**The Problem Flow:**

1. **Initial Load:**
   - Calendar loads and anchors to "today" (line 1327-1352)
   - `topRebaseArmedRef` is `true`
   - Scrolling up works initially

2. **First Upward Scroll:**
   - User scrolls up, `scrollTop` becomes < 240px
   - `shouldPrepend` is `true` (line 482)
   - Rebase executes, `topRebaseArmedRef` set to `false` (line 506)
   - New weeks prepended, scroll position adjusted

3. **After Rebase:**
   - New scroll position is calculated (line 428-440)
   - If new `scrollTop` < 480px (the `topRelease` threshold), the flag stays `false`
   - User tries to scroll up again
   - `shouldPrepend` is now `false` because `topRebaseArmedRef.current` is `false`
   - **No more upward rebasing happens!**

### Additional Issues

**Cooldown After Anchoring (lines 465-468):**
```typescript
if (Date.now() - anchorSettledAtRef.current < 800) {
  lastScrollTopRef.current = el.scrollTop
  return
}
```
- For 800ms after initial anchor, all scroll events are ignored
- This might make the calendar feel unresponsive on first load

**Rebase Lock Issues (lines 453-463):**
```typescript
if (isRebasingScrollRef.current) {
  const rebaseAge = Date.now() - rebaseStartedAtRef.current
  if (rebaseStartedAtRef.current > 0 && rebaseAge > 1000) {
    isRebasingScrollRef.current = false
    // ...
  } else {
    return
  }
}
```
- During a rebase (which takes 2 animation frames), scroll events are blocked
- If a rebase gets stuck, there's a 1000ms timeout to force-clear it

## Reproducible Symptoms

1. **On initial load:** Scrolling up works once
2. **After first rebase:** If the resulting scroll position is < 480px from top, scrolling up stops working
3. **Scrolling down:** Usually continues to work because the scroll position is typically > 480px after rebases
4. **Console logs:** With `DEBUG_CALENDAR_SCROLL=true`, you'd see:
   - `topArmed: false` after first upward rebase
   - `shouldPrepend: false` on subsequent upward scrolls

## Proposed Solutions

### Option 1: Adjust Re-arm Thresholds
Change the re-arm threshold to be more lenient:

```typescript
// Line 476-477: Reduce topRelease threshold
const topTrigger = 240
const topRelease = 300  // Was 480, now closer to trigger
```

**Pros:** Simple fix, minimal code change
**Cons:** Might cause more frequent rebases

### Option 2: Re-arm Immediately After Rebase Settles
In the `rebaseByWeeks` function, after the scroll position is set:

```typescript
// After line 442
nextRoot.scrollTop = nextScrollTop
lastScrollTopRef.current = nextScrollTop
// Add these lines:
if (direction === -1) {
  topRebaseArmedRef.current = true
} else {
  bottomRebaseArmedRef.current = true
}
isRebasingScrollRef.current = false
```

**Pros:** Ensures rebasing can continue immediately
**Cons:** Might cause rapid consecutive rebases if user scrolls aggressively

### Option 3: Dynamic Re-arm Based on Available Scroll Space
Check if there's enough scroll space after a rebase:

```typescript
// After line 442
nextRoot.scrollTop = nextScrollTop
lastScrollTopRef.current = nextScrollTop
// Check if we have enough space to scroll further
const hasTopSpace = nextScrollTop > 100
const hasBottomSpace = (nextRoot.scrollHeight - nextRoot.clientHeight - nextScrollTop) > 100
if (direction === -1 && hasTopSpace) {
  topRebaseArmedRef.current = true
} else if (direction === 1 && hasBottomSpace) {
  bottomRebaseArmedRef.current = true
}
isRebasingScrollRef.current = false
```

**Pros:** Intelligent re-arming based on actual scroll space
**Cons:** More complex logic

### Option 4: Remove Armed/Disarmed System Entirely
Replace with a simple time-based cooldown:

```typescript
const lastTopRebaseRef = useRef(0)
const lastBottomRebaseRef = useRef(0)

// In handleCalendarScroll:
const now = Date.now()
const shouldPrepend = scrollingUp && scrollTop < topTrigger && (now - lastTopRebaseRef.current > 500)
const shouldAppend = scrollingDown && remainingBottom < bottomTrigger && (now - lastBottomRebaseRef.current > 500)

if (shouldPrepend) {
  lastTopRebaseRef.current = now
  rebaseByWeeks(-1, 4)
}
```

**Pros:** Simpler logic, more predictable behavior
**Cons:** Might not prevent rapid consecutive rebases as effectively

## Recommended Fix

**Option 2** (Re-arm immediately after rebase settles) is the most straightforward fix that addresses the core issue without over-complicating the logic.

## Testing Checklist

After implementing the fix:
1. ✅ Load calendar, scroll up immediately - should work
2. ✅ After first upward rebase, continue scrolling up - should continue to work
3. ✅ Scroll down, then up again - should work in both directions
4. ✅ Rapid scrolling in both directions - should not cause visual glitches
5. ✅ Check console for any rebase lock warnings
6. ✅ Verify scroll position stays stable during rebases (no jumps)

## Element Details

**Scrolling Container:**
- Element: `<div ref={calendarContainerRef}>`
- Classes: `h-full p-4 md:p-0 overflow-y-auto overscroll-contain`
- Lines: 1838-1851 (desktop), 1556-1569 (mobile)

**Scroll Event Handler:**
- Function: `handleCalendarScroll`
- Lines: 448-518
- Attached: Line 1840 (desktop), 1558 (mobile)

**Refs Involved:**
- `calendarContainerRef`: The scrolling container
- `isRebasingScrollRef`: Lock during rebase
- `topRebaseArmedRef`: Controls upward rebasing
- `bottomRebaseArmedRef`: Controls downward rebasing
- `lastScrollTopRef`: Tracks previous scroll position
- `anchorSettledAtRef`: Timestamp of initial anchor

## Console Errors Expected

With `DEBUG_CALENDAR_SCROLL=true`, you should see:
- `[Calendar][SCROLL_STATE]` logs showing `topArmed: false` after first rebase
- Potentially `[Calendar][SCROLL] force-cleared stale rebase lock` if rebases get stuck
