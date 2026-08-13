import type { BrightDataClient } from "../client.ts"
import type {
  BrightDataRequestSpec,
  CompetitorSocialNetwork,
  FetchPostsArgs,
  NetworkAdapter,
  NormalizedCompetitorPost,
} from "../types.ts"

/**
 * Every network follows the same shape: build one Bright Data request, then map
 * the returned records. Keeping trigger and mapping separate lets the sync worker
 * start a snapshot in one invocation and collect it in another.
 */
export function createNetworkAdapter(config: {
  network: CompetitorSocialNetwork
  buildRequest: (args: FetchPostsArgs) => BrightDataRequestSpec
  mapPost: (raw: unknown) => NormalizedCompetitorPost | null
}): NetworkAdapter {
  const mapRecords = (records: unknown[], args: FetchPostsArgs) =>
    records
      .map(config.mapPost)
      .filter((post): post is NormalizedCompetitorPost => Boolean(post))
      .slice(0, Math.max(1, args.maxPosts))

  return {
    network: config.network,
    buildRequest: config.buildRequest,
    mapRecords,
    async fetchPosts(args: FetchPostsArgs, client: BrightDataClient) {
      const request = config.buildRequest(args)
      const { snapshotId, records } = await client.triggerAndCollect({
        options: request.options,
        input: request.input,
      })
      return {
        posts: mapRecords(records, args),
        snapshotId,
        rawCount: records.length,
        metadata: request.metadata,
      }
    },
  }
}
