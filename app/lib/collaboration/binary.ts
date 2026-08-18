import { COLLAB_MAX_UPDATE_BYTES, assertCollabDocumentSize } from "./limits"

export function bytesToBase64(bytes: Uint8Array): string {
  if (typeof Buffer !== "undefined") return Buffer.from(bytes).toString("base64")
  let binary = ""
  bytes.forEach((value) => {
    binary += String.fromCharCode(value)
  })
  return btoa(binary)
}

export function base64ToBytes(value: string): Uint8Array {
  if (typeof Buffer !== "undefined") return new Uint8Array(Buffer.from(value, "base64"))
  const binary = atob(value)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i)
  return bytes
}

export function encodeBroadcastUpdate(update: Uint8Array): Uint8Array {
  assertCollabDocumentSize(update.byteLength, COLLAB_MAX_UPDATE_BYTES)
  return new Uint8Array(update)
}

export function decodeBroadcastPayload(payload: unknown): Uint8Array | null {
  if (payload instanceof Uint8Array) return new Uint8Array(payload)
  if (payload instanceof ArrayBuffer) return new Uint8Array(payload)
  if (ArrayBuffer.isView(payload)) {
    const view = payload as ArrayBufferView
    return new Uint8Array(view.buffer.slice(view.byteOffset, view.byteOffset + view.byteLength))
  }
  if (payload && typeof payload === "object") {
    const row = payload as { update?: unknown; update_base64?: unknown }
    if (typeof row.update_base64 === "string") return base64ToBytes(row.update_base64)
    if (row.update instanceof Uint8Array) return new Uint8Array(row.update)
  }
  if (typeof payload === "string") return base64ToBytes(payload)
  return null
}

export function bytesEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.byteLength !== b.byteLength) return false
  for (let i = 0; i < a.byteLength; i += 1) {
    if (a[i] !== b[i]) return false
  }
  return true
}
