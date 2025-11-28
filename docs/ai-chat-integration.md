# AI Chat Integration Documentation

## Overview

This document describes the AI chat integration that connects the `ai-chat` Supabase Edge Function with the frontend. The integration allows users to generate content for task components using AI, either at the component level or for full briefings.

## Architecture

### Components

1. **AI Utilities** (`features/ai-chat/ai-utils.ts`)
   - Core utility functions for AI operations
   - Thread management
   - Message sending
   - Content application

2. **AI Hooks** (`features/ai-chat/hooks.ts`)
   - React hooks for AI functionality
   - `useAiBuildContent`: Main hook for generating AI content

3. **Task Content Tab** (`features/tasks/components/TaskContentTab.tsx`)
   - Integrated "Build with AI" buttons
   - Component-level and full-briefing generation

4. **Message Bubble** (`features/ai-chat/MessageBubble.tsx`)
   - Enhanced with "Apply to component" button
   - Shows when in task context with active channel

5. **Component Picker** (`features/ai-chat/ComponentPicker.tsx`)
   - Dialog for selecting which component to apply AI-generated content to

## Features

### 1. Thread Management

**Function**: `ensureAiThread({ taskId, channelId })`

- Checks if an AI thread exists for a task
- Reuses existing thread if found
- Creates a new thread with `scope = 'task'` if needed
- Returns the thread ID

**Location**: `features/ai-chat/ai-utils.ts`

### 2. Sending Messages to AI

**Function**: `sendToAI({ threadId, message, activeChannelId, attachments })`

- Sends a message to the `ai-chat` edge function
- Automatically includes authentication
- Passes the active channel ID for context
- Returns the AI response

**Location**: `features/ai-chat/ai-utils.ts`

### 3. Instruction String Builders

#### Component-Level Generation

**Function**: `buildInstructionForComponent({ component, task, context })`

Builds an instruction string that includes:
- Component title and description
- Purpose and guidance
- Suggested word count
- Context about previous components in the thread

#### Full-Briefing Generation

**Function**: `buildInstructionForFullBriefing({ components, task, briefingTitle, context })`

Builds an instruction string that includes:
- Task title
- Briefing type
- All selected components with their descriptions
- Position order requirements
- Request to separate components clearly

**Location**: `features/ai-chat/ai-utils.ts`

### 4. "Build with AI" Buttons

#### Component-Level Button

**Location**: Individual component items in TaskContentTab

**Functionality**:
1. Finds the component by ID
2. Builds component-specific instruction
3. Calls AI to generate content
4. Applies content directly to the component
5. Reloads the component output

#### Full-Briefing Button

**Location**: Above the briefing type selector in TaskContentTab

**Functionality**:
1. Gathers all selected components
2. Builds full-briefing instruction
3. Calls AI to generate content for all components
4. Parses the response to extract content for each component
5. Applies content to all components
6. Reloads all component outputs

### 5. "Apply to Component" Feature

**Location**: AI message bubbles in chat window

**Functionality**:
1. Shows button on assistant messages when in task context with active channel
2. Opens a dialog to select which component to apply content to
3. Fetches available components for the task × channel
4. Applies the AI-generated content to the selected component
5. Uses the `ai_upsert_component_output` RPC function

**Location**: `features/ai-chat/ComponentPicker.tsx`

## Data Flow

### Component-Level Generation Flow

```
User clicks "Build with AI" on component
  → handleBuildWithAI(componentId)
    → ensureAiThread({ taskId, channelId })
      → Returns existing or creates new thread
    → buildInstructionForComponent(...)
      → Creates instruction string
    → aiBuildContent({ ... })
      → Sends to edge function
    → applyToComponent({ ... })
      → Saves to task_component_outputs
    → fetchComponentOutput(componentId)
      → Reloads component to show new content
```

### Full-Briefing Generation Flow

```
User clicks "Build with AI" for full briefing
  → handleBuildWithAI() [no componentId]
    → ensureAiThread({ taskId, channelId })
    → buildInstructionForFullBriefing(...)
      → Creates instruction for all components
    → aiBuildContent({ isFullBriefing: true })
      → Sends to edge function
    → parseAIResponse(aiContent, componentTitles)
      → Extracts content for each component
    → Promise.all(applyToComponent for each component)
      → Saves all components
    → Promise.all(fetchComponentOutput for each)
      → Reloads all components
```

### Apply to Component Flow

```
User clicks "Apply to component" on AI message
  → ComponentPicker dialog opens
    → Fetches components via tc_components_for_task_channel
    → User selects component
  → handleApply()
    → applyToComponent({ taskId, channelId, briefingComponentId, contentText })
      → Calls ai_upsert_component_output RPC
    → Success toast
    → Dialog closes
```

## Database Integration

### Views/Functions Used

1. **`tc_components_for_task_channel`** (RPC)
   - Fetches components for a task × channel combination
   - Returns selected and unselected components

2. **`task_component_outputs`** (Table)
   - Stores the generated content for each component
   - Key: (task_id, channel_id, briefing_component_id)

3. **`ai_threads`** (Table)
   - Stores AI conversation threads
   - Scoped to task, project, or global

4. **`ai_messages`** (Table)
   - Stores individual messages in threads

5. **`v_ai_thread_context_live`** (View)
   - Provides live context for AI threads
   - Automatically fetched by edge function

### RPC Functions

#### `ai_upsert_component_output`

**Purpose**: Insert or update component output

**Parameters**:
- `task_id`: number
- `channel_id`: number
- `briefing_component_id`: number
- `content_text`: string

**Location**: Called in `applyToComponent` function

## Edge Function Integration

### Request Format

```typescript
POST /functions/v1/ai-chat

Headers:
  Authorization: Bearer <access_token>
  Content-Type: application/json

Body:
{
  "thread_id": string,
  "message": string,
  "attachments": Array<AiAttachmentMeta> (optional),
  "active_channel_id": number (optional)
}
```

### Response Format

```typescript
{
  "id": string,
  "thread_id": string,
  "role": "assistant",
  "content": string,
  "created_at": string,
  // ... other message fields
}
```

## Key Implementation Details

### 1. Context Preservation

- The edge function automatically fetches `v_ai_thread_context_live`
- Frontend does NOT need to rebuild system prompts
- Frontend only sends: `thread_id`, `message`, `active_channel_id`

### 2. Thread Reuse

- One thread per task (not per channel)
- Thread accumulates context across all channels
- `active_channel_id` parameter provides current channel context

### 3. Content Parsing

For full-briefing generation:
- AI returns all components in one response
- `parseAIResponse` function extracts content by component title
- Handles multiple heading formats: `# Title`, `## Title`, `**Title**`
- Falls back to returning full content for first component if parsing fails

### 4. Loading States

- `isGeneratingAI`: Global loading state for AI generation
- `loadingOutputs`: Set of component IDs currently being loaded
- Prevents duplicate requests
- Shows loading spinners on components

## Testing Guide

### 1. Component-Level Generation

**Test Steps**:
1. Navigate to a task with components
2. Select a channel
3. Select a briefing type (or use project defaults)
4. Expand a component
5. Click "Build with AI" button on the component
6. Wait for AI to generate content
7. Verify content appears in the component editor
8. Verify "Last updated" timestamp is shown

**Expected Behavior**:
- Loading spinner appears on the component
- Toast notification shows success
- Generated content appears in the rich text editor
- Content is automatically saved

### 2. Full-Briefing Generation

**Test Steps**:
1. Navigate to a task with multiple components
2. Select a channel
3. Select a briefing type
4. Ensure multiple components are selected
5. Click "Build with AI" button above the briefing selector
6. Wait for AI to generate content
7. Verify all components receive content
8. Verify content is different for each component

**Expected Behavior**:
- Loading spinners appear on all selected components
- Toast notification shows number of components generated
- Each component receives appropriate content
- Content respects component descriptions and order

### 3. Freeform Chat

**Test Steps**:
1. Open AI chat panel
2. Type a custom message
3. Send message
4. Receive AI response
5. Click "Apply to component" button
6. Select a component from the dropdown
7. Click "Apply to Component"
8. Verify content is applied

**Expected Behavior**:
- AI responds to custom message
- "Apply to component" button appears on assistant messages
- Component picker shows available components
- Selected component receives the content
- Success toast appears

### 4. Thread Continuity

**Test Steps**:
1. Generate content for one component
2. Generate content for another component
3. Verify AI references previous component in second generation

**Expected Behavior**:
- Same thread is reused
- AI has context of previous messages
- Generated content shows awareness of earlier components

### 5. Channel Switching

**Test Steps**:
1. Generate content for a component in one channel
2. Switch to a different channel
3. Verify components for new channel are shown
4. Generate content for a component in new channel
5. Switch back to first channel
6. Verify original content is preserved

**Expected Behavior**:
- Each channel maintains its own component outputs
- Content persists across channel switches
- AI thread is shared but outputs are channel-specific

## Error Handling

### Missing Channel
- Shows toast: "Missing information - Please ensure a channel is selected"
- Does not attempt generation

### Missing Task Title
- Automatically fetched on component mount
- Shows toast if fetch fails

### Component Not Found
- Shows toast: "Component not found"
- Does not attempt generation

### No Components Selected
- Shows toast: "No components selected"
- Only for full-briefing generation

### AI Generation Failed
- Shows toast with error message
- Clears loading states
- Preserves existing content

### RPC Call Failed
- Shows toast: "Failed to apply content"
- Logs error to console
- Does not update UI state

## Future Enhancements

### Potential Improvements

1. **Streaming Responses**
   - Show AI content as it's being generated
   - Better user experience for long content

2. **Multi-Component Selection**
   - Allow selecting multiple components for "Apply to component"
   - Split content across selected components

3. **Content Editing Before Apply**
   - Show preview dialog
   - Allow user to edit before applying
   - Add formatting options

4. **History and Undo**
   - Track content versions
   - Allow reverting to previous versions
   - Show generation history

5. **Custom Instructions**
   - Allow users to add custom instructions
   - Save common instruction templates
   - Project-level instruction defaults

6. **Quality Checks**
   - Word count validation
   - SEO keyword integration
   - Readability scores

## Troubleshooting

### Content Not Appearing

**Possible Causes**:
- Channel not selected
- Component not properly selected
- Database permission issue
- RPC function error

**Solution**:
1. Check browser console for errors
2. Verify channel is selected
3. Verify component has `briefing_component_id` or `project_component_id`
4. Check database logs

### AI Not Responding

**Possible Causes**:
- Edge function not deployed
- Authentication token expired
- Rate limiting
- Model API down

**Solution**:
1. Check edge function logs
2. Verify Supabase authentication
3. Check model provider status
4. Retry after short delay

### Thread Not Found

**Possible Causes**:
- Thread creation failed
- RLS policy blocking access
- Thread was deleted

**Solution**:
1. Check `ensureAiThread` function
2. Verify RLS policies on `ai_threads` table
3. Check if user has permission to create threads

### Parsing Issues

**Possible Causes**:
- AI returned unexpected format
- Component titles don't match
- Multiple components with similar titles

**Solution**:
1. Check `parseAIResponse` function
2. Verify component titles are unique
3. Improve AI instruction to use exact titles
4. Add fallback to manual component selection

## Code References

### Key Files

- `features/ai-chat/ai-utils.ts` - Core AI utilities
- `features/ai-chat/hooks.ts` - React hooks for AI
- `features/ai-chat/ComponentPicker.tsx` - Component selection dialog
- `features/ai-chat/MessageBubble.tsx` - Message UI with actions
- `features/ai-chat/ChatWindow.tsx` - Chat interface
- `features/tasks/components/TaskContentTab.tsx` - Main task content UI

### Key Functions

- `ensureAiThread()` - Thread management
- `sendToAI()` - Message sending
- `buildInstructionForComponent()` - Component instruction builder
- `buildInstructionForFullBriefing()` - Full briefing instruction builder
- `applyToComponent()` - Apply content to component
- `parseAIResponse()` - Parse multi-component responses
- `useAiBuildContent()` - React hook for building content
- `handleBuildWithAI()` - Main handler in TaskContentTab

## Conclusion

This integration provides a seamless experience for AI-assisted content generation within the task management system. It leverages the power of AI while maintaining proper separation between channels, components, and threads. The implementation follows React best practices and integrates cleanly with the existing Supabase infrastructure.

