"use client"

import { TestConnection } from "../components/test/TestConnection"
import { TestTaskRealtime } from "../components/test/TestTaskRealtime"
import { TestRealtimeConnection } from "../components/test/TestRealtimeConnection"

export default function TestPage() {
  return (
    <div className="p-6 space-y-6">
      <h1 className="text-2xl font-bold">Test Components</h1>
      
      <div className="grid gap-6">
        <div className="p-4 border rounded-lg">
          <h2 className="text-lg font-semibold mb-2">Layout Remount Test</h2>
          <p className="text-sm text-gray-600 mb-4">
            Test that switching middleView (kanban ↔ calendar) doesn't remount TaskList.
            Watch browser console for TaskList render logs.
          </p>
          <div className="space-y-2">
            <div className="text-sm">
              <strong>How to test:</strong>
              <ol className="list-decimal list-inside mt-1 space-y-1">
                <li>Open browser DevTools Console</li>
                <li>Navigate to /tasks page</li>
                <li>Look for "[TaskList] RENDER" logs in console</li>
                <li>Switch between Calendar and Kanban views using the toggle button</li>
                <li>Verify TaskList only logs initial render, not on view switches</li>
              </ol>
            </div>
            <div className="text-sm text-green-600">
              <strong>✅ Expected behavior:</strong> TaskList should NOT log new renders when switching middle views
            </div>
            <div className="text-sm text-red-600">
              <strong>❌ Bug behavior:</strong> TaskList logs new renders and "MOUNTED" messages on every middle view switch
            </div>
          </div>
        </div>
        
        <div className="p-4 border rounded-lg">
          <h2 className="text-lg font-semibold mb-2">Database Connection Test</h2>
        <TestConnection />
        </div>
        
        <div className="p-4 border rounded-lg">
          <h2 className="text-lg font-semibold mb-2">Realtime Connection Test</h2>
        <TestRealtimeConnection />
        </div>
        
        <div className="p-4 border rounded-lg">
          <h2 className="text-lg font-semibold mb-2">Task Realtime Test</h2>
        <TestTaskRealtime />
        </div>
      </div>
    </div>
  )
} 