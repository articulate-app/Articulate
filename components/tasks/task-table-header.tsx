import * as React from 'react'
import { flexRender, HeaderGroup, Table } from '@tanstack/react-table'
import { cn } from '@/lib/utils'

interface TaskTableHeaderProps<T> {
  table: Table<T>
  columns: any[]
}

export function TaskTableHeader<T>({ table, columns }: TaskTableHeaderProps<T>) {
  return (
    <thead className="sticky top-0 z-20 bg-white border-b shadow-sm">
      {table.getHeaderGroups().map(headerGroup => (
        <tr key={headerGroup.id}>
          {headerGroup.headers.map(header => (
            <th
              key={header.id}
              colSpan={header.colSpan}
              style={{
                width: header.getSize(),
                minWidth: header.getSize(),
                maxWidth: header.getSize(),
                position: 'relative',
              }}
              className={cn(
                'px-3 py-2 text-left font-medium text-gray-500 group',
                'border-r border-gray-200',
                'select-none',
              )}
            >
              <div className="flex items-center justify-between w-full h-full">
                {flexRender(header.column.columnDef.header, header.getContext())}
                {header.column.getCanResize() && (
                  <div
                    onMouseDown={header.getResizeHandler()}
                    onTouchStart={header.getResizeHandler()}
                    className="absolute right-0 top-0 h-full w-2 cursor-col-resize z-10 transition-colors"
                    style={{ userSelect: 'none' }}
                  />
                )}
              </div>
            </th>
          ))}
        </tr>
      ))}
    </thead>
  )
} 