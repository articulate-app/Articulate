import fs from 'node:fs'

function patchFile(path, replacements) {
  let source = fs.readFileSync(path, 'utf8')
  for (const [from, to, label] of replacements) {
    if (!source.includes(from)) {
      throw new Error(`${path}: missing patch target: ${label}`)
    }
    source = source.replace(from, to)
  }
  fs.writeFileSync(path, source)
}

patchFile('features/ai-chat/ChatWindow.tsx', [
  [
    'className="relative min-h-0 flex-1 overflow-x-hidden overflow-y-auto"',
    'className="relative min-h-0 flex-1 scroll-pb-32 overflow-x-hidden overflow-y-auto"',
    'scroll padding',
  ],
  [
    'className={`${CHAT_CONTENT_COLUMN_CLASS} space-y-4 pb-4${',
    'className={`${CHAT_CONTENT_COLUMN_CLASS} space-y-4 pb-28${',
    'bottom scroll room',
  ],
  [
    'className="z-10 shrink-0 border-t border-gray-100 bg-white"',
    'className="z-10 shrink-0 bg-white"',
    'extra composer divider',
  ],
  [
    'className="absolute bottom-4 right-4 z-10 inline-flex h-9 w-9 items-center justify-center rounded-full border border-border bg-background text-foreground shadow-md transition-colors hover:bg-accent"',
    'className="absolute bottom-32 right-4 z-20 inline-flex h-9 w-9 items-center justify-center rounded-full border border-border bg-background text-foreground shadow-md transition-colors hover:bg-accent md:bottom-28"',
    'jump-to-bottom position',
  ],
])

patchFile('features/ai-chat/Composer.tsx', [
  [
`            {isAssistantStreaming ? (\n              <button\n                type="button"\n                onClick={() => {\n                  const runId = inFlightTurnRef?.current?.runId\n                  if (runId) {\n                    void cancelAiChatRun(runId).finally(() => {\n                      streamAbortRef?.current?.abort()\n                    })\n                    return\n                  }\n                  streamAbortRef?.current?.abort()\n                }}\n                className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-gray-900 text-white hover:bg-gray-800"\n                aria-label="Stop generating"\n                title="Stop generating"\n              >\n                <Square className="h-3 w-3 fill-current" />\n              </button>\n            ) : (`,
`            {isAssistantStreaming ? (\n              <>\n                <button\n                  type="button"\n                  onClick={() => void send()}\n                  disabled={isSendBlockedByUsage}\n                  className="inline-flex h-6 w-6 items-center justify-center rounded-full border border-gray-200 bg-white text-gray-700 hover:bg-gray-50 disabled:opacity-50"\n                  aria-label="Queue message"\n                  title={isSendBlockedByUsage ? "Daily AI token limit reached" : "Queue message"}\n                >\n                  <ArrowUp className="h-3.5 w-3.5" />\n                </button>\n                <button\n                  type="button"\n                  onClick={() => {\n                    const runId = inFlightTurnRef?.current?.runId\n                    if (runId) {\n                      void cancelAiChatRun(runId).finally(() => {\n                        streamAbortRef?.current?.abort()\n                      })\n                      return\n                    }\n                    streamAbortRef?.current?.abort()\n                  }}\n                  className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-gray-900 text-white hover:bg-gray-800"\n                  aria-label="Stop generating"\n                  title="Stop generating"\n                >\n                  <Square className="h-3 w-3 fill-current" />\n                </button>\n              </>\n            ) : (`,
    'queue button while streaming',
  ],
])

patchFile('features/ai-chat/AiChatUsageIndicator.tsx', [
  [
    '{formatExactTokenCount(context.prompt_tokens)} tokens in the latest model input',
    '{formatCompactTokenCount(context.prompt_tokens)} tokens in the latest model input',
    'compact context prompt tokens',
  ],
  [
    '{Math.round(contextPercent ?? 0)}% of {formatExactTokenCount(context.context_limit)} available',
    '{Math.round(contextPercent ?? 0)}% of {formatCompactTokenCount(context.context_limit)} available',
    'compact context limit',
  ],
  [
    '{formatExactTokenCount(Number(value ?? 0))}',
    '{formatCompactTokenCount(Number(value ?? 0))}',
    'compact context composition',
  ],
  [
    '{formatExactTokenCount(context.cached_prompt_tokens)}',
    '{formatCompactTokenCount(context.cached_prompt_tokens)}',
    'compact cached input',
  ],
  [
    '{formatExactTokenCount(context.cache_write_tokens)}',
    '{formatCompactTokenCount(context.cache_write_tokens)}',
    'compact cache write',
  ],
])

patchFile('app/components/comments-section/task-comments-panel.tsx', [
  [
    'className="flex h-9 min-w-0 flex-1 items-center rounded-md border border-gray-200 bg-white px-3 text-left text-sm text-muted-foreground hover:border-gray-300 hover:bg-gray-50"',
    'className="flex h-9 min-w-0 flex-1 cursor-text items-center rounded-md border border-gray-200 bg-white px-3 text-left text-sm text-muted-foreground hover:border-gray-300 hover:bg-gray-50"',
    'collapsed comment text cursor',
  ],
])

console.log('AI chat main UI patch applied')
