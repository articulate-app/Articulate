'use client'

import * as React from 'react'
import { MoreHorizontal } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { GroupByField } from '@/store/task-grouping'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from '../ui/dropdown-menu'
import { GroupingMenuItems } from './grouping-dropdown'

type TaskGroupHeaderActionsProps = {
  className?: string
  /** When in project scope, hide Project as a group-by option (same as list header). */
  hiddenGroupByOptions?: (GroupByField | string)[]
}

/**
 * Single overflow control on a group header that opens the same “Group by” menu as
 * Task list header → … → Group by (including order options).
 */
export function TaskGroupHeaderActions({
  className,
  hiddenGroupByOptions,
}: TaskGroupHeaderActionsProps) {
  return (
    <div
      className={cn('flex shrink-0 items-center', className)}
      onClick={e => e.stopPropagation()}
    >
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            aria-label="Change group by"
            title="Change group by"
            className="inline-flex h-6 w-6 items-center justify-center rounded text-muted-foreground opacity-60 hover:bg-gray-100 hover:opacity-100"
            onClick={e => e.stopPropagation()}
          >
            <MoreHorizontal className="h-3.5 w-3.5" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          align="end"
          className="min-w-[200px]"
          onClick={e => e.stopPropagation()}
        >
          <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">
            Group by
          </DropdownMenuLabel>
          <GroupingMenuItems hiddenGroupByOptions={hiddenGroupByOptions} />
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  )
}
