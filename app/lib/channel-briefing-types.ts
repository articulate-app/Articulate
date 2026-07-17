export type ChannelBriefingOptionGroup = "assigned" | "available"

export type ProjectChannelBriefingTypeOption = {
  id: number
  title: string
  description: string | null
  isAssignedToChannel: boolean
  isDefaultForChannel: boolean
  effectiveDefaultBriefingTypeId: number | null
  optionGroup: ChannelBriefingOptionGroup
  channelPosition: number | null
  projectPosition: number | null
}

type EnsureAssignedArgs = {
  supabase: any
  projectId: number
  contentTypeId: number
  channelId: number
  option: ProjectChannelBriefingTypeOption
}

function toIntOrNull(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value
  if (typeof value === "string" && value.trim().length > 0) {
    const parsed = Number(value)
    if (Number.isFinite(parsed)) return parsed
  }
  return null
}

export function mapProjectChannelBriefingTypeOptions(
  rows: any[]
): { options: ProjectChannelBriefingTypeOption[]; effectiveDefaultBriefingTypeId: number | null } {
  let effectiveDefaultBriefingTypeId: number | null = null

  const options = (rows || [])
    .map((row: any): ProjectChannelBriefingTypeOption | null => {
      const id = toIntOrNull(row?.briefing_type_id)
      if (id == null) return null

      const rowEffectiveDefault = toIntOrNull(row?.effective_default_briefing_type_id)
      if (rowEffectiveDefault != null) {
        effectiveDefaultBriefingTypeId = rowEffectiveDefault
      }

      const optionGroup: ChannelBriefingOptionGroup =
        row?.option_group === "available" ? "available" : "assigned"

      return {
        id,
        title:
          (typeof row?.title === "string" && row.title.trim().length > 0)
            ? row.title
            : `Briefing ${id}`,
        description: typeof row?.description === "string" ? row.description : null,
        isAssignedToChannel: Boolean(row?.is_assigned_to_channel),
        isDefaultForChannel: Boolean(row?.is_default_for_channel),
        effectiveDefaultBriefingTypeId: rowEffectiveDefault,
        optionGroup,
        channelPosition: toIntOrNull(row?.channel_position),
        projectPosition: toIntOrNull(row?.project_position),
      }
    })
    .filter((option): option is ProjectChannelBriefingTypeOption => option !== null)

  return { options, effectiveDefaultBriefingTypeId }
}

export function splitBriefingTypeOptions(options: ProjectChannelBriefingTypeOption[]) {
  const assigned = options.filter((option) => option.optionGroup === "assigned")
  const available = options.filter((option) => option.optionGroup === "available")
  return { assigned, available }
}

export async function ensureBriefingTypeAssignedToChannel({
  supabase,
  projectId,
  contentTypeId,
  channelId,
  option,
}: EnsureAssignedArgs): Promise<boolean> {
  if (option.isAssignedToChannel) return false

  const { error } = await supabase.rpc("pcctb_add", {
    p_project_id: projectId,
    p_content_type_id: contentTypeId,
    p_channel_id: channelId,
    p_briefing_type_id: option.id,
  })
  if (error) throw error
  return true
}
