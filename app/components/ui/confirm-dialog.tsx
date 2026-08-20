"use client"

import { useEffect } from "react"
import { Button } from "./button"
import { Dialog, DialogContent, DialogFooter, DialogTitle } from "./dialog"

function clearBodyPointerEvents() {
  if (typeof document === "undefined") return
  if (document.body.style.pointerEvents === "none") {
    document.body.style.pointerEvents = ""
  }
}

export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel = "Delete",
  cancelLabel = "Cancel",
  busy = false,
  busyLabel,
  onOpenChange,
  onConfirm,
}: {
  open: boolean
  title: string
  description: string
  confirmLabel?: string
  cancelLabel?: string
  busy?: boolean
  busyLabel?: string
  onOpenChange: (open: boolean) => void
  onConfirm: () => void
}) {
  useEffect(() => {
    if (!open) {
      clearBodyPointerEvents()
      const timers = [0, 50, 150, 300].map((ms) => window.setTimeout(clearBodyPointerEvents, ms))
      return () => timers.forEach((id) => window.clearTimeout(id))
    }
    clearBodyPointerEvents()
    return () => {
      clearBodyPointerEvents()
    }
  }, [open])

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (busy && !next) return
        onOpenChange(next)
      }}
    >
      <DialogContent>
        <DialogTitle>{title}</DialogTitle>
        <div className="py-2">{description}</div>
        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            disabled={busy}
            onClick={() => onOpenChange(false)}
          >
            {cancelLabel}
          </Button>
          <Button
            type="button"
            variant="destructive"
            disabled={busy}
            onClick={onConfirm}
          >
            {busy ? (busyLabel ?? `${confirmLabel}…`) : confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
