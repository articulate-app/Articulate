"use client"

import React from "react"
import type { AiAttachmentMeta } from "./types"

export function Attachments({ items }: { items?: AiAttachmentMeta[] | null }) {
  if (!items || items.length === 0) return null
  return (
    <div className="mt-2 grid gap-2">
      {items.map((a) => (
        <a key={a.file_path} href={getPublicUrl(a.file_path)} target="_blank" rel="noreferrer" className="text-xs text-blue-600 underline">
          {a.file_name} ({Math.round(a.size / 1024)} KB)
        </a>
      ))}
    </div>
  )
}

function getPublicUrl(path: string) {
  // Rely on signed/public policy configured for the attachments bucket
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL
  if (!base) return path
  return `${base}/storage/v1/object/public/attachments/${path}`
}


