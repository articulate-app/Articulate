"use client"

import { create } from "zustand"
import { hashPreviewContent } from "../../app/lib/component-edit-preview-lifecycle"
import type {
  ArtifactSelectedContextType,
  SelectedArtifactContext,
} from "../../app/lib/artifacts/artifact-types"

export function selectedContextTypeForArtifactAnchor(
  anchorType: SelectedArtifactContext["anchor_type"],
): ArtifactSelectedContextType {
  switch (anchorType) {
    case "text_range":
      return "artifact_text_selection"
    case "block":
      return "artifact_block"
    case "document":
      return "artifact_document"
    case "asset":
      return "artifact_asset"
    case "image_point":
      return "artifact_image_point"
    case "image_rect":
      return "artifact_image_rect"
    case "video_time":
      return "artifact_video_time"
    case "video_region":
      return "artifact_video_region"
    default:
      return "artifact_document"
  }
}

export function chipLabelForArtifactSelection(context: SelectedArtifactContext): string {
  const title = context.title?.trim() || "Artifact"
  switch (context.anchor_type) {
    case "text_range":
      return `${title} · selected text`
    case "block":
      return `${title} · block`
    case "image_point":
    case "image_rect":
      return `${title} · image`
    case "video_time":
    case "video_region":
      return `${title} · video`
    case "asset":
      return `${title} · asset`
    default:
      return title
  }
}

export function computeArtifactContentHash(text: string): string {
  return hashPreviewContent(text)
}

export type PendingArtifactSelection = {
  context: SelectedArtifactContext
  selectedContextType: ArtifactSelectedContextType
  token: number
}

type ArtifactSelectionState = {
  pending: PendingArtifactSelection | null
  setPendingSelection: (context: SelectedArtifactContext) => void
  clearPendingSelection: () => void
}

let selectionToken = 0

export const useArtifactSelectionStore = create<ArtifactSelectionState>((set) => ({
  pending: null,
  setPendingSelection: (context) => {
    selectionToken += 1
    set({
      pending: {
        context,
        selectedContextType: selectedContextTypeForArtifactAnchor(context.anchor_type),
        token: selectionToken,
      },
    })
  },
  clearPendingSelection: () => set({ pending: null }),
}))
