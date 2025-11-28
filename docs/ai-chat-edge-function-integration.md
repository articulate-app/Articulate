# AI Chat Edge Function Integration

## Overview

This document describes how the frontend is wired to the refactored `ai-chat` Supabase Edge Function. The integration supports three main use cases:
1. **Normal chat** - User sends arbitrary messages
2. **Build component** - AI generates content for a specific component
3. **Build full briefing** - AI generates content for all selected components

## Key Principle: Manual Mode

For all interactive UI uses, the frontend calls the Edge Function with `auto_run: false` (or omits it, as it defaults to false). This ensures:
- **No DB-writing tools are triggered automatically**
- **Content saving is always done explicitly from the FE**
- The server may propose tool calls, but they are ignored
- No content is written to `task_component_outputs` by the Edge Function

## Edge Function Contract

### Request Format

```typescript
type AiChatRequest = {
  thread_id: string;              // REQUIRED - ai_threads.id
  message?: string | null;        // User message (optional if mode is build_*)
  attachments?: {
    file_name: string;
    file_path: string;
    mime_type?: string | null;
    size?: number | null;
  }[];
  active_channel_id?: number | null; // Current channel (e.g., Instagram, Blog)
  mode?: "build_component" | "build_briefing" | string | null;
  component_id?: string | null;      // task_channel_components.id when mode === "build_component"
  auto_run?: boolean;                // Default: false (manual mode)
};
```

### Response Format

```typescript
type AiChatResponse = {
  message: {
    id: string;
    thread_id: string;
    role: "assistant";
    content: string;           // AI-generated text
    content_json: any | null;  // May contain { tool_results: [...] } for auto runs
    // ... usage + pricing metadata
  };
};
```

## Implementation Files

### 1. Core Utility (`app/lib/ai/chat.ts`)

Main function for calling the Edge Function:

```typescript
export async function callAiChat(opts: {
  supabase: ReturnType<typeof createClientComponentClient>
  threadId: string
  message?: string | null
  activeChannelId?: number | null
  mode?: "build_component" | "build_briefing"
  componentId?: string | null
  autoRun?: boolean  // Always false for UI usage
  attachments?: AiChatRequest['attachments']
}): Promise<AiChatResponse>
```

**Usage Example:**
```typescript
const response = await callAiChat({
  supabase,
  threadId: "thread-uuid",
  message: "User's message",
  activeChannelId: 123,
  autoRun: false,  // Manual mode
})
```

### 2. Updated Hook (`features/ai-chat/hooks.ts`)

Simplified hook for building AI content:

```typescript
export function useAiBuildContent() {
  return useCallback(async ({
    taskId,
    channelId,
    taskChannelComponentId,  // task_channel_components.id (UUID)
    isFullBriefing = false,
  }: {
    taskId: number
    channelId: number
    taskChannelComponentId?: string | null
    isFullBriefing?: boolean
  }) => {
    // ... implementation
  }, [supabase, queryClient])
}
```

**Key Changes:**
- Removed manual instruction building
- Passes `task_channel_components.id` (UUID) instead of `briefing_component_id`
- Uses `mode: "build_component"` or `mode: "build_briefing"`
- Always sets `auto_run: false`

### 3. Content Tab Integration (`features/tasks/components/TaskContentTab.tsx`)

Updated `handleBuildWithAI` function to:

#### Component-Level Build

```typescript
// Open AI chat pane
const newParams = new URLSearchParams(searchParams.toString())
newParams.set('middleView', 'ai-build')
router.push(`${pathname}?${newParams.toString()}`, { scroll: false })

// Check if component has task_component_id (UUID)
if (!component.task_component_id) {
  throw new Error('Component must be added to task first.')
}

// Call AI with component mode
const result = await aiBuildContent({
  taskId,
  channelId: selectedChannelId,
  taskChannelComponentId: component.task_component_id,  // UUID
  isFullBriefing: false,
})

// Content is displayed in chat
// User must click "Apply to component" button to save
```

#### Full Briefing Build

```typescript
// Open AI chat pane
const newParams = new URLSearchParams(searchParams.toString())
newParams.set('middleView', 'ai-build')
router.push(`${pathname}?${newParams.toString()}`, { scroll: false })

// Call AI with briefing mode
const result = await aiBuildContent({
  taskId,
  channelId: selectedChannelId,
  isFullBriefing: true,
})

// Content is displayed in chat
// User must click "Apply to component" button to save to specific components
```

### 4. Chat Composer (`features/ai-chat/Composer.tsx`)

Updated for normal chat messages:

```typescript
// Use new Edge Function contract
const res = await fetch(`${SUPABASE_URL}/functions/v1/ai-chat`, {
  method: 'POST',
  headers: {
    Authorization: `Bearer ${session?.access_token}`,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({ 
    thread_id: threadId, 
    message: trimmed || null,
    attachments,
    active_channel_id: activeChannelId ?? null,
    mode: null,        // No mode for plain chat
    component_id: null,
    auto_run: false,   // Manual chat - no DB writes
  }),
})
```

## Three Main Flows

### Flow 1: Normal Chat

**User Action:** Types a message in the AI panel and clicks "Send"

**Process:**
1. Chat pane is already open
2. User enters arbitrary text
3. Frontend calls `ai-chat` with:
   - `message`: User's text
   - `active_channel_id`: Current channel
   - `mode`: null
   - `auto_run`: false
4. AI responds with generated content
5. Response is displayed in chat
6. No automatic DB writes

**Code:**
```typescript
await callAiChat({
  supabase,
  threadId,
  message: userText,
  activeChannelId: currentChannelId,
  // No mode, autoRun defaults to false
})
```

### Flow 2: Build Component

**User Action:** Clicks "Build with AI" on a specific component

**Process:**
1. Frontend opens AI chat pane (sets `middleView: 'ai-build'`)
2. Frontend validates component has `task_component_id`
3. Calls `ai-chat` with:
   - `mode`: "build_component"
   - `component_id`: `task_channel_components.id` (UUID)
   - `message`: "" (empty - server builds instruction)
   - `auto_run`: false
4. Edge Function builds instruction from component metadata
5. AI generates content
6. Frontend shows content in chat
7. User clicks "Apply to component" button in chat
8. Frontend saves to `task_component_outputs` via ComponentPicker dialog

**Code:**
```typescript
// Open AI chat pane
const newParams = new URLSearchParams(searchParams.toString())
newParams.set('middleView', 'ai-build')
router.push(`${pathname}?${newParams.toString()}`, { scroll: false })

const result = await aiBuildContent({
  taskId,
  channelId,
  taskChannelComponentId: component.task_component_id,
  isFullBriefing: false,
})

// Content displayed in chat
// User clicks "Apply to component" in MessageBubble to save
```

### Flow 3: Build Full Briefing

**User Action:** Clicks "Build full briefing with AI" button

**Process:**
1. Frontend opens AI chat pane (sets `middleView: 'ai-build'`)
2. Frontend validates selected components
3. Calls `ai-chat` with:
   - `mode`: "build_briefing"
   - `message`: "" (empty - server builds instruction)
   - `auto_run`: false
4. Edge Function builds instruction from all selected components
5. AI generates content for all components in one response
6. Frontend shows full content in chat
7. User clicks "Apply to component" button in chat
8. User selects which component to apply content to
9. Frontend saves to `task_component_outputs` via ComponentPicker dialog

**Code:**
```typescript
// Open AI chat pane
const newParams = new URLSearchParams(searchParams.toString())
newParams.set('middleView', 'ai-build')
router.push(`${pathname}?${newParams.toString()}`, { scroll: false })

const result = await aiBuildContent({
  taskId,
  channelId,
  isFullBriefing: true,
})

// Content displayed in chat
// User can apply to components using "Apply to component" button
// ComponentPicker dialog lets user select which component to save to
```

## Content Saving

All content saving is done explicitly by the frontend using direct Supabase calls:

```typescript
await supabase
  .from("task_component_outputs")
  .upsert({
    task_id: taskId,
    channel_id: channelId,
    briefing_component_id: componentId,
    content_text: aiGeneratedText,
    updated_at: new Date().toISOString(),
  }, {
    onConflict: "task_id,channel_id,briefing_component_id",
  })
```

**This ensures:**
- User has full control over when content is saved
- No unexpected DB writes from the AI
- Clear separation between AI generation and persistence

## Project Creation Modes

Projects have a `creation_mode` field with three values:
1. **manual** - Nothing is pre-generated
2. **human_loop** - Content created early requires human review
3. **autopilot** - AI generates content automatically

**Important:** The Edge Function only executes DB-writing tools when:
```typescript
auto_run === true && 
project_creation_mode in ("autopilot", "human_loop")
```

For all UI interactions, we pass `auto_run: false`, so tools are never executed regardless of the project's creation mode.

## State Management

The Content Tab maintains:
- `taskId: number` - Current task
- `projectId: number` - Current project
- `selectedChannelId: number | null` - Active channel
- `threadId: string` - AI thread for this task
- `components: TaskChannelComponent[]` - Available components

Each `TaskChannelComponent` has:
- `task_component_id: string | null` - UUID (required for AI build)
- `briefing_component_id: number | null` - For saving output
- `project_component_id: number | null` - Alternative ID
- `title, description, purpose, guidance` - Metadata

## Error Handling

### Component Not Added to Task

If a component doesn't have `task_component_id`:
```typescript
if (!component.task_component_id) {
  throw new Error('Component must be added to task first. Please select the component.')
}
```

**Solution:** User must select/toggle the component to add it to the task.

### No Channel Selected

```typescript
if (!selectedChannelId) {
  toast({
    title: 'Missing information',
    description: 'Please ensure a channel is selected',
    variant: 'destructive'
  })
  return
}
```

### AI Generation Failed

All errors are caught and displayed to the user:
```typescript
catch (err: any) {
  console.error('Failed to generate AI content:', err)
  toast({
    title: 'AI generation failed',
    description: err.message || 'Failed to generate content',
    variant: 'destructive'
  })
}
```

## Testing Checklist

### ✅ Normal Chat
- [ ] User can type messages in AI panel
- [ ] Messages are sent to Edge Function
- [ ] AI responses appear in chat
- [ ] No DB writes occur automatically
- [ ] `auto_run: false` is passed

### ✅ Build Component
- [ ] "Build with AI" button appears on components
- [ ] Clicking button generates content for that component
- [ ] Component must have `task_component_id` (be added to task)
- [ ] Content appears in chat
- [ ] Content is saved explicitly when user applies it
- [ ] `mode: "build_component"` is passed
- [ ] `component_id` is the UUID from `task_channel_components`
- [ ] `auto_run: false` is passed

### ✅ Build Full Briefing
- [ ] "Build full briefing" button appears above components
- [ ] Clicking button generates content for all selected components
- [ ] Content is parsed correctly per component
- [ ] Each component's content is saved explicitly
- [ ] `mode: "build_briefing"` is passed
- [ ] `auto_run: false` is passed

### ✅ Content Persistence
- [ ] Content is saved to `task_component_outputs`
- [ ] Upsert conflict resolution works
- [ ] Content persists after page reload
- [ ] Each channel maintains separate outputs

## Migration Notes

### Breaking Changes

1. **Component ID Type Change**
   - Old: `briefing_component_id: number`
   - New: `task_component_id: string` (UUID)
   - Reason: Edge Function needs the actual `task_channel_components.id`

2. **Mode Parameter**
   - Old: Built instructions manually in FE
   - New: Pass `mode: "build_component" | "build_briefing"`
   - Reason: Server builds instructions from DB metadata

3. **Auto Run**
   - Old: Not specified
   - New: Always `auto_run: false` for UI
   - Reason: Prevent automatic DB writes

### Backward Compatibility

The old `sendToAI` function in `features/ai-chat/ai-utils.ts` has been updated to support the new contract while maintaining backward compatibility with existing chat UI.

## Summary

The integration now:
- ✅ Uses the refactored `ai-chat` Edge Function
- ✅ Passes `auto_run: false` for all UI interactions
- ✅ Lets the server build instructions from DB metadata
- ✅ Handles content saving explicitly from the FE
- ✅ Supports three distinct modes: chat, component build, full briefing
- ✅ Provides clear error messages for edge cases
- ✅ Maintains proper separation between AI generation and persistence

