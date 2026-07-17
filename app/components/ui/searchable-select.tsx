"use client"

import * as React from "react"
import { Check, ChevronDown } from "lucide-react"
import { Popover, PopoverContent, PopoverTrigger } from "./popover"
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "./command"
import { UserAvatar } from "../UserAvatar"
import { getImageUrl } from "@/lib/public-media"
import { cn } from "@/lib/utils"

export interface SearchableSelectOption {
  value: string
  label: string
  /** Extra text to match against when searching (e.g. email). */
  keywords?: string
  photo?: string | null
  logo?: string | null
  color?: string | null
}

type SearchableSelectMedia = "avatar" | "project" | "none"

export interface SearchableSelectProps {
  options: SearchableSelectOption[]
  value: string
  onChange: (value: string) => void
  media?: SearchableSelectMedia
  placeholder?: string
  searchPlaceholder?: string
  emptyText?: string
  disabled?: boolean
  /** When true, renders the search + list directly without a trigger/popover. */
  inline?: boolean
  triggerClassName?: string
  contentClassName?: string
  ariaLabel?: string
}

function getOptionMatchText(opt: SearchableSelectOption): string {
  return `${opt.label} ${opt.keywords ?? ""}`.toLowerCase()
}

function OptionContent({
  opt,
  media,
}: {
  opt: SearchableSelectOption
  media: SearchableSelectMedia
}) {
  if (media === "project") {
    const logoUrl = getImageUrl(opt.logo)
    return (
      <span className="flex min-w-0 items-center gap-2">
        <span className="flex h-5 w-5 shrink-0 items-center justify-center">
          {logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={logoUrl} alt="" className="h-5 w-5 rounded-full object-cover" />
          ) : (
            <span
              className="h-2 w-2 rounded-full"
              style={{ backgroundColor: opt.color || "#e5e7eb" }}
            />
          )}
        </span>
        <span className="truncate text-sm text-gray-800">{opt.label}</span>
      </span>
    )
  }
  if (media === "avatar") {
    return (
      <span className="flex min-w-0 items-center gap-2">
        <span className="flex h-5 w-5 shrink-0 items-center justify-center">
          <UserAvatar name={opt.label} photoUrl={getImageUrl(opt.photo)} size="xs" className="h-5 w-5 min-h-5 min-w-5" />
        </span>
        <span className="truncate text-sm text-gray-800">{opt.label}</span>
      </span>
    )
  }
  return <span className="truncate text-sm text-gray-800">{opt.label}</span>
}

function SelectCommand({
  options,
  value,
  onChange,
  media,
  searchPlaceholder,
  emptyText,
  autoFocus,
  onAfterSelect,
}: {
  options: SearchableSelectOption[]
  value: string
  onChange: (value: string) => void
  media: SearchableSelectMedia
  searchPlaceholder: string
  emptyText: string
  autoFocus?: boolean
  onAfterSelect?: () => void
}) {
  const [search, setSearch] = React.useState("")

  const filtered = React.useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return options
    return options.filter((opt) => getOptionMatchText(opt).includes(q))
  }, [options, search])

  return (
    <Command shouldFilter={false}>
      <CommandInput
        autoFocus={autoFocus}
        value={search}
        onValueChange={setSearch}
        placeholder={searchPlaceholder}
      />
      <CommandList>
        <CommandEmpty>{emptyText}</CommandEmpty>
        <CommandGroup>
          {filtered.map((opt) => {
            const isSelected = String(opt.value) === String(value)
            return (
              <CommandItem
                key={opt.value}
                value={opt.value}
                onSelect={() => {
                  onChange(opt.value)
                  onAfterSelect?.()
                }}
                className="flex items-center justify-between gap-2"
              >
                <span className="flex min-w-0 items-center gap-2">
                  <OptionContent opt={opt} media={media} />
                </span>
                {isSelected ? (
                  <Check className="h-4 w-4 shrink-0 text-gray-700" />
                ) : null}
              </CommandItem>
            )
          })}
        </CommandGroup>
      </CommandList>
    </Command>
  )
}

export function SearchableSelect({
  options,
  value,
  onChange,
  media = "none",
  placeholder = "Select...",
  searchPlaceholder = "Search...",
  emptyText = "No options found.",
  disabled = false,
  inline = false,
  triggerClassName,
  contentClassName,
  ariaLabel,
}: SearchableSelectProps) {
  const [open, setOpen] = React.useState(false)

  const selected = React.useMemo(
    () => options.find((opt) => String(opt.value) === String(value)) ?? null,
    [options, value]
  )

  const handleChange = React.useCallback(
    (next: string) => {
      onChange(next)
    },
    [onChange]
  )

  if (inline) {
    return (
      <SelectCommand
        options={options}
        value={value}
        onChange={handleChange}
        media={media}
        searchPlaceholder={searchPlaceholder}
        emptyText={emptyText}
        autoFocus
      />
    )
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          disabled={disabled}
          aria-label={ariaLabel}
          className={cn(
            "w-full min-h-[40px] px-3 py-2 border rounded-md text-left transition flex items-center justify-between",
            "hover:bg-gray-50 disabled:opacity-60 disabled:cursor-not-allowed",
            triggerClassName
          )}
        >
          <span className="min-w-0 flex-1">
            {selected ? (
              <OptionContent opt={selected} media={media} />
            ) : (
              <span className="text-sm text-gray-500">{placeholder}</span>
            )}
          </span>
          <ChevronDown className="h-4 w-4 shrink-0 text-gray-500" />
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className={cn("w-[var(--radix-popover-trigger-width)] p-0", contentClassName)}
      >
        <SelectCommand
          options={options}
          value={value}
          onChange={handleChange}
          media={media}
          searchPlaceholder={searchPlaceholder}
          emptyText={emptyText}
          onAfterSelect={() => setOpen(false)}
        />
      </PopoverContent>
    </Popover>
  )
}
