import fs from 'node:fs';

const chatPath = 'supabase/functions/ai-chat/index.ts';
const meterPath = 'supabase/functions/ai-context-meter/index.ts';

function patchFile(path, patches) {
  let text = fs.readFileSync(path, 'utf8');
  for (const { from, to, label } of patches) {
    const count = text.split(from).length - 1;
    if (count !== 1) throw new Error(`${label}: expected exactly one match, found ${count}`);
    text = text.replace(from, to);
  }
  fs.writeFileSync(path, text);
}

patchFile(chatPath, [
  {
    label: 'track max active context',
    from: `  let usage: any = null;\n  let markedFirstToken = false;\n  const streamStartedAtMs = args.streamStartedAtMs ?? performance.now();`,
    to: `  let usage: any = null;\n  let markedFirstToken = false;\n  let maxContextEstimatedTokens = estimateContextTokens({ messages: conversation, tools: args.tools });\n  const streamStartedAtMs = args.streamStartedAtMs ?? performance.now();`,
  },
  {
    label: 'measure each tool round context',
    from: `    if (!isOpenRouter) payload.stream_options = { include_usage: true };\n\n    args.trace.mark(\`${'${args.provider}'}_round_${'${round + 1}'}_request\`);`,
    to: `    if (!isOpenRouter) payload.stream_options = { include_usage: true };\n    maxContextEstimatedTokens = Math.max(\n      maxContextEstimatedTokens,\n      estimateContextTokens({ messages: conversation, tools: args.tools }),\n    );\n\n    args.trace.mark(\`${'${args.provider}'}_round_${'${round + 1}'}_request\`);`,
  },
  {
    label: 'return active context measurement',
    from: `    usage,\n    streamStats: args.streamStats ?? null,\n  };`,
    to: `    usage,\n    maxContextEstimatedTokens,\n    streamStats: args.streamStats ?? null,\n  };`,
  },
  {
    label: 'persist arg active context',
    from: `  contextComposition?: Record<string, number> | null;\n  contextLimit?: number | null;\n}) {`,
    to: `  contextComposition?: Record<string, number> | null;\n  contextLimit?: number | null;\n  contextActiveEstimatedTokens?: number | null;\n}) {`,
  },
  {
    label: 'persist active context metrics',
    from: `        context_composition: args.contextComposition ?? null,\n        context_limit: args.contextLimit ?? null,\n        context_estimated_prompt_tokens: args.contextComposition?.total_estimated_tokens ?? null,`,
    to: `        context_composition: args.contextComposition\n          ? {\n              ...args.contextComposition,\n              active_tool_loop: Math.max(0, (args.contextActiveEstimatedTokens ?? 0) - (args.contextComposition.total_estimated_tokens ?? 0)),\n            }\n          : null,\n        context_limit: args.contextLimit ?? null,\n        context_estimated_prompt_tokens: args.contextComposition?.total_estimated_tokens ?? null,\n        context_active_estimated_tokens: args.contextActiveEstimatedTokens ?? args.contextComposition?.total_estimated_tokens ?? null,`,
  },
  {
    label: 'pass active context measurement',
    from: `        contextComposition, contextLimit: modelContextLimit,\n      });`,
    to: `        contextComposition, contextLimit: modelContextLimit,\n        contextActiveEstimatedTokens: result.maxContextEstimatedTokens ?? contextComposition.total_estimated_tokens,\n      });`,
  },
]);

patchFile(meterPath, [
  {
    label: 'active context meter calculation',
    from: `  const promptTokens = Math.round(positiveNumber(latest.metrics?.usage_prompt_tokens) ?? 0)\n  const modelProvider = String(latest.model_provider ?? "")\n  const modelName = String(latest.model_name ?? "")\n  const measuredContextLimit = positiveNumber(latest.metrics?.context_limit)\n  const contextLimit = measuredContextLimit ?? await resolveContextLimit(modelProvider, modelName)\n  const percentUsed = contextLimit ? Math.min(100, (promptTokens / contextLimit) * 100) : null\n  const cachedPromptTokens = Math.round(Number(latest.metrics?.cached_prompt_tokens ?? 0) || 0)\n  const cacheWriteTokens = Math.round(Number(latest.metrics?.cache_write_tokens ?? 0) || 0)\n  const cacheHitRate = promptTokens > 0 ? cachedPromptTokens / promptTokens : null`,
    to: `  const providerPromptTokensTotal = Math.round(positiveNumber(latest.metrics?.usage_prompt_tokens) ?? 0)\n  const activePromptTokens = Math.round(\n    positiveNumber(latest.metrics?.context_active_estimated_tokens)\n      ?? positiveNumber(latest.metrics?.context_estimated_prompt_tokens)\n      ?? providerPromptTokensTotal,\n  )\n  const modelProvider = String(latest.model_provider ?? "")\n  const modelName = String(latest.model_name ?? "")\n  const measuredContextLimit = positiveNumber(latest.metrics?.context_limit)\n  const contextLimit = measuredContextLimit ?? await resolveContextLimit(modelProvider, modelName)\n  const percentUsed = contextLimit ? Math.min(100, (activePromptTokens / contextLimit) * 100) : null\n  const cachedPromptTokens = Math.round(Number(latest.metrics?.cached_prompt_tokens ?? 0) || 0)\n  const cacheWriteTokens = Math.round(Number(latest.metrics?.cache_write_tokens ?? 0) || 0)\n  const cacheHitRate = providerPromptTokensTotal > 0 ? cachedPromptTokens / providerPromptTokensTotal : null`,
  },
  {
    label: 'active context meter response',
    from: `      prompt_tokens: promptTokens,\n      context_limit: contextLimit,`,
    to: `      prompt_tokens: activePromptTokens,\n      provider_prompt_tokens_total: providerPromptTokensTotal,\n      context_limit: contextLimit,`,
  },
]);

console.log('active context measurement patch applied');
