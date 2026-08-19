import * as Y from "yjs"
import { base64ToBytes } from "./binary"

export function isYDocEditoriallyEmpty(document: Y.Doc): boolean {
  return document.getXmlFragment("default").length === 0
}

export function isYDocSnapshotEditoriallyEmpty(snapshotBase64: string | null | undefined): boolean {
  if (!snapshotBase64) return true
  try {
    const document = new Y.Doc()
    Y.applyUpdate(document, base64ToBytes(snapshotBase64))
    return isYDocEditoriallyEmpty(document)
  } catch {
    return false
  }
}

/** Do not persist an empty Y.Doc while an artifact is still generating. */
export function shouldDeferEmptyYdocSeed(hasExistingContent: boolean): boolean {
  return !hasExistingContent
}

/**
 * Empty seed that raced ahead of artifact content can be hydrated as a Yjs
 * transaction. Never do this after real updates exist.
 */
export function shouldHydrateEmptyYdocFromArtifact(args: {
  ydocEmpty: boolean
  hasExistingContent: boolean
  lastSeq: number
}): boolean {
  return args.ydocEmpty && args.hasExistingContent && args.lastSeq <= 0
}

/** Fail-closed: never project an empty Y.Doc over existing artifact content. */
export function shouldProjectCollaborativeYDoc(args: {
  ydocEmpty: boolean
  hasExistingProjectedContent: boolean
}): boolean {
  return !(args.ydocEmpty && args.hasExistingProjectedContent)
}
