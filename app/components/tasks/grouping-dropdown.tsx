import * as React from 'react'
import { useTaskGrouping, GroupByField } from '../../store/task-grouping'
import type { TaskGroupingState } from '../../store/task-grouping'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '../ui/dropdown-menu'
import { Button } from '../ui/button'
import { ChevronDown } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useSearchParams, useRouter, usePathname } from 'next/navigation'

const GROUP_OPTIONS: { value: GroupByField; label: string }[] = [
  { value: null, label: 'No group' },
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
      params.delete('groupOrder')
      params.set('mode', 'list')
      params.delete('assigned_to_id')
      params.delete('project_id')
      params.delete('status_name')
      params.delete('content_type_id')
      params.delete('production_type_id')
      params.delete('language_id')
      params.delete('date_range')
      params.delete('channel')
    } else {
      // Add grouping parameter; keep rowSortBy/rowSortOrder so header clicks still work inside groups
      params.set('groupBy', groupBy)
      // Set a sensible default groupOrder depending on groupBy
      const defaultGroupOrder =
        groupBy === 'delivery_date' || groupBy === 'publication_date' ? 'desc' : 'asc'
      params.set('groupOrder', defaultGroupOrder)
      params.set('mode', 'grouped')
    }
    
    return `${pathname}?${params.toString()}`
  }

  const urlGroupOrder = searchParams.get('groupOrder') as 'asc' | 'desc' | null

  const effectiveGroupOrder: 'asc' | 'desc' = (() => {
    if (!selectedGroupBy) return 'desc'
    if (urlGroupOrder) return urlGroupOrder
    return selectedGroupBy === 'delivery_date' || selectedGroupBy === 'publication_date' ? 'desc' : 'asc'
  })()

  const handleGroupOrderChange = (order: 'asc' | 'desc') => {
    if (!selectedGroupBy) return
    const params = new URLSearchParams(searchParams.toString())
    params.set('groupBy', selectedGroupBy)
    params.set('groupOrder', order)
    params.delete('page')
    router.push(`${pathname}?${params.toString()}`)
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button type="button" className={cn('gap-2', className)}>
          {selectedGroupBy && current
            ? `Group by: ${current.label}`
            : 'Group by'}
          <ChevronDown className="w-4 h-4 ml-1" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start">
        {GROUP_OPTIONS.map(opt => (
          <DropdownMenuItem
            key={String(opt.value)}
            onSelect={() => {
              // URL is source of truth: only navigate; TaskList syncs store from URL so one click sticks
              const groupingUrl = generateGroupingUrl(opt.value)
              router.push(groupingUrl)
            }}
            className={selectedGroupBy === opt.value ? 'font-semibold bg-muted' : ''}
          >
            {opt.label}
          </DropdownMenuItem>
        ))}
        {selectedGroupBy && (
          <>
            <DropdownMenuSeparator />
            {selectedGroupBy === 'delivery_date' || selectedGroupBy === 'publication_date' ? (
              <>
                <DropdownMenuItem
                  onSelect={() => handleGroupOrderChange('desc')}
                  className={effectiveGroupOrder === 'desc' ? 'font-semibold bg-muted' : ''}
                >
                  Newest → Oldest
                </DropdownMenuItem>
                <DropdownMenuItem
                  onSelect={() => handleGroupOrderChange('asc')}
                  className={effectiveGroupOrder === 'asc' ? 'font-semibold bg-muted' : ''}
                >
                  Oldest → Newest
                </DropdownMenuItem>
              </>
            ) : (
              <>
                <DropdownMenuItem
                  onSelect={() => handleGroupOrderChange('asc')}
                  className={effectiveGroupOrder === 'asc' ? 'font-semibold bg-muted' : ''}
                >
                  A–Z
                </DropdownMenuItem>
                <DropdownMenuItem
                  onSelect={() => handleGroupOrderChange('desc')}
                  className={effectiveGroupOrder === 'desc' ? 'font-semibold bg-muted' : ''}
                >
                  Z–A
                </DropdownMenuItem>
              </>
            )}
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  )
} 