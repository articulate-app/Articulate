"use client"

import { Suspense } from "react"
import { TasksLayout } from "../components/tasks/TasksLayout"

export default function TasksPageClient(props: any) {
  return (
    <Suspense fallback={<div>Loading...</div>}>
      <TasksLayout {...props} />
    </Suspense>
  )
} 
 
 
 
 
 