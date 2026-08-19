import { peekArtifactCollabSession } from "./provider-registry"

export type CollabFlushResult = {
  flushed: boolean
  lastSeq: number
}

export async function flushArtifactCollaboration(artifactId: string): Promise<CollabFlushResult> {
  const session = peekArtifactCollabSession(artifactId)
  const provider = session?.provider as { flush?: () => Promise<void>; lastSeq?: number } | null
  if (!session || !provider?.flush) {
    return { flushed: false, lastSeq: 0 }
  }
  await provider.flush()
  return {
    flushed: true,
    lastSeq: Number(provider.lastSeq ?? 0),
  }
}

export async function flushAndProjectArtifact(args: {
  artifactId: string
  project: (seq: number) => Promise<void>
}): Promise<CollabFlushResult> {
  const flushed = await flushArtifactCollaboration(args.artifactId)
  if (flushed.flushed) {
    await args.project(flushed.lastSeq)
  }
  return flushed
}
