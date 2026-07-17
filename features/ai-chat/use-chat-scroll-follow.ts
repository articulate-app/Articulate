"use client"

import { useCallback, useEffect, useRef, useState, type RefObject } from "react"

export const CHAT_NEAR_BOTTOM_THRESHOLD_PX = 80
export const CHAT_SCROLL_THROTTLE_MS = 300
// A small top padding so a submitted user message is anchored at the top of the
// viewport (not buried mid-scroll) while the assistant reply streams below it.
export const CHAT_USER_MESSAGE_SCROLL_OFFSET_PX = 16

export function computeDistanceFromBottom(element: HTMLElement): number {
  return element.scrollHeight - element.scrollTop - element.clientHeight
}

export function isNearChatBottom(
  element: HTMLElement,
  threshold = CHAT_NEAR_BOTTOM_THRESHOLD_PX,
): boolean {
  return computeDistanceFromBottom(element) <= threshold
}

export type ScrollUserMessageIntoComfortViewOptions = {
  behavior?: ScrollBehavior
  offsetFromTop?: number
}

/** Anchors a user message near the top edge so the assistant reply streams below it. */
export function scrollUserMessageIntoComfortView(
  messageElement: HTMLElement,
  container: HTMLElement,
  options: ScrollUserMessageIntoComfortViewOptions = {},
): void {
  const { behavior = "smooth", offsetFromTop = CHAT_USER_MESSAGE_SCROLL_OFFSET_PX } = options
  const containerRect = container.getBoundingClientRect()
  const elementRect = messageElement.getBoundingClientRect()
  const currentScrollTop = container.scrollTop
  const elementTopWithinContainer =
    elementRect.top - containerRect.top + currentScrollTop

  container.scrollTo({
    top: Math.max(0, elementTopWithinContainer - offsetFromTop),
    behavior,
  })
}

type UseChatScrollFollowOptions = {
  scrollContainerRef: RefObject<HTMLElement | null>
  nearBottomThreshold?: number
  scrollThrottleMs?: number
}

export function useChatScrollFollow({
  scrollContainerRef,
  nearBottomThreshold = CHAT_NEAR_BOTTOM_THRESHOLD_PX,
  scrollThrottleMs = CHAT_SCROLL_THROTTLE_MS,
}: UseChatScrollFollowOptions) {
  const [following, setFollowing] = useState(true)
  const [showJumpToBottom, setShowJumpToBottom] = useState(false)

  const followingRef = useRef(true)
  const lastScrollAtRef = useRef(0)
  const trailingScrollTimerRef = useRef<number | null>(null)
  const scrollRafRef = useRef<number | null>(null)

  const syncFollowFromScroll = useCallback(() => {
    const container = scrollContainerRef.current
    if (!container) return

    const nearBottom = isNearChatBottom(container, nearBottomThreshold)
    followingRef.current = nearBottom
    setFollowing(nearBottom)
    if (nearBottom) {
      setShowJumpToBottom(false)
    }
  }, [nearBottomThreshold, scrollContainerRef])

  const scrollContainerToBottom = useCallback(
    (behavior: ScrollBehavior) => {
      const container = scrollContainerRef.current
      if (!container) return
      container.scrollTo({ top: container.scrollHeight, behavior })
    },
    [scrollContainerRef],
  )

  const clearScheduledScroll = useCallback(() => {
    if (scrollRafRef.current != null) {
      cancelAnimationFrame(scrollRafRef.current)
      scrollRafRef.current = null
    }
    if (trailingScrollTimerRef.current != null) {
      window.clearTimeout(trailingScrollTimerRef.current)
      trailingScrollTimerRef.current = null
    }
  }, [])

  const jumpToBottom = useCallback(() => {
    clearScheduledScroll()
    followingRef.current = true
    setFollowing(true)
    setShowJumpToBottom(false)
    scrollContainerToBottom("smooth")
    lastScrollAtRef.current = performance.now()
  }, [clearScheduledScroll, scrollContainerToBottom])

  const scrollUserMessageIntoView = useCallback(
    (messageElement: HTMLElement | null, behavior: ScrollBehavior = "smooth") => {
      const container = scrollContainerRef.current
      if (!container || !messageElement) return
      clearScheduledScroll()
      scrollUserMessageIntoComfortView(messageElement, container, { behavior })
      window.requestAnimationFrame(() => {
        syncFollowFromScroll()
      })
    },
    [clearScheduledScroll, scrollContainerRef, syncFollowFromScroll],
  )

  const scrollToBottomOnce = useCallback(
    (behavior: ScrollBehavior = "smooth") => {
      clearScheduledScroll()
      scrollContainerToBottom(behavior)
      window.requestAnimationFrame(() => {
        syncFollowFromScroll()
      })
    },
    [clearScheduledScroll, scrollContainerToBottom, syncFollowFromScroll],
  )

  const notifyContentGrowth = useCallback(() => {
    const container = scrollContainerRef.current
    if (!container) return

    if (!followingRef.current) {
      setShowJumpToBottom(true)
      return
    }

    const now = performance.now()
    const elapsed = now - lastScrollAtRef.current

    const performScroll = () => {
      if (!followingRef.current) {
        setShowJumpToBottom(true)
        return
      }
      scrollContainerToBottom("auto")
      lastScrollAtRef.current = performance.now()
      trailingScrollTimerRef.current = null
      scrollRafRef.current = null
    }

    if (elapsed >= scrollThrottleMs) {
      clearScheduledScroll()
      scrollRafRef.current = window.requestAnimationFrame(performScroll)
      return
    }

    if (trailingScrollTimerRef.current == null) {
      trailingScrollTimerRef.current = window.setTimeout(() => {
        performScroll()
      }, scrollThrottleMs - elapsed)
    }
  }, [clearScheduledScroll, scrollContainerRef, scrollContainerToBottom, scrollThrottleMs])

  useEffect(() => {
    const container = scrollContainerRef.current
    if (!container) return

    const onScroll = () => {
      syncFollowFromScroll()
    }

    container.addEventListener("scroll", onScroll, { passive: true })
    syncFollowFromScroll()

    return () => {
      container.removeEventListener("scroll", onScroll)
    }
  }, [scrollContainerRef, syncFollowFromScroll])

  const markNewContentBelow = useCallback(() => {
    const container = scrollContainerRef.current
    if (!container) return

    if (isNearChatBottom(container, nearBottomThreshold)) {
      setShowJumpToBottom(false)
      return
    }

    followingRef.current = false
    setFollowing(false)
    setShowJumpToBottom(true)
  }, [nearBottomThreshold, scrollContainerRef])

  useEffect(() => clearScheduledScroll, [clearScheduledScroll])

  return {
    following,
    showJumpToBottom,
    scrollToBottomOnce,
    scrollUserMessageIntoView,
    notifyContentGrowth,
    markNewContentBelow,
    jumpToBottom,
    syncFollowFromScroll,
  }
}
