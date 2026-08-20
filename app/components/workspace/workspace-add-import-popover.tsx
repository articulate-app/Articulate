"use client"

import { useRef, useState } from "react"
import { FileText, Link2, Loader2, Upload } from "lucide-react"
import {
  filesFromDataTransfer,
  filesFromFileList,
  isFileImportDrag,
} from "../../../features/artifacts/import-file-to-artifact"
import { normalizeHttpUrl } from "../../lib/workspace-create-output"
import { Button } from "../ui/button"
import { Input } from "../ui/input"
import { Popover, PopoverContent, PopoverTrigger } from "../ui/popover"
import { WorkspacePageAddButton } from "./workspace-page-shell"

type AddImportMode = "menu" | "url" | "file"

export function WorkspaceAddImportPopover({
  triggerLabel,
  busyLabel = "Adding…",
  isBusy,
  error,
  fileAccept,
  filterFiles,
  fileHint = "Drop a file here.",
  onSubmitUrl,
  onSubmitFiles,
}: {
  triggerLabel: string
  busyLabel?: string
  isBusy: boolean
  error: string | null
  fileAccept: string
  filterFiles?: (file: File) => boolean
  fileHint?: string
  onSubmitUrl: (url: string) => Promise<void>
  onSubmitFiles: (files: File[]) => Promise<void>
}) {
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const [isOpen, setIsOpen] = useState(false)
  const [mode, setMode] = useState<AddImportMode>("menu")
  const [urlDraft, setUrlDraft] = useState("")
  const [localError, setLocalError] = useState<string | null>(null)
  const [isDropActive, setIsDropActive] = useState(false)

  const visibleError = localError || error

  const reset = () => {
    setMode("menu")
    setUrlDraft("")
    setLocalError(null)
    setIsDropActive(false)
  }

  const takeFiles = (list: File[] | FileList | null | undefined): File[] => {
    const files = Array.isArray(list) ? list : filesFromFileList(list)
    return filterFiles ? files.filter(filterFiles) : files
  }

  const submitUrl = async () => {
    const normalized = normalizeHttpUrl(urlDraft)
    if (!normalized) {
      setLocalError("Enter a valid URL.")
      return
    }
    setLocalError(null)
    try {
      await onSubmitUrl(normalized)
      setIsOpen(false)
      reset()
    } catch (err) {
      setLocalError(err instanceof Error ? err.message : "Failed to add URL")
    }
  }

  const submitFiles = async (list: File[] | FileList | null | undefined) => {
    const files = takeFiles(list)
    if (files.length === 0) {
      setLocalError("Choose a supported file.")
      setMode("file")
      return
    }
    setLocalError(null)
    await onSubmitFiles(files)
    setIsOpen(false)
    reset()
  }

  return (
    <>
      <input
        ref={fileInputRef}
        type="file"
        multiple
        accept={fileAccept}
        className="sr-only"
        onChange={(event) => {
          const files = event.currentTarget.files
          event.currentTarget.value = ""
          void submitFiles(files).catch((err) => {
            setLocalError(err instanceof Error ? err.message : "Failed to add file")
          })
        }}
      />
      <Popover
        open={isOpen}
        onOpenChange={(open) => {
          if (isBusy) return
          setIsOpen(open)
          if (!open) reset()
        }}
      >
        <PopoverTrigger asChild>
          <WorkspacePageAddButton
            label={isBusy ? busyLabel : triggerLabel}
            disabled={isBusy}
          />
        </PopoverTrigger>
        <PopoverContent align="end" className="w-72 p-2">
          {mode === "menu" ? (
            <div className="flex flex-col gap-0.5">
              <button
                type="button"
                disabled={isBusy}
                className="flex items-center gap-2 rounded-md px-2.5 py-2 text-left text-sm text-gray-800 hover:bg-muted disabled:opacity-60"
                onClick={() => {
                  setLocalError(null)
                  setMode("url")
                }}
              >
                <Link2 className="h-4 w-4 text-gray-500" />
                URL
              </button>
              <button
                type="button"
                disabled={isBusy}
                className="flex items-center gap-2 rounded-md px-2.5 py-2 text-left text-sm text-gray-800 hover:bg-muted disabled:opacity-60"
                onClick={() => {
                  setLocalError(null)
                  setMode("file")
                }}
              >
                <Upload className="h-4 w-4 text-gray-500" />
                File
              </button>
              <button
                type="button"
                disabled={isBusy}
                className="flex items-center gap-2 rounded-md px-2.5 py-2 text-left text-sm text-gray-800 hover:bg-muted disabled:opacity-60"
                onClick={() => {
                  setLocalError(null)
                  fileInputRef.current?.click()
                }}
              >
                <FileText className="h-4 w-4 text-gray-500" />
                Select one
              </button>
            </div>
          ) : mode === "url" ? (
            <div className="space-y-2 p-1">
              <Input
                value={urlDraft}
                disabled={isBusy}
                placeholder="https://…"
                autoFocus
                onChange={(event) => setUrlDraft(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key !== "Enter") return
                  event.preventDefault()
                  void submitUrl()
                }}
              />
              <div className="flex justify-end gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  disabled={isBusy}
                  onClick={() => {
                    setMode("menu")
                    setLocalError(null)
                  }}
                >
                  Back
                </Button>
                <Button
                  type="button"
                  size="sm"
                  disabled={isBusy || !urlDraft.trim()}
                  onClick={() => {
                    void submitUrl()
                  }}
                >
                  {isBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Add"}
                </Button>
              </div>
            </div>
          ) : (
            <div className="space-y-2 p-1">
              <div
                className={`flex min-h-[7.5rem] w-full flex-col items-center justify-center rounded-md border border-dashed px-3 py-4 text-center text-xs ${
                  isDropActive
                    ? "border-sky-400 bg-sky-50 text-sky-800"
                    : "border-gray-200 bg-gray-50 text-gray-500"
                } ${isBusy ? "pointer-events-none opacity-60" : ""}`}
                onDragOver={(event) => {
                  if (!isFileImportDrag(event.dataTransfer)) return
                  event.preventDefault()
                  setIsDropActive(true)
                }}
                onDragLeave={(event) => {
                  if (!event.currentTarget.contains(event.relatedTarget as Node)) {
                    setIsDropActive(false)
                  }
                }}
                onDrop={(event) => {
                  event.preventDefault()
                  setIsDropActive(false)
                  void submitFiles(filesFromDataTransfer(event.dataTransfer)).catch((err) => {
                    setLocalError(err instanceof Error ? err.message : "Failed to add file")
                  })
                }}
              >
                <Upload className="mb-1.5 h-4 w-4" />
                {isBusy ? "Adding…" : isDropActive ? "Drop to add" : fileHint}
              </div>
              <div className="flex justify-end">
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  disabled={isBusy}
                  onClick={() => {
                    setMode("menu")
                    setLocalError(null)
                  }}
                >
                  Back
                </Button>
              </div>
            </div>
          )}
          {visibleError ? (
            <p className="px-1 pt-1 text-xs text-red-600">{visibleError}</p>
          ) : null}
        </PopoverContent>
      </Popover>
    </>
  )
}
