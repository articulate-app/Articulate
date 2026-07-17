export function shouldSyncMentionOnComposerClick(args: {
  isMentionPickerOpen: boolean
  isRemoveChipClick: boolean
}): boolean {
  if (args.isRemoveChipClick) return true
  return args.isMentionPickerOpen
}
