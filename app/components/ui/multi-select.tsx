"use client"

import * as React from "react"
import { Check, ChevronsUpDown, X } from "lucide-react"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
} from "@/components/ui/command"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { Badge } from "@/components/ui/badge"

export interface MultiSelectProps {
  options: { id: string; label: string; color?: string }[]
  value: string[]
  onChange: (value: string[]) => void
  onSearch?: (value: string) => void
  placeholder?: string
  className?: string
  singleSelect?: boolean
}

export function MultiSelect({
  options,
  value,
  onChange,
  onSearch,
  placeholder = "Select items...",
  className,
  singleSelect = false,
}: MultiSelectProps) {
  const [open, setOpen] = React.useState(false)
  const [search, setSearch] = React.useState("")

  // Defensive: ensure value is always an array
  const safeValue = Array.isArray(value) ? value : [];

  // For singleSelect, only show the first selected option
  const selectedOptions = singleSelect
    ? options.filter((option) => safeValue[0] && option.id === safeValue[0])
    : options.filter((option) => safeValue.includes(option.id))

  const handleSelect = React.useCallback((selectedValue: string) => {
    if (singleSelect) {
      onChange([selectedValue])
      setOpen(false)
    } else {
      const newValue = safeValue.includes(selectedValue)
        ? safeValue.filter((id) => id !== selectedValue)
        : [...safeValue, selectedValue]
      onChange(newValue)
    }
  }, [safeValue, onChange, singleSelect])

  const handleSearch = (searchValue: string) => {
    setSearch(searchValue)
    onSearch?.(searchValue)
  }

  const filteredOptions = React.useMemo(() => {
    if (!search) return options
    return options.filter(option =>
      option.label.toLowerCase().includes(search.toLowerCase())
    )
  }, [options, search])

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className={cn(
            "w-full justify-between min-w-[220px]",
            !safeValue.length && "text-muted-foreground",
            className
          )}
        >
          <div className="flex flex-wrap gap-1">
            {selectedOptions.length > 0 ? (
              selectedOptions.map((option, index) => (
                <Badge
                  key={`${option.id}-badge-${index}`}
                  variant="secondary"
                  className="mr-1 mb-1"
                >
                  {option.label}
                  {!singleSelect && (
                    <button
                      type="button"
                      className="ml-1 ring-offset-background rounded-full outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
                      onClick={(e) => {
                        e.preventDefault()
                        e.stopPropagation()
                        handleSelect(option.id)
                      }}
                    >
                      <X className="h-3 w-3 hover:text-gray-600" />
                    </button>
                  )}
                </Badge>
              ))
            ) : (
              <span className="text-gray-500">{placeholder}</span>
            )}
          </div>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-full min-w-[220px] p-0" align="start">
        <Command shouldFilter={false}>
          <CommandInput
            placeholder="Search..."
            value={search}
            onValueChange={handleSearch}
            className="text-gray-900"
          />
          {filteredOptions.length === 0 && (
          <CommandEmpty className="py-2 text-sm text-gray-600">
            No results found.
          </CommandEmpty>
          )}
          <CommandGroup className="max-h-64 overflow-auto">
            {filteredOptions.length > 0 ? filteredOptions.map((option, index) => {
              const isSelected = safeValue.includes(option.id)
              return (
                <div
                  key={`${option.id}-option-${index}`}
                  className="flex items-center px-2 py-1.5 text-sm text-gray-900 cursor-pointer hover:bg-gray-100"
                  onClick={(e) => {
                    e.preventDefault()
                    e.stopPropagation()
                    handleSelect(option.id)
                  }}
                  role="option"
                  aria-selected={isSelected}
                >
                  <div className="flex h-4 w-4 items-center justify-center mr-2">
                    <Check
                      className={cn(
                        "h-4 w-4",
                        isSelected ? "opacity-100" : "opacity-0"
                      )}
                    />
                  </div>
                  <span>{option.label}</span>
                </div>
              )}) : (
                <div className="px-3 py-2 text-sm text-gray-500">No options found</div>
            )}
          </CommandGroup>
        </Command>
      </PopoverContent>
    </Popover>
  )
} 