"use client"

import React, { useState, useMemo } from 'react'
import { Button } from '../ui/button'
import { Badge } from '../ui/badge'
import { Check, ChevronsUpDown, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '../ui/popover'
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
} from '../ui/command'

interface Component {
  id: string
  label: string
  source: 'global' | 'project'
  componentId: number
}

interface ComponentSelectorProps {
  components: Component[]
  selected: Array<{ id: number; source: 'global' | 'project' }>
  onSelectionChange: (selected: Array<{ id: number; source: 'global' | 'project' }>) => void
}

export function ComponentSelector({
  components,
  selected,
  onSelectionChange,
}: ComponentSelectorProps) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')

  const selectedIds = new Set(
    selected.map(c => c.source === 'global' ? `global-${c.id}` : `project-${c.id}`)
  )

  const filteredComponents = useMemo(() => {
    if (!search) return components
    return components.filter(c =>
      c.label.toLowerCase().includes(search.toLowerCase())
    )
  }, [components, search])

  const handleSelect = (componentId: string) => {
    const [source, idStr] = componentId.split('-')
    const id = Number(idStr)
    const sourceType = source === 'global' ? 'global' : 'project'

    const isSelected = selected.some(c => c.id === id && c.source === sourceType)

    if (isSelected) {
      onSelectionChange(selected.filter(c => !(c.id === id && c.source === sourceType)))
    } else {
      onSelectionChange([...selected, { id, source: sourceType }])
    }
  }

  const selectedComponents = components.filter(c => selectedIds.has(c.id))

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className="w-full justify-between min-w-[220px]"
        >
          <div className="flex flex-wrap gap-1">
            {selectedComponents.length > 0 ? (
              selectedComponents.map((component) => (
                <Badge
                  key={component.id}
                  variant="secondary"
                  className="mr-1 mb-1"
                >
                  {component.label}
                  <button
                    type="button"
                    className="ml-1 ring-offset-background rounded-full outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
                    onClick={(e) => {
                      e.preventDefault()
                      e.stopPropagation()
                      handleSelect(component.id)
                    }}
                  >
                    <X className="h-3 w-3 hover:text-gray-600" />
                  </button>
                </Badge>
              ))
            ) : (
              <span className="text-gray-500">Select components...</span>
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
            onValueChange={setSearch}
          />
          {filteredComponents.length === 0 && (
            <CommandEmpty className="py-2 text-sm text-gray-600">
              No results found.
            </CommandEmpty>
          )}
          <CommandGroup className="max-h-64 overflow-auto">
            {filteredComponents.map((component) => {
              const isSelected = selectedIds.has(component.id)
              return (
                <div
                  key={component.id}
                  className="flex items-center px-2 py-1.5 text-sm text-gray-900 cursor-pointer hover:bg-gray-100"
                  onClick={() => handleSelect(component.id)}
                  role="option"
                  aria-selected={isSelected}
                >
                  <div className="flex h-4 w-4 items-center justify-center mr-2">
                    <Check
                      className={cn(
                        'h-4 w-4',
                        isSelected ? 'opacity-100' : 'opacity-0'
                      )}
                    />
                  </div>
                  <span className="flex-1">{component.label}</span>
                  <Badge
                    variant={component.source === 'global' ? 'outline' : 'default'}
                    className="ml-2 text-xs"
                  >
                    {component.source}
                  </Badge>
                </div>
              )
            })}
          </CommandGroup>
        </Command>
      </PopoverContent>
    </Popover>
  )
}

