import React from 'react'

interface DraftTaskCardProps {
  title: string
}

export function DraftTaskCard({ title }: DraftTaskCardProps) {
  return (
    <div
      data-task-card="true"
      className="w-full min-h-[26px] flex items-center gap-2 rounded border border-dashed border-gray-300 bg-gray-50 px-2 py-1 mb-1 text-xs font-medium text-gray-700 truncate"
      title={title}
      onClick={(e) => e.stopPropagation()}
    >
      <span className="truncate block" style={{ maxWidth: '100%' }}>
        {title || 'New task'}
      </span>
    </div>
  )
}
