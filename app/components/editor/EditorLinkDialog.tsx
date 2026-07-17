"use client"

import * as React from "react"
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Button } from "@/components/ui/button"
import type { EditorLinkFormState } from "./editor-link-commands"

type EditorLinkDialogProps = {
  open: boolean
  form: EditorLinkFormState
  onFormChange: (patch: Partial<EditorLinkFormState>) => void
  onOpenChange: (open: boolean) => void
  onConfirm: () => void
  onRemove: () => void
}

export function EditorLinkDialog({
  open,
  form,
  onFormChange,
  onOpenChange,
  onConfirm,
  onRemove,
}: EditorLinkDialogProps) {
  const urlInputRef = React.useRef<HTMLInputElement | null>(null)

  React.useEffect(() => {
    if (!open) return
    const timer = window.setTimeout(() => {
      if (form.url.trim()) {
        urlInputRef.current?.focus()
        urlInputRef.current?.select()
        return
      }
      urlInputRef.current?.focus()
    }, 0)
    return () => window.clearTimeout(timer)
  }, [open, form.url])

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault()
    onConfirm()
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{form.isEditing ? "Edit link" : "Insert link"}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="editor-link-text">Displayed text</Label>
            <Input
              id="editor-link-text"
              value={form.text}
              onChange={(event) => onFormChange({ text: event.target.value })}
              placeholder="Link text"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="editor-link-url">URL</Label>
            <Input
              ref={urlInputRef}
              id="editor-link-url"
              value={form.url}
              onChange={(event) => onFormChange({ url: event.target.value })}
              placeholder="https://example.com"
              inputMode="url"
            />
          </div>
          <label className="flex items-center gap-2 text-sm text-foreground">
            <input
              type="checkbox"
              checked={form.openInNewTab}
              onChange={(event) => onFormChange({ openInNewTab: event.target.checked })}
              className="h-4 w-4 rounded border border-input"
            />
            Open in new tab
          </label>
          <DialogFooter className="gap-2 sm:justify-between">
            {form.isEditing ? (
              <Button type="button" variant="ghost" className="text-destructive hover:text-destructive" onClick={onRemove}>
                Remove link
              </Button>
            ) : (
              <span />
            )}
            <div className="flex items-center gap-2">
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button type="submit">Save</Button>
            </div>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
