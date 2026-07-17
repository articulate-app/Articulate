import { describe, expect, it, vi } from "vitest"
import {
  CHAT_NEAR_BOTTOM_THRESHOLD_PX,
  CHAT_USER_MESSAGE_SCROLL_OFFSET_PX,
  computeDistanceFromBottom,
  isNearChatBottom,
  scrollUserMessageIntoComfortView,
} from "../features/ai-chat/use-chat-scroll-follow"

describe("useChatScrollFollow helpers", () => {
  it("computes distance from bottom", () => {
    const element = {
      scrollHeight: 1000,
      scrollTop: 800,
      clientHeight: 150,
    } as HTMLElement

    expect(computeDistanceFromBottom(element)).toBe(50)
    expect(isNearChatBottom(element, CHAT_NEAR_BOTTOM_THRESHOLD_PX)).toBe(true)
  })

  it("treats scroll-up as not following", () => {
    const element = {
      scrollHeight: 1000,
      scrollTop: 500,
      clientHeight: 150,
    } as HTMLElement

    expect(computeDistanceFromBottom(element)).toBe(350)
    expect(isNearChatBottom(element, CHAT_NEAR_BOTTOM_THRESHOLD_PX)).toBe(false)
  })

  it("scrolls a user message into a comfortable viewport position", () => {
    const scrollTo = vi.fn()
    const container = {
      scrollTop: 200,
      getBoundingClientRect: () => ({ top: 100 }),
      scrollTo,
    } as unknown as HTMLElement
    const messageElement = {
      getBoundingClientRect: () => ({ top: 420 }),
    } as unknown as HTMLElement

    scrollUserMessageIntoComfortView(messageElement, container, {
      behavior: "smooth",
      offsetFromTop: CHAT_USER_MESSAGE_SCROLL_OFFSET_PX,
    })

    expect(scrollTo).toHaveBeenCalledWith({
      top: 400,
      behavior: "smooth",
    })
  })
})
