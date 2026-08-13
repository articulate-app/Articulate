"use client"

import { useMemo, useState } from "react"
import { Check, Plus, X } from "lucide-react"
import { Button } from "../ui/button"
import { Input } from "../ui/input"
import { Textarea } from "../ui/textarea"
import { cn } from "@/lib/utils"
import {
  APPROVED_IMAGE_BANK_PRESETS,
  createApprovedImageBank,
  type ProjectApprovedImageBank,
  type ProjectApprovedImageBankProvider,
} from "../../lib/project-brand-kit"

type ProjectApprovedImageBanksEditorProps = {
  banks: ProjectApprovedImageBank[]
  canEdit?: boolean
  disabled?: boolean
  onChange: (next: ProjectApprovedImageBank[]) => void
}

function upsertBank(
  banks: ProjectApprovedImageBank[],
  bank: ProjectApprovedImageBank,
): ProjectApprovedImageBank[] {
  const idx = banks.findIndex((entry) => entry.id === bank.id)
  if (idx >= 0) {
    const next = [...banks]
    next[idx] = bank
    return next
  }
  return [...banks, bank]
}

/**
 * Brand-kit editor for stock libraries the AI may use when choosing photography.
 */
export function ProjectApprovedImageBanksEditor({
  banks,
  canEdit = true,
  disabled = false,
  onChange,
}: ProjectApprovedImageBanksEditorProps) {
  const [customLabel, setCustomLabel] = useState("")
  const [customUrl, setCustomUrl] = useState("")
  const [customNotes, setCustomNotes] = useState("")

  const enabledByProvider = useMemo(() => {
    const map = new Map<string, ProjectApprovedImageBank>()
    for (const bank of banks) {
      if (bank.provider === "custom") continue
      map.set(bank.provider, bank)
    }
    return map
  }, [banks])

  const customBanks = useMemo(
    () => banks.filter((bank) => bank.provider === "custom"),
    [banks],
  )

  const togglePreset = (provider: Exclude<ProjectApprovedImageBankProvider, "custom">) => {
    if (!canEdit || disabled) return
    const existing = enabledByProvider.get(provider)
    if (existing) {
      onChange(banks.filter((bank) => bank.id !== existing.id))
      return
    }
    onChange([...banks, createApprovedImageBank({ provider })])
  }

  const updateBank = (id: string, patch: Partial<ProjectApprovedImageBank>) => {
    if (!canEdit || disabled) return
    onChange(
      banks.map((bank) => (bank.id === id ? { ...bank, ...patch } : bank)),
    )
  }

  const addCustom = () => {
    if (!canEdit || disabled) return
    const label = customLabel.trim()
    if (!label) return
    const bank = createApprovedImageBank({
      provider: "custom",
      label,
      url: customUrl.trim() || null,
      notes: customNotes.trim() || null,
    })
    onChange(upsertBank(banks, bank))
    setCustomLabel("")
    setCustomUrl("")
    setCustomNotes("")
  }

  return (
    <div className="space-y-4">
      <div className="space-y-1">
        <h3 className="text-sm font-medium text-gray-900">Approved image banks</h3>
        <p className="text-xs text-gray-500">
          Tell the AI which stock libraries this project may use for photography (iStock,
          Shutterstock, Adobe Stock, …). Enabled banks are passed into creative generation.
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        {APPROVED_IMAGE_BANK_PRESETS.map((preset) => {
          const active = enabledByProvider.has(preset.provider)
          return (
            <button
              key={preset.provider}
              type="button"
              disabled={!canEdit || disabled}
              onClick={() => togglePreset(preset.provider)}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors",
                active
                  ? "border-sky-300 bg-sky-50 text-sky-900"
                  : "border-gray-200 bg-white text-gray-600 hover:border-gray-300 hover:bg-gray-50",
                (!canEdit || disabled) && "opacity-60",
              )}
            >
              {active ? <Check className="h-3.5 w-3.5" /> : null}
              {preset.label}
            </button>
          )
        })}
      </div>

      {banks.filter((bank) => bank.provider !== "custom").length > 0 ? (
        <ul className="space-y-2">
          {banks
            .filter((bank) => bank.provider !== "custom")
            .map((bank) => (
              <li
                key={bank.id}
                className="rounded-lg border border-gray-200 bg-white px-3 py-2.5"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-gray-900">{bank.label}</p>
                    {bank.url ? (
                      <a
                        href={bank.url}
                        target="_blank"
                        rel="noreferrer"
                        className="mt-0.5 block truncate text-[11px] text-sky-700 hover:underline"
                      >
                        {bank.url}
                      </a>
                    ) : null}
                  </div>
                  {canEdit ? (
                    <button
                      type="button"
                      className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-700"
                      aria-label={`Remove ${bank.label}`}
                      disabled={disabled}
                      onClick={() => onChange(banks.filter((entry) => entry.id !== bank.id))}
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  ) : null}
                </div>
                <Textarea
                  value={bank.notes ?? ""}
                  disabled={!canEdit || disabled}
                  rows={2}
                  placeholder="Optional notes — license rules, preferred collections, search tips…"
                  className="mt-2 text-xs"
                  onChange={(event) => updateBank(bank.id, { notes: event.target.value || null })}
                />
              </li>
            ))}
        </ul>
      ) : null}

      <div className="space-y-2 rounded-lg border border-dashed border-gray-200 bg-gray-50/50 p-3">
        <p className="text-xs font-medium text-gray-700">Add custom library</p>
        <div className="grid gap-2 sm:grid-cols-2">
          <Input
            value={customLabel}
            disabled={!canEdit || disabled}
            placeholder="Name"
            onChange={(event) => setCustomLabel(event.target.value)}
          />
          <Input
            value={customUrl}
            disabled={!canEdit || disabled}
            placeholder="URL (optional)"
            onChange={(event) => setCustomUrl(event.target.value)}
          />
        </div>
        <Textarea
          value={customNotes}
          disabled={!canEdit || disabled}
          rows={2}
          placeholder="Notes (optional)"
          className="text-xs"
          onChange={(event) => setCustomNotes(event.target.value)}
        />
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="gap-1.5"
          disabled={!canEdit || disabled || !customLabel.trim()}
          onClick={addCustom}
        >
          <Plus className="h-3.5 w-3.5" />
          Add library
        </Button>
      </div>

      {customBanks.length > 0 ? (
        <ul className="space-y-2">
          {customBanks.map((bank) => (
            <li
              key={bank.id}
              className="rounded-lg border border-gray-200 bg-white px-3 py-2.5"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-gray-900">{bank.label}</p>
                  {bank.url ? (
                    <a
                      href={bank.url}
                      target="_blank"
                      rel="noreferrer"
                      className="mt-0.5 block truncate text-[11px] text-sky-700 hover:underline"
                    >
                      {bank.url}
                    </a>
                  ) : null}
                </div>
                {canEdit ? (
                  <button
                    type="button"
                    className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-700"
                    aria-label={`Remove ${bank.label}`}
                    disabled={disabled}
                    onClick={() => onChange(banks.filter((entry) => entry.id !== bank.id))}
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                ) : null}
              </div>
              <Textarea
                value={bank.notes ?? ""}
                disabled={!canEdit || disabled}
                rows={2}
                placeholder="Optional notes…"
                className="mt-2 text-xs"
                onChange={(event) => updateBank(bank.id, { notes: event.target.value || null })}
              />
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  )
}
