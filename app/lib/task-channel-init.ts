import { normalizeBootstrapTaskChannels } from "./types/task-details-bootstrap"

type ResolveTaskChannelInitArgs = {
  skipInitialTaskChannelsFetch: boolean
  bootstrapTaskChannels: unknown
}

export type TaskChannelInitMode =
  | { mode: "bootstrap"; channels: ReturnType<typeof normalizeBootstrapTaskChannels> }
  | { mode: "query"; channels: [] }

export function resolveTaskChannelInitMode({
  skipInitialTaskChannelsFetch,
  bootstrapTaskChannels,
}: ResolveTaskChannelInitArgs): TaskChannelInitMode {
  if (!skipInitialTaskChannelsFetch) {
    return { mode: "query", channels: [] }
  }

  const channels = normalizeBootstrapTaskChannels(bootstrapTaskChannels)
  if (channels.length > 0) {
    return { mode: "bootstrap", channels }
  }

  return { mode: "query", channels: [] }
}
