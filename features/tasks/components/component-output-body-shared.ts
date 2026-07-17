/** Shared layout tokens for TaskContentTab component output bodies. */
export const COMPONENT_OUTPUT_FONT_SIZE_PX = 16
export const COMPONENT_FIELD_EDIT_WRAPPER_CLASS =
  "component-card-focus-ring relative focus-within:z-[2] focus-within:border-transparent focus-within:outline-none focus-within:ring-2 focus-within:ring-inset focus-within:ring-black focus-within:ring-offset-0"
export const COMPONENT_FIELD_TEXTAREA_CLASS =
  "min-h-[2.5rem] resize-none border-transparent hover:resize-y hover:border-gray-200 focus:resize-y focus:border-gray-200"
/** Inner editor shell for component output — height comes from ProseMirror auto-grow, not a fixed min here. */
export const COMPONENT_OUTPUT_EDITOR_CLASS =
  "w-full border-0 bg-transparent resize-none border-transparent"
export const COMPONENT_OUTPUT_FOCUS_WRAPPER_CLASS =
  "component-card-focus-ring relative rounded-md focus-within:z-[2] focus-within:border-transparent focus-within:outline-none focus-within:ring-2 focus-within:ring-black focus-within:ring-offset-0"
export const COMPONENT_OUTPUT_FIELD_ACTIVE_CLASS = "component-output-field-active"
export const COMPONENT_OUTPUT_BODY_WRAPPER_CLASS = `${COMPONENT_OUTPUT_FOCUS_WRAPPER_CLASS} component-output-field w-full min-h-[5rem] overflow-visible border border-transparent bg-background rounded-md`
/** AI pane inline preview — same layout as output body but without the black focus ring. */
export const AI_CHAT_PREVIEW_BODY_WRAPPER_CLASS =
  "component-output-field w-full min-h-[5rem] overflow-visible border border-transparent bg-background rounded-md"
