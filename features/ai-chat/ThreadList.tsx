"use client"

import React from "react"
import type { AiScope, AiThread } from "./types"
import { useCreateThread, useThreads } from "./hooks"

interface ThreadListProps {
  activeId?: string | null
  onSelect: (thread: AiThread) => void
  initialScope?: AiScope
  projectId?: number
  taskId?: number
}

export function ThreadList({ activeId, onSelect, initialScope = 'global', projectId, taskId }: ThreadListProps) {
  const { threads, isLoading } = useThreads()
  const createThread = useCreateThread()

  const onNew = async () => {
    const payload: Partial<AiThread> =
      initialScope === 'task' && taskId
        ? { scope: 'task', task_id: taskId }
        : initialScope === 'project' && projectId
        ? { scope: 'project', project_id: projectId }
        : { scope: 'global' }
    const t = await createThread(payload)
    onSelect(t)
  }

  return (
    <div className="w-72 border-r h-full flex flex-col">
      <div className="p-2 border-b flex items-center justify-between">
        <div className="font-semibold">AI Chats</div>
        <button className="text-sm px-2 py-1 bg-black text-white rounded" onClick={() => void onNew()}>New</button>
      </div>
      <div className="flex-1 overflow-auto">
        {isLoading && <div className="p-3 text-sm text-muted-foreground">Loading…</div>}
        {!isLoading && threads.map(t => (
          <button key={t.id} onClick={() => onSelect(t)} className={`w-full text-left px-3 py-2 hover:bg-accent ${activeId === t.id ? 'bg-accent' : ''}`}>
            <div className="text-sm font-medium truncate">{t.title || 'Untitled'}</div>
            <div className="text-xs text-muted-foreground capitalize">{t.scope}</div>
          </button>
        ))}
      </div>
    </div>
  )
}


