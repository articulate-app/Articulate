/**
 * Local UI command for clarification option `select_component`.
 * Never sent as a chat instruction — the user picks a concrete component in the Content tab.
 */

export const AI_CLARIFICATION_COMPONENT_PICK_EVENT = "ai-clarification-component-pick"

export type AiClarificationComponentPickDetail = {
  active: boolean
  clarificationMessageId: string | null
  taskId: number | null
  channelId: number | null
}

export function dispatchClarificationComponentPickMode(
  detail: AiClarificationComponentPickDetail,
): void {
  if (typeof window === "undefined") return
  window.dispatchEvent(
    new CustomEvent<AiClarificationComponentPickDetail>(AI_CLARIFICATION_COMPONENT_PICK_EVENT, {
      detail,
    }),
  )
}

export function isSelectComponentClarificationOption(optionId: string): boolean {
  const normalized = optionId.trim().toLowerCase()
  return (
    normalized === "select_component"
    || normalized === "select-a-component"
    || normalized === "select_a_component"
  )
}

export function isNameComponentClarificationOption(optionId: string): boolean {
  const normalized = optionId.trim().toLowerCase()
  return (
    normalized === "name_component"
    || normalized === "name-a-component"
    || normalized === "name_a_component"
  )
}

/** Labels that must never be sent as a new chat instruction. */
export function isLocalClarificationUiCommandLabel(label: string): boolean {
  const normalized = label.trim().toLowerCase()
  return (
    normalized === "select a component in this task"
    || normalized === "select a component"
    || normalized === "name a component"
    || normalized === "name the component"
  )
}
