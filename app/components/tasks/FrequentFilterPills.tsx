"use client"

import { useState } from 'react'
import { useRouter, useSearchParams, usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '../ui/dropdown-menu'
import { ChevronDown, Check } from 'lucide-react'
import { MultiSelect } from '../ui/multi-select'
import { Popover, PopoverContent, PopoverTrigger } from '../ui/popover'
import { Button } from '../ui/button'
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem } from '../ui/command'

interface FrequentFilterPillsProps {
  editFields?: {
    projects?: Array<{ id: number; name: string; color?: string }>
    project_statuses?: Array<{ id: number; name: string; color?: string }>
  }
  className?: string
  /** When true, always render Project and Status pills (with placeholders when loading) to avoid layout shift. */
  reserveSpaceWhenLoading?: boolean
}

/**
 * FrequentFilterPills - Quick filter buttons for Project and Status
 * Styled exactly like GroupingDropdown pills
 */
export function FrequentFilterPills({ editFields, className, reserveSpaceWhenLoading = true }: FrequentFilterPillsProps) {
  const router = useRouter()
  const params = useSearchParams()
  const pathname = usePathname()
  
  // Get currently active filters
  const activeProjects = params.get('project')?.split(',').filter(Boolean) || []
  const activeStatuses = params.get('status')?.split(',').filter(Boolean) || []
  
  // State to control popover open state and search
  const [projectPopoverOpen, setProjectPopoverOpen] = useState(false)
  const [statusPopoverOpen, setStatusPopoverOpen] = useState(false)
  const [projectSearch, setProjectSearch] = useState('')
  const [statusSearch, setStatusSearch] = useState('')
  
  // Prepare options
  const projectOptions = (editFields?.projects || []).map(p => ({
    id: String(p.id),
    label: p.name,
    color: p.color
  }))

  // Deduplicate statuses by name since the same status name can appear for multiple IDs.
  const statusMap = new Map<string, { id: string; label: string; color?: string }>()
  for (const s of editFields?.project_statuses || []) {
    if (!s.name) continue
    if (!statusMap.has(s.name)) {
      statusMap.set(s.name, {
        id: s.name, // Use name as ID since status filters use names
        label: s.name,
        color: s.color,
      })
    }
  }
  const statusOptions = Array.from(statusMap.values())
  
  // Filter options based on search
  const filteredProjectOptions = projectOptions.filter(opt =>
    opt.label.toLowerCase().includes(projectSearch.toLowerCase())
  )
  const filteredStatusOptions = statusOptions.filter(opt =>
    opt.label.toLowerCase().includes(statusSearch.toLowerCase())
  )
  
  const handleProjectSelect = (projectId: string) => {
    const newValue = activeProjects.includes(projectId)
      ? activeProjects.filter(id => id !== projectId)
      : [...activeProjects, projectId]
    handleProjectChange(newValue)
  }
  
  const handleStatusSelect = (statusName: string) => {
    const newValue = activeStatuses.includes(statusName)
      ? activeStatuses.filter(name => name !== statusName)
      : [...activeStatuses, statusName]
    handleStatusChange(newValue)
  }

  const handleProjectChange = (selectedIds: string[]) => {
    const newParams = new URLSearchParams(params.toString())
    if (selectedIds.length > 0) {
      newParams.set('project', selectedIds.join(','))
    } else {
      newParams.delete('project')
    }
    router.replace(`${pathname}?${newParams.toString()}`, { scroll: false })
  }

  const handleStatusChange = (selectedNames: string[]) => {
    const newParams = new URLSearchParams(params.toString())
    if (selectedNames.length > 0) {
      newParams.set('status', selectedNames.join(','))
    } else {
      newParams.delete('status')
    }
    router.replace(`${pathname}?${newParams.toString()}`, { scroll: false })
  }

  const hasProjectOptions = projectOptions.length > 0
  const hasStatusOptions = statusOptions.length > 0
  const showReserved = reserveSpaceWhenLoading && (!hasProjectOptions || !hasStatusOptions)

  if (!reserveSpaceWhenLoading && !hasProjectOptions && !hasStatusOptions) {
    return null
  }

  const placeholderPillClass = cn(
    'gap-2 ml-2 inline-flex items-center opacity-60 pointer-events-none select-none',
    className
  )

  return (
    <>
      <span className="mx-2 text-gray-400 flex-shrink-0">|</span>
      {hasProjectOptions ? (
        <Popover open={projectPopoverOpen} onOpenChange={(open) => {
          setProjectPopoverOpen(open)
          if (!open) setProjectSearch('') // Clear search when closing
        }}>
          <PopoverTrigger asChild>
            <button 
              type="button" 
              className={cn(
                'gap-2 ml-2 inline-flex items-center flex-shrink-0',
                className,
                activeProjects.length > 0 && 'font-semibold'
              )}
            >
              {activeProjects.length > 0 
                ? `${activeProjects.length} Project${activeProjects.length > 1 ? 's' : ''}`
                : 'Project'}
              <ChevronDown className="w-4 h-4 ml-1" />
            </button>
          </PopoverTrigger>
          <PopoverContent align="start" className="w-64 p-0" onOpenAutoFocus={(e) => e.preventDefault()}>
            <Command shouldFilter={false} style={{ pointerEvents: 'auto', overflow: 'visible' }}>
              <CommandInput
                placeholder="Search projects..."
                value={projectSearch}
                onValueChange={setProjectSearch}
                className="text-gray-900"
              />
              {filteredProjectOptions.length === 0 && (
                <CommandEmpty className="py-2 text-sm text-gray-600">
                  No projects found.
                </CommandEmpty>
              )}
              <CommandGroup className="max-h-64 overflow-y-auto overflow-x-hidden" style={{ pointerEvents: 'auto', overscrollBehavior: 'contain' }}>
                {filteredProjectOptions.map((option) => {
                  const isSelected = activeProjects.includes(option.id)
                  return (
                    <CommandItem
                      key={option.id}
                      value={option.label}
                      onSelect={() => handleProjectSelect(option.id)}
                      className="flex items-center px-2 py-1.5 text-sm text-gray-900 cursor-pointer"
                      style={{ pointerEvents: 'auto' }}
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
                    </CommandItem>
                  )
                })}
              </CommandGroup>
            </Command>
          </PopoverContent>
        </Popover>
      ) : showReserved ? (
        <span className={placeholderPillClass}>
          Project
          <ChevronDown className="w-4 h-4 ml-1" />
        </span>
      ) : null}
      {hasStatusOptions ? (
        <Popover open={statusPopoverOpen} onOpenChange={(open) => {
          setStatusPopoverOpen(open)
          if (!open) setStatusSearch('') // Clear search when closing
        }}>
          <PopoverTrigger asChild>
            <button 
              type="button" 
              className={cn(
                'gap-2 ml-2 inline-flex items-center flex-shrink-0',
                className,
                activeStatuses.length > 0 && 'font-semibold'
              )}
            >
              {activeStatuses.length > 0 
                ? `${activeStatuses.length} Status${activeStatuses.length > 1 ? 'es' : ''}`
                : 'Status'}
              <ChevronDown className="w-4 h-4 ml-1" />
            </button>
          </PopoverTrigger>
          <PopoverContent align="start" className="w-64 p-0" onOpenAutoFocus={(e) => e.preventDefault()}>
            <Command shouldFilter={false} style={{ pointerEvents: 'auto', overflow: 'visible' }}>
              <CommandInput
                placeholder="Search statuses..."
                value={statusSearch}
                onValueChange={setStatusSearch}
                className="text-gray-900"
              />
              {filteredStatusOptions.length === 0 && (
                <CommandEmpty className="py-2 text-sm text-gray-600">
                  No statuses found.
                </CommandEmpty>
              )}
              <CommandGroup className="max-h-64 overflow-y-auto overflow-x-hidden" style={{ pointerEvents: 'auto', overscrollBehavior: 'contain' }}>
                {filteredStatusOptions.map((option) => {
                  const isSelected = activeStatuses.includes(option.id)
                  return (
                    <CommandItem
                      key={option.id}
                      value={option.label}
                      onSelect={() => handleStatusSelect(option.id)}
                      className="flex items-center px-2 py-1.5 text-sm text-gray-900 cursor-pointer"
                      style={{ pointerEvents: 'auto' }}
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
                    </CommandItem>
                  )
                })}
              </CommandGroup>
            </Command>
          </PopoverContent>
        </Popover>
      ) : showReserved ? (
        <span className={placeholderPillClass}>
          Status
          <ChevronDown className="w-4 h-4 ml-1" />
        </span>
      ) : null}
    </>
  )
}
