"use client"

import * as React from "react"
import { Button } from "../ui/button"
import { cn } from "@/lib/utils"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../ui/tabs"
import { RichTextEditor } from "../ui/rich-text-editor"

export type SuggestionDetailsModel = {
  id: number
  title: string
  briefing: string | null
  assigned_to_id?: number | null
  assigned_to_name?: string | null
  assigned_to_photo?: string | null
  planned_for_date: string | null
  content_type_id: number | null
  content_type_title?: string | null
  production_type_id?: number | null
  production_type_title?: string | null
  language_id?: number | null
  language_code?: string | null
  briefing_type_id?: number | null
  briefing_type_title?: string | null
  channel_ids: number[]
  channel_names?: string[]
  source_key: string | null
  project_id?: number | null
  project_name?: string | null
  project_color?: string | null
  project_logo?: string | null
  status?: string | null
  ai_title?: string | null
  ai_briefing?: string | null
  ai_content_type_id?: number | null
  ai_content_type_title?: string | null
}

export function SuggestionDetails({
  suggestion,
  onClose,
}: {
  suggestion: SuggestionDetailsModel | null
  onClose: () => void
}) {
  const isLoading = !suggestion

  return (
    <div className="h-full flex flex-col relative">
      {/* Header (mirrors TaskDetails) */}
      <div className="p-4 bg-white sticky top-0 z-10 border-b">
        <div className="flex items-center justify-between mb-2">
          <div className="flex-1 min-w-0 mr-4">
            <h1 className="text-lg font-semibold text-gray-900 truncate">
              {isLoading ? "Loading..." : suggestion?.title || "Untitled suggestion"}
            </h1>
          </div>

          <div className="flex items-center gap-2">
            {/* Placeholder actions (to be implemented later) */}
            <Button type="button" variant="outline" size="sm" disabled>
              Dismiss
            </Button>
            <Button type="button" size="sm" disabled>
              Approve
            </Button>
            <Button type="button" variant="ghost" size="sm" onClick={onClose}>
              Close
            </Button>
          </div>
        </div>
      </div>

      {/* Main content with tabs (mirrors TaskDetails) */}
      <div className="flex-1 flex flex-col overflow-hidden relative">
        <Tabs value="details" className="h-full flex flex-col">
          <TabsList className="grid w-full grid-cols-3 bg-transparent border-b border-gray-200 p-0 h-auto">
            <TabsTrigger
              value="details"
              className="px-4 py-2 text-sm font-medium text-gray-600 hover:text-gray-900 data-[state=active]:text-gray-900 data-[state=active]:border-b-2 data-[state=active]:border-blue-500 bg-transparent border-b-2 border-transparent rounded-none"
            >
              Details
            </TabsTrigger>
            <TabsTrigger
              value="content"
              className="px-4 py-2 text-sm font-medium text-gray-600 hover:text-gray-900 data-[state=active]:text-gray-900 data-[state=active]:border-b-2 data-[state=active]:border-blue-500 bg-transparent border-b-2 border-transparent rounded-none"
            >
              Content
            </TabsTrigger>
            <TabsTrigger
              value="reviews"
              className="px-4 py-2 text-sm font-medium text-gray-600 hover:text-gray-900 data-[state=active]:text-gray-900 data-[state=active]:border-b-2 data-[state=active]:border-blue-500 bg-transparent border-b-2 border-transparent rounded-none"
            >
              Reviews
            </TabsTrigger>
          </TabsList>

          <TabsContent value="details" className="flex-1 overflow-auto pb-[260px]">
            <div className="p-4 pb-0">
              <div className="mb-4 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-amber-900">
                <div className="text-sm font-medium">AI-generated suggestion</div>
                <div className="text-xs text-amber-800">
                  Read-only for now. Approval / dismissal will be added later.
                </div>
              </div>

              <div className="grid grid-cols-[max-content_1fr] gap-x-4 gap-y-2 items-start">
                <label className="text-sm font-medium text-gray-400 self-center justify-self-start text-left">
                  Title
                </label>
                <div className="w-full px-3 py-2 rounded-md min-h-[40px] flex items-center">
                  <span className={cn("text-lg font-semibold text-gray-900", isLoading && "text-gray-400")}>
                    {isLoading ? "Loading..." : suggestion?.title || ""}
                  </span>
                </div>

                <label className="text-sm font-medium text-gray-400 self-center justify-self-start text-left">
                  Briefing
                </label>
                <div className="w-full px-3 py-2 rounded-md min-h-[40px]">
                  {isLoading ? (
                    <span className="text-sm text-gray-400">Loading...</span>
                  ) : suggestion?.briefing ? (
                    // Read-only rich text display (suggestions are read-only). Uses the app's standard
                    // editor in read-only mode so stored formatting renders correctly and no raw HTML
                    // is exposed.
                    <RichTextEditor
                      value={suggestion.briefing}
                      onChange={() => {}}
                      readOnly
                      toolbarVisibility="hidden"
                      showBubbleToolbar={false}
                      flatSurface
                      editorClassName="text-sm leading-snug"
                    />
                  ) : null}
                </div>

                <label className="text-sm font-medium text-gray-400 self-center justify-self-start text-left">
                  Due Date
                </label>
                <div className={cn("w-full px-3 py-2 rounded-md truncate", isLoading && "text-gray-400")}>
                  {isLoading ? "Loading..." : suggestion?.planned_for_date || ""}
                </div>

                <label className="text-sm font-medium text-gray-400 self-center justify-self-start text-left">
                  Publication Date
                </label>
                <div className={cn("w-full px-3 py-2 rounded-md truncate", isLoading && "text-gray-400")}>
                  {isLoading ? "Loading..." : suggestion?.planned_for_date || ""}
                </div>

                <label className="text-sm font-medium text-gray-400 self-center justify-self-start text-left">
                  Content Type
                </label>
                <div className={cn("w-full px-3 py-2 rounded-md truncate", isLoading && "text-gray-400")}>
                  {isLoading ? "Loading..." : suggestion?.content_type_id != null ? String(suggestion.content_type_id) : ""}
                </div>

                <label className="text-sm font-medium text-gray-400 self-center justify-self-start text-left">
                  Channels
                </label>
                <div className={cn("w-full px-3 py-2 rounded-md truncate", isLoading && "text-gray-400")}>
                  {isLoading ? "Loading..." : suggestion?.channel_ids?.length ? suggestion.channel_ids.join(", ") : ""}
                </div>

                <label className="text-sm font-medium text-gray-400 self-center justify-self-start text-left">
                  Source Key
                </label>
                <div className={cn("w-full px-3 py-2 rounded-md truncate", isLoading && "text-gray-400")}>
                  {isLoading ? "Loading..." : suggestion?.source_key || ""}
                </div>
              </div>
            </div>
          </TabsContent>

          <TabsContent value="content" className="flex-1 overflow-auto">
            <div className="p-4 pb-0">
              <div className="text-sm text-gray-500">No content details for suggestions yet.</div>
            </div>
          </TabsContent>

          <TabsContent value="reviews" className="flex-1 overflow-auto">
            <div className="p-4 pb-0">
              <div className="text-sm text-gray-500">No reviews for suggestions.</div>
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  )
}


