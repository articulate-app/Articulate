"use client"

import { useMemo, useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs"
import { Loader2 } from "lucide-react"
import { Button } from "../ui/button"
import { Dialog, DialogContent, DialogFooter, DialogTitle } from "../ui/dialog"
import { SearchableSelect } from "../ui/searchable-select"

type ProjectOption = {
  id: number
  name: string
  color?: string | null
  logo?: string | null
}

/** Kept so Fast Refresh does not crash if a stale row module still references this dialog. */
export function ProjectPickDialog({
  open,
  title,
  confirmLabel = "Add",
  busy = false,
  onOpenChange,
  onPick,
}: {
  open: boolean
  title: string
  confirmLabel?: string
  busy?: boolean
  onOpenChange: (open: boolean) => void
  onPick: (project: { id: number; name: string }) => void
}) {
  const supabase = useMemo(() => createClientComponentClient(), [])
  const [selectedId, setSelectedId] = useState("")

  const { data: projects = [], isLoading } = useQuery({
    queryKey: ["projects-minimal"],
    queryFn: async (): Promise<ProjectOption[]> => {
      const { data, error } = await supabase
        .from("v_projects_minimal")
        .select("id, name, color, logo")
        .order("name")
      if (error) throw error
      return (data ?? [])
        .filter((row) => row?.id != null && row?.name)
        .map((row) => ({
          id: Number(row.id),
          name: String(row.name),
          color: row.color ?? null,
          logo: row.logo ?? null,
        }))
    },
    enabled: open,
    staleTime: 60_000,
  })

  const selected = projects.find((project) => String(project.id) === selectedId) ?? null

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (busy && !next) return
        if (!next) setSelectedId("")
        onOpenChange(next)
      }}
    >
      <DialogContent>
        <DialogTitle>{title}</DialogTitle>
        <div className="py-2">
          {isLoading ? (
            <div className="flex h-10 items-center text-sm text-gray-500">
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Loading projects…
            </div>
          ) : (
            <SearchableSelect
              media="project"
              value={selectedId}
              onChange={setSelectedId}
              placeholder="Select a project"
              searchPlaceholder="Search projects…"
              emptyText="No projects found"
              options={projects.map((project) => ({
                value: String(project.id),
                label: project.name,
                logo: project.logo,
                color: project.color,
              }))}
            />
          )}
        </div>
        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            disabled={busy}
            onClick={() => onOpenChange(false)}
          >
            Cancel
          </Button>
          <Button
            type="button"
            disabled={busy || !selected}
            onClick={() => {
              if (!selected) return
              onPick({ id: selected.id, name: selected.name })
            }}
          >
            {busy ? `${confirmLabel}…` : confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
