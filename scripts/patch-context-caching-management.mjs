import fs from 'node:fs';

const chatPath = 'supabase/functions/ai-chat/index.ts';
const meterPath = 'supabase/functions/ai-context-meter/index.ts';

function replaceOnce(text, from, to, label) {
  const count = text.split(from).length - 1;
  if (count !== 1) throw new Error(`${label}: expected exactly one match, found ${count}`);
  return text.replace(from, to);
}

function replaceRegexOnce(text, regex, to, label) {
  const matches = [...text.matchAll(new RegExp(regex.source, regex.flags.includes('g') ? regex.flags : `${regex.flags}g`))];
  if (matches.length !== 1) throw new Error(`${label}: expected exactly one match, found ${matches.length}`);
  return text.replace(regex, to);
}

let chat = fs.readFileSync(chatPath, 'utf8');

chat = replaceOnce(
  chat,
  `  const cached = Math.max(0, Number(\n    usage.input_tokens_details?.cached_tokens ?? usage.prompt_tokens_details?.cached_tokens ?? 0,\n  ) || 0);\n  const cost = Math.max(0, Number(usage.cost ?? usage.total_cost ?? 0) || 0);`,
  `  const cached = Math.max(0, Number(\n    usage.input_tokens_details?.cached_tokens ?? usage.prompt_tokens_details?.cached_tokens ?? usage.cached_tokens ?? 0,\n  ) || 0);\n  const cacheWrite = Math.max(0, Number(\n    usage.cache_write_tokens ?? usage.input_tokens_details?.cache_write_tokens ?? usage.prompt_tokens_details?.cache_write_tokens ?? 0,\n  ) || 0);\n  const cost = Math.max(0, Number(usage.cost ?? usage.total_cost ?? 0) || 0);`,
  'normalizeProviderUsage cache fields',
);

chat = replaceOnce(
  chat,
  `    cached_prompt_tokens: Math.round(cached),\n    cost,`,
  `    cached_prompt_tokens: Math.round(cached),\n    cache_write_tokens: Math.round(cacheWrite),\n    cost,`,
  'normalizeProviderUsage return',
);

chat = replaceOnce(
  chat,
  `    p_cached_prompt_tokens: usage.cached_prompt_tokens,\n    p_total_tokens: usage.total_tokens,`,
  `    p_cached_prompt_tokens: usage.cached_prompt_tokens,\n    p_cache_write_tokens: usage.cache_write_tokens,\n    p_total_tokens: usage.total_tokens,`,
  'finalize cache write rpc',
);

chat = replaceOnce(
  chat,
  `    p_metadata: { usage_parse_failed: parseFailed },`,
  `    p_metadata: {\n      usage_parse_failed: parseFailed,\n      cache_write_tokens: usage.cache_write_tokens,\n      cache_hit_rate: usage.prompt_tokens > 0 ? usage.cached_prompt_tokens / usage.prompt_tokens : 0,\n    },`,
  'finalize cache metadata',
);

chat = replaceRegexOnce(
  chat,
  /let openRouterToolModelsCache: \{ expiresAt: number; models: Set<string> \} \| null = null;[\s\S]*?\n}\n\nconst modelPricingCache/,
  `type OpenRouterModelMetadata = { supportsTools: boolean; contextLength: number | null };\nlet openRouterModelMetadataCache: { expiresAt: number; models: Map<string, OpenRouterModelMetadata> } | null = null;\n\nasync function openRouterModelMetadata(model: string): Promise<OpenRouterModelMetadata> {\n  if (!OPENROUTER_API_KEY) return { supportsTools: false, contextLength: null };\n  const now = Date.now();\n  if (openRouterModelMetadataCache && openRouterModelMetadataCache.expiresAt > now) {\n    return openRouterModelMetadataCache.models.get(model) ?? { supportsTools: false, contextLength: null };\n  }\n  try {\n    const response = await fetch("https://openrouter.ai/api/v1/models", {\n      headers: { Authorization: \`Bearer \${OPENROUTER_API_KEY}\` },\n      signal: AbortSignal.timeout(10000),\n    });\n    if (!response.ok) throw new Error(\`openrouter_models_failed:\${response.status}\`);\n    const payload = await response.json();\n    const models = new Map<string, OpenRouterModelMetadata>();\n    for (const row of Array.isArray(payload?.data) ? payload.data : []) {\n      const id = String(row?.id ?? "").trim();\n      if (!id) continue;\n      const supported = Array.isArray(row?.supported_parameters)\n        ? row.supported_parameters.map((value: unknown) => String(value ?? "").trim())\n        : [];\n      const parsedContext = Number(row?.context_length);\n      models.set(id, {\n        supportsTools: supported.includes("tools"),\n        contextLength: Number.isFinite(parsedContext) && parsedContext > 0 ? Math.round(parsedContext) : null,\n      });\n    }\n    openRouterModelMetadataCache = { expiresAt: now + 5 * 60 * 1000, models };\n    return models.get(model) ?? { supportsTools: false, contextLength: null };\n  } catch (error) {\n    console.warn("ai-chat OpenRouter model metadata lookup failed", { model, error: String(error) });\n    return { supportsTools: false, contextLength: null };\n  }\n}\n\nasync function openRouterModelSupportsTools(model: string): Promise<boolean> {\n  return (await openRouterModelMetadata(model)).supportsTools;\n}\n\nfunction nativeModelContextLimit(provider: string, model: string): number | null {\n  if (provider !== "openai") return null;\n  if (model === "gpt-5.4-mini") return 400_000;\n  if (model === "gpt-5.5") return 1_050_000;\n  return null;\n}\n\nconst modelPricingCache`,
  'OpenRouter metadata cache',
);

chat = replaceOnce(
  chat,
  `    cached_prompt_tokens: a.cached_prompt_tokens + b.cached_prompt_tokens,\n    cost: (a.cost ?? 0) + (b.cost ?? 0),`,
  `    cached_prompt_tokens: a.cached_prompt_tokens + b.cached_prompt_tokens,\n    cache_write_tokens: a.cache_write_tokens + b.cache_write_tokens,\n    cost: (a.cost ?? 0) + (b.cost ?? 0),`,
  'mergeUsage cache write',
);

const estimateHelperAnchor = `function estimatePromptTokens(bodyText: string) {\n  // Reserve conservatively to keep concurrent requests from spending the same\n  // allowance. Provider-reported usage replaces this estimate after the call.\n  return Math.max(1, Math.ceil(new TextEncoder().encode(bodyText).byteLength / 3.2));\n}\n`;
chat = replaceOnce(
  chat,
  estimateHelperAnchor,
  `${estimateHelperAnchor}\nfunction estimateContextTokens(value: unknown): number {\n  if (value == null) return 0;\n  const text = typeof value === "string" ? value : JSON.stringify(value);\n  if (!text) return 0;\n  return Math.max(1, Math.ceil(new TextEncoder().encode(text).byteLength / 3.2));\n}\n\nfunction buildContextComposition(args: {\n  systemPrompt: string;\n  recentMessages: any[];\n  turnContextPrompt: string;\n  currentContent: any;\n  tools: any[];\n}) {\n  const summaryMessages = args.recentMessages.filter((message) =>\n    message?.role === "system" && String(message?.content ?? "").startsWith("SUMMARY OF EARLIER CONVERSATION")\n  );\n  const normalRecent = args.recentMessages.filter((message) => !summaryMessages.includes(message));\n  const composition = {\n    system: estimateContextTokens(args.systemPrompt),\n    tools: estimateContextTokens(args.tools),\n    summary: estimateContextTokens(summaryMessages),\n    recent_messages: estimateContextTokens(normalRecent),\n    turn_context: estimateContextTokens(args.turnContextPrompt),\n    current_request: estimateContextTokens(args.currentContent),\n  };\n  return {\n    ...composition,\n    total_estimated_tokens: Object.values(composition).reduce((sum, value) => sum + value, 0),\n  };\n}\n`,
  'context token helpers',
);

chat = replaceOnce(
  chat,
  `      model: args.model,\n      messages: conversation,\n      stream: true,\n    };`,
  `      model: args.model,\n      messages: conversation,\n      stream: true,\n    };\n    if (isOpenRouter) {\n      const sessionId = String(args.thread?.id ?? "").trim().slice(0, 256);\n      if (sessionId) payload.session_id = sessionId;\n    }`,
  'OpenRouter session id',
);

chat = replaceOnce(
  chat,
  `    cached_prompt_tokens: a.cached_prompt_tokens + b.cached_prompt_tokens,\n    cache_write_tokens: a.cache_write_tokens + b.cache_write_tokens,\n    cost: (a.cost ?? 0) + (b.cost ?? 0),`,
  `    cached_prompt_tokens: a.cached_prompt_tokens + b.cached_prompt_tokens,\n    cache_write_tokens: a.cache_write_tokens + b.cache_write_tokens,\n    cost: (a.cost ?? 0) + (b.cost ?? 0),`,
  'mergeUsage sanity',
);

chat = replaceOnce(
  chat,
  `  streamStats?: OutboundStreamStats | null;\n}) {`,
  `  streamStats?: OutboundStreamStats | null;\n  contextComposition?: Record<string, number> | null;\n  contextLimit?: number | null;\n}) {`,
  'persistAssistantMessage context args',
);

chat = replaceOnce(
  chat,
  `        usage_total_tokens: args.usage?.total_tokens ?? null,\n        build_ids: args.buildIds,`,
  `        usage_total_tokens: args.usage?.total_tokens ?? null,\n        cached_prompt_tokens: args.usage?.cached_prompt_tokens ?? 0,\n        cache_write_tokens: args.usage?.cache_write_tokens ?? 0,\n        cache_hit_rate: (args.usage?.prompt_tokens ?? 0) > 0\n          ? (args.usage?.cached_prompt_tokens ?? 0) / args.usage.prompt_tokens\n          : null,\n        context_composition: args.contextComposition ?? null,\n        context_limit: args.contextLimit ?? null,\n        context_estimated_prompt_tokens: args.contextComposition?.total_estimated_tokens ?? null,\n        build_ids: args.buildIds,`,
  'persist run context/cache metrics',
);

chat = replaceOnce(
  chat,
  `    const modelSupportsTools = resolvedModel.provider === "openrouter"\n      ? await openRouterModelSupportsTools(resolvedModel.model)\n      : resolvedModel.provider === "openai";\n    const selectedTools = modelSupportsTools ? MODEL_TOOLS : [];`,
  `    const openRouterMetadata = resolvedModel.provider === "openrouter"\n      ? await openRouterModelMetadata(resolvedModel.model)\n      : null;\n    const modelSupportsTools = resolvedModel.provider === "openrouter"\n      ? openRouterMetadata?.supportsTools === true\n      : resolvedModel.provider === "openai";\n    const modelContextLimit = resolvedModel.provider === "openrouter"\n      ? openRouterMetadata?.contextLength ?? null\n      : nativeModelContextLimit(resolvedModel.provider, resolvedModel.model);\n    const selectedTools = modelSupportsTools ? MODEL_TOOLS : [];`,
  'resolve model metadata',
);

chat = replaceOnce(
  chat,
  `    const modelMessages = [\n      { role: "system", content: systemPrompt },\n      ...recentMessages,\n      ...(turnContextPrompt ? [{ role: "system", content: turnContextPrompt }] : []),\n      ...(!modelSupportsTools ? [{ role: "system", content: "MODEL CAPABILITY: The explicitly selected model does not expose native function tools through OpenRouter. It remains available for conversation and content generation, but it cannot read or mutate workspace data in this run. Do not claim that a workspace change was applied." }] : []),\n      { role: "user", content: currentContent },\n    ];`,
  `    const modelMessages = [\n      { role: "system", content: systemPrompt },\n      ...recentMessages,\n      ...(turnContextPrompt ? [{ role: "system", content: turnContextPrompt }] : []),\n      ...(!modelSupportsTools ? [{ role: "system", content: "MODEL CAPABILITY: The explicitly selected model does not expose native function tools through OpenRouter. It remains available for conversation and content generation, but it cannot read or mutate workspace data in this run. Do not claim that a workspace change was applied." }] : []),\n      { role: "user", content: currentContent },\n    ];\n    const contextComposition = buildContextComposition({\n      systemPrompt,\n      recentMessages,\n      turnContextPrompt,\n      currentContent,\n      tools: selectedTools,\n    });`,
  'build context composition',
);

chat = replaceOnce(
  chat,
  `        clarification: result.clarification, latencyMs, scope, streamStats: result.streamStats ?? streamStats,\n      });`,
  `        clarification: result.clarification, latencyMs, scope, streamStats: result.streamStats ?? streamStats,\n        contextComposition, contextLimit: modelContextLimit,\n      });`,
  'persist context composition',
);

chat = replaceOnce(
  chat,
  `            content: "You maintain a rolling summary of an AI workspace chat thread. Merge the previous summary (if any) with the new messages into ONE updated summary in the conversation's dominant language. Preserve every fact needed for follow-ups: user goals and decisions, agreed deliverables and their formats, names of people/brands/projects, artifact/task/project IDs mentioned, stated preferences and constraints, and open questions. Max ~350 words. Output only the summary text.",`,
  `            content: "You maintain a rolling summary of an AI workspace chat thread. Merge the previous summary (if any) with the new messages into ONE compact structured summary in the conversation's dominant language. Use exactly these headings: GOALS, DECISIONS, CONSTRAINTS, WORKSPACE ENTITIES, COMPLETED ACTIONS, OPEN ITEMS. Under each heading use concise bullets and omit empty headings only when truly irrelevant. Preserve exact names, IDs, agreed deliverable formats, task/project/artifact references and unresolved dependencies. Keep thread-specific style constraints when they matter to this work, but do not turn generic cross-thread user preferences into thread memory. Max ~450 words. Output only the structured summary.",`,
  'structured rolling summary',
);

fs.writeFileSync(chatPath, chat);

let meter = fs.readFileSync(meterPath, 'utf8');
meter = replaceOnce(
  meter,
  `  const contextLimit = await resolveContextLimit(modelProvider, modelName)\n  const percentUsed = contextLimit ? Math.min(100, (promptTokens / contextLimit) * 100) : null`,
  `  const measuredContextLimit = positiveNumber(latest.metrics?.context_limit)\n  const contextLimit = measuredContextLimit ?? await resolveContextLimit(modelProvider, modelName)\n  const percentUsed = contextLimit ? Math.min(100, (promptTokens / contextLimit) * 100) : null\n  const cachedPromptTokens = Math.round(Number(latest.metrics?.cached_prompt_tokens ?? 0) || 0)\n  const cacheWriteTokens = Math.round(Number(latest.metrics?.cache_write_tokens ?? 0) || 0)\n  const cacheHitRate = promptTokens > 0 ? cachedPromptTokens / promptTokens : null\n  const status = percentUsed == null ? null : percentUsed >= 80 ? "high" : percentUsed >= 55 ? "compacting" : "healthy"`,
  'context meter metrics',
);

meter = replaceOnce(
  meter,
  `      percent_used: percentUsed,\n      summarized: Boolean(thread.context_summary_updated_at),`,
  `      percent_used: percentUsed,\n      status,\n      composition: latest.metrics?.context_composition ?? null,\n      estimated_prompt_tokens: positiveNumber(latest.metrics?.context_estimated_prompt_tokens),\n      cached_prompt_tokens: cachedPromptTokens,\n      cache_write_tokens: cacheWriteTokens,\n      cache_hit_rate: cacheHitRate,\n      summarized: Boolean(thread.context_summary_updated_at),`,
  'context meter response',
);

fs.writeFileSync(meterPath, meter);
console.log('context caching/context management patch applied');
