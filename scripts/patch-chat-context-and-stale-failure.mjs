import fs from "node:fs"

function patchFile(path, replacements) {
  let source = fs.readFileSync(path, "utf8")
  let changed = false
  for (const { label, search, replacement } of replacements) {
    if (source.includes(replacement)) continue
    if (!source.includes(search)) throw new Error(`${path}: patch anchor not found: ${label}`)
    source = source.replace(search, replacement)
    changed = true
    console.log(`patched ${path}: ${label}`)
  }
  if (changed) fs.writeFileSync(path, source)
}

patchFile("features/ai-chat/AiChatUsageIndicator.tsx", [
  {
    label: "remove URL-derived thread dependency",
    search: 'import { useSearchParams } from "next/navigation"\n',
    replacement: '',
  },
  {
    label: "add thread id prop",
    search: 'type AiChatUsageIndicatorProps = {\n  usage: AiChatUsageSnapshot | null | undefined\n  isLoading?: boolean\n}',
    replacement: 'type AiChatUsageIndicatorProps = {\n  threadId?: string | null\n  usage: AiChatUsageSnapshot | null | undefined\n  isLoading?: boolean\n}',
  },
  {
    label: "consume thread id prop",
    search: 'export function AiChatUsageIndicator({ usage, isLoading }: AiChatUsageIndicatorProps) {\n  const searchParams = useSearchParams()',
    replacement: 'export function AiChatUsageIndicator({ threadId, usage, isLoading }: AiChatUsageIndicatorProps) {',
  },
  {
    label: "remove search params thread lookup",
    search: '  const strictest = pickStricterUsageScope(usage)\n  const threadId =\n    searchParams.get("aiThreadId")\n    ?? searchParams.get("threadId")\n    ?? searchParams.get("ai_thread_id")',
    replacement: '  const strictest = pickStricterUsageScope(usage)\n  const activeThreadId = threadId?.trim() || null',
  },
  {
    label: "use active thread id in context request",
    search: '    if (!threadId) {\n      setContext(null)',
    replacement: '    if (!activeThreadId) {\n      setContext(null)',
  },
  {
    label: "context meter request thread",
    search: 'const url = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/ai-context-meter?thread_id=${encodeURIComponent(threadId)}`',
    replacement: 'const url = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/ai-context-meter?thread_id=${encodeURIComponent(activeThreadId)}`',
  },
  {
    label: "context effect dependency",
    search: '  }, [threadId, usage?.user.used_tokens, usage?.team.used_tokens])',
    replacement: '  }, [activeThreadId, usage?.user.used_tokens, usage?.team.used_tokens])',
  },
])

patchFile("features/ai-chat/Composer.tsx", [
  {
    label: "pass composer thread to context meter",
    search: '<AiChatUsageIndicator usage={threadUsage} isLoading={isThreadUsageLoading} />',
    replacement: '<AiChatUsageIndicator threadId={threadId} usage={threadUsage} isLoading={isThreadUsageLoading} />',
  },
])

patchFile("features/ai-chat/ChatWindow.tsx", [
  {
    label: "hide superseded historical transient failure cards",
    search: '                runFailureCard={\n                  m.role === "assistant"\n                  && (m as InFlightAssistantMessage).terminal_state',
    replacement: '                runFailureCard={\n                  m.role === "assistant"\n                  // A failed turn remains in run history, but once the user has\n                  // continued successfully it should not stay as a live Retry card.\n                  && messageIndex > latestUserMessageIndex\n                  && (m as InFlightAssistantMessage).terminal_state',
  },
])

console.log("chat context/stale failure patch complete")
