"use client"

import { create } from "zustand"

export type ArtifactDeletedScope = {
  taskId?: number | null
  projectId?: number | null
  threadId?: string | null
}

type ArtifactDeletedState = {
  isOpen: boolean
  scope: ArtifactDeletedScope
  open: (scope?: ArtifactDeletedScope) => void
  close: () => void
}

let openTimer: ReturnType<typeof setTimeout> | null = null

export const useArtifactDeletedStore = create<ArtifactDeletedState>((set) => ({
  isOpen: false,
  scope: {},
  open: (scope = {}) => {
    if (openTimer != null) clearTimeout(openTimer)
    // Wait for the originating ⋯ menu to close so Radix does not dismiss the dialog.
    openTimer = setTimeout(() => {
      openTimer = null
      set({ isOpen: true, scope })
    }, 0)
  },
  close: () => {
    if (openTimer != null) {
      clearTimeout(openTimer)
      openTimer = null
    }
    set({ isOpen: false })
  },
}))
