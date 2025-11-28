"use client"

import React, { useState } from "react"
import { ChevronDown, ChevronRight } from "lucide-react"

interface ToolResult {
  tool_name: string
  tool_input: any
  tool_output: any
  status: string
  error?: string
}

interface MessageActionLogProps {
  toolResults: ToolResult[]
}

export function MessageActionLog({ toolResults }: MessageActionLogProps) {
  const [isExpanded, setIsExpanded] = useState(false)

  if (!toolResults || toolResults.length === 0) {
    return null
  }

  return (
    <div className="mt-2 border border-gray-200 rounded-md bg-gray-50">
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full flex items-center justify-between px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100 transition-colors"
      >
        <span>Action Log ({toolResults.length} {toolResults.length === 1 ? 'action' : 'actions'})</span>
        {isExpanded ? (
          <ChevronDown className="w-4 h-4" />
        ) : (
          <ChevronRight className="w-4 h-4" />
        )}
      </button>
      
      {isExpanded && (
        <div className="border-t border-gray-200">
          {toolResults.map((result, index) => (
            <div key={index} className="px-3 py-2 border-b border-gray-100 last:border-b-0">
              <div className="flex items-center gap-2 mb-1">
                <span className="text-xs font-medium text-gray-600">{result.tool_name}</span>
                <span className={`text-xs px-2 py-0.5 rounded ${
                  result.status === 'success' 
                    ? 'bg-green-100 text-green-800' 
                    : 'bg-red-100 text-red-800'
                }`}>
                  {result.status}
                </span>
              </div>
              
              {result.tool_input && (
                <div className="mb-2">
                  <div className="text-xs font-medium text-gray-500 mb-1">Input:</div>
                  <pre className="text-xs bg-white p-2 rounded border overflow-x-auto">
                    {typeof result.tool_input === 'string' 
                      ? result.tool_input 
                      : JSON.stringify(result.tool_input, null, 2)
                    }
                  </pre>
                </div>
              )}
              
              {result.tool_output && (
                <div className="mb-2">
                  <div className="text-xs font-medium text-gray-500 mb-1">Output:</div>
                  <pre className="text-xs bg-white p-2 rounded border overflow-x-auto">
                    {typeof result.tool_output === 'string' 
                      ? result.tool_output 
                      : JSON.stringify(result.tool_output, null, 2)
                    }
                  </pre>
                </div>
              )}
              
              {result.error && (
                <div className="mb-2">
                  <div className="text-xs font-medium text-red-500 mb-1">Error:</div>
                  <div className="text-xs text-red-600 bg-red-50 p-2 rounded">
                    {result.error}
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
