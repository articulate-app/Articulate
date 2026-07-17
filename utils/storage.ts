export function getPublicAssetUrl(path?: string | null): string | null {
  if (!path) return null

  if (path.startsWith("http")) return path

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  if (!supabaseUrl) return null

  const bucket = "public-media"
  return `${supabaseUrl}/storage/v1/object/public/${bucket}/${path}`
}

export function sanitizeStorageFileName(fileName: string): string {
  const lastDot = fileName.lastIndexOf(".")
  const rawBase = lastDot >= 0 ? fileName.slice(0, lastDot) : fileName
  const rawExt = lastDot >= 0 ? fileName.slice(lastDot + 1) : ""

  const base = rawBase
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9-_]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 80)

  const ext = rawExt
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "")
    .slice(0, 12)

  const safeBase = base || "attachment"
  return ext ? `${safeBase}.${ext}` : safeBase
}
