/** 5 MiB encoded Y.Doc snapshot. */
export const COLLAB_MAX_DOCUMENT_BYTES = 5 * 1024 * 1024

/** 1 MiB single Yjs update. */
export const COLLAB_MAX_UPDATE_BYTES = 1 * 1024 * 1024

export function assertCollabDocumentSize(byteSize: number, maxBytes = COLLAB_MAX_DOCUMENT_BYTES): void {
  if (!Number.isFinite(byteSize) || byteSize < 0) {
    throw new Error("ydoc_size_invalid")
  }
  if (byteSize > maxBytes) {
    throw new Error("ydoc_too_large")
  }
}

export function encodeYjsBytesToBase64(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString("base64")
}

export function decodeYjsBase64ToBytes(value: string | null | undefined): Uint8Array | null {
  if (!value) return null
  return new Uint8Array(Buffer.from(value, "base64"))
}
