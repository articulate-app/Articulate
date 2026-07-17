import { describe, expect, it } from "vitest"
import { shouldSyncMentionOnComposerClick } from "../features/ai-chat/composer-mention-guards"

describe("shouldSyncMentionOnComposerClick", () => {
  it("does not sync mention state for plain composer focus click", () => {
    const shouldSync = shouldSyncMentionOnComposerClick({
      isMentionPickerOpen: false,
      isRemoveChipClick: false,
    })
    expect(shouldSync).toBe(false)
  })

  it("keeps mention sync enabled while picker is open", () => {
    const shouldSync = shouldSyncMentionOnComposerClick({
      isMentionPickerOpen: true,
      isRemoveChipClick: false,
    })
    expect(shouldSync).toBe(true)
  })
})
