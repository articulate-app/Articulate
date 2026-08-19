export type AiBrowserObservation = {
  browserSessionId: string
  browserId: string | null
  url: string
  title: string
  links: Array<{ text: string; href: string; verified: true }>
  text: string
  elements: Array<{
    index: number
    tag: string
    role: string | null
    name: string | null
    text: string | null
    href: string | null
  }>
  visual_assets?: Array<Record<string, unknown>>
  visual_follow_candidates?: Array<{ text: string; href: string; verified: true }>
  page_kind?: string
  visual_unresolved_reason?: string | null
  can_go_back: boolean
  can_go_forward: boolean
  at: number
}

const observations = new Map<string, AiBrowserObservation>()

export function rememberAiBrowserObservation(
  input: Omit<AiBrowserObservation, "at">,
): AiBrowserObservation {
  const next: AiBrowserObservation = { ...input, at: Date.now() }
  observations.set(input.browserSessionId, next)
  return next
}

export function consumeAiBrowserObservations(): AiBrowserObservation[] {
  const rows = Array.from(observations.values())
  observations.clear()
  return rows
}
