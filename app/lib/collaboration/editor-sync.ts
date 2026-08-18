/** In collaborative mode the Yjs binding owns the document. */
export function canReplaceCollaborativeEditorContent(collaborative: boolean): boolean {
  return collaborative !== true
}

export function canAutosaveArtifactSnapshot(collaborative: boolean): boolean {
  return collaborative !== true
}

export function shouldLockArtifactDuringAiGeneration(collaborative: boolean): boolean {
  return collaborative !== true
}
