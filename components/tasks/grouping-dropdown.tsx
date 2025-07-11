import * as React from 'react'
import { useTaskGrouping, GroupByField } from '@/store/task-grouping'
import type { TaskGroupingState } from '@/store/task-grouping'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { Button } from '@/components/ui/button'
import { ChevronDown } from 'lucide-react'

const GROUP_OPTIONS: { value: GroupByField; label: string }[] = [
  { value: null, label: 'No Grouping' },
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

export function GroupingDropdown() {
  const selectedGroupBy = useTaskGrouping((s: TaskGroupingState) => s.selectedGroupBy)
  const setGroupBy = useTaskGrouping((s: TaskGroupingState) => s.setGroupBy)

  const current = GROUP_OPTIONS.find(opt => opt.value === selectedGroupBy)

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" className="gap-2">
          {current?.label || 'Group By'}
          <ChevronDown className="w-4 h-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start">
        {GROUP_OPTIONS.map(opt => (
          <DropdownMenuItem
            key={String(opt.value)}
            onSelect={() => setGroupBy(opt.value)}
            className={selectedGroupBy === opt.value ? 'font-semibold bg-muted' : ''}
          >
            {opt.label}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
} 