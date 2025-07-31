import * as React from 'react'
import { useTaskGrouping, GroupByField } from '../../store/task-grouping'
import type { TaskGroupingState } from '../../store/task-grouping'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '../ui/dropdown-menu'
import { Button } from '../ui/button'
import { ChevronDown } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useSearchParams, useRouter, usePathname } from 'next/navigation'

const GROUP_OPTIONS: { value: GroupByField; label: string }[] = [
  { value: null, label: 'Group by' },
  { value: 'assigned_to', label: 'Assigned To' },
  { value: 'status', label: 'Status' },
  { value: 'delivery_date', label: 'Delivery Date' },
  { value: 'publication_date', label: 'Publication Date' },
  { value: 'project', label: 'Project' },
  { value: 'content_type', label: 'Content Type' },
  { value: 'production_type', label: 'Production Type' },
  { value: 'language', label: 'Language' },
  { value: 'channels', label: 'Channels' },
]

export function GroupingDropdown({ className }: { className?: string }) {
  const selectedGroupBy = useTaskGrouping((s: TaskGroupingState) => s.selectedGroupBy)
  const setGroupBy = useTaskGrouping((s: TaskGroupingState) => s.setGroupBy)
  const searchParams = useSearchParams()
  const router = useRouter()
  const pathname = usePathname()

  const current = GROUP_OPTIONS.find(opt => opt.value === selectedGroupBy)

  // Function to generate URL for grouping selection
  const generateGroupingUrl = (groupBy: GroupByField) => {
    const params = new URLSearchParams(searchParams.toString())
    
    if (groupBy === null) {
      // Remove grouping parameters when "Group by" (no grouping) is selected
      params.delete('groupBy')
      params.delete('assigned_to_id')
      params.delete('project_id')
      params.delete('status_name')
      params.delete('content_type_id')
      params.delete('production_type_id')
      params.delete('language_id')
      params.delete('date_range')
      params.delete('channel')
    } else {
      // Add grouping parameter
      params.set('groupBy', groupBy)
    }
    
    return `${pathname}?${params.toString()}`
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button type="button" className={cn('gap-2', className)}>
          {current?.label || 'Group By'}
          <ChevronDown className="w-4 h-4 ml-1" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start">
        {GROUP_OPTIONS.map(opt => (
          <DropdownMenuItem
            key={String(opt.value)}
            onSelect={() => {
              setGroupBy(opt.value)
              // Navigate to the grouping-specific URL
              const groupingUrl = generateGroupingUrl(opt.value)
              router.push(groupingUrl)
            }}
            className={selectedGroupBy === opt.value ? 'font-semibold bg-muted' : ''}
          >
            {opt.label}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
} 