import fs from "node:fs"

const path = "supabase/functions/ai-chat/index.ts"
let source = fs.readFileSync(path, "utf8")
let changed = false

function replaceOnce(label, search, replacement) {
  if (source.includes(replacement)) return
  const index = source.indexOf(search)
  if (index < 0) throw new Error(`Patch anchor not found: ${label}`)
  source = source.slice(0, index) + replacement + source.slice(index + search.length)
  changed = true
  console.log(`patched: ${label}`)
}

replaceOnce(
  "OpenRouter secret",
  'const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY");\n\n\n\nconst ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY");',
  'const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY");\n\n\nconst OPENROUTER_API_KEY = Deno.env.get("OPENROUTER_API_KEY");\n\n\nconst ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY");',
)

replaceOnce(
  "provider-aware accounting signature",
  '  stage: string;\n  defaultMaxCompletionTokens?: number;\n}): Promise<Response> {\n  const bodyText = typeof args.init.body === "string" ? args.init.body : "";',
  '  stage: string;\n  provider?: string;\n  defaultMaxCompletionTokens?: number;\n}): Promise<Response> {\n  const bodyText = typeof args.init.body === "string" ? args.init.body : "";',
)

replaceOnce(
  "provider-aware accounting reservation",
  '    p_provider: "openai",\n    p_model: model,',
  '    p_provider: args.provider ?? "openai",\n    p_model: model,',
)

replaceOnce(
  "OpenAI accounting provider",
  '    context: accounting.quota,\n    stage: accounting.stage,\n    defaultMaxCompletionTokens: accounting.defaultMaxCompletionTokens,\n  });\n}\n\n\n\nconst TOOLS = [',
  '    context: accounting.quota,\n    stage: accounting.stage,\n    provider: "openai",\n    defaultMaxCompletionTokens: accounting.defaultMaxCompletionTokens,\n  });\n}\n\n\nasync function fetchOpenRouter(\n  url: string,\n  init: RequestInit = {},\n  accounting: {\n    quota?: AiTokenQuotaContext | null;\n    stage: string;\n    defaultMaxCompletionTokens?: number;\n    tokenBased?: boolean;\n  },\n): Promise<Response> {\n  const nextInit: RequestInit = { ...init };\n  if (accounting.quota?.signal) {\n    nextInit.signal = nextInit.signal\n      ? AbortSignal.any([nextInit.signal, accounting.quota.signal])\n      : accounting.quota.signal;\n  }\n  const rawBody = (nextInit as any).body;\n  if (typeof rawBody === "string") {\n    try {\n      const parsed = JSON.parse(rawBody);\n      if (parsed && typeof parsed === "object") {\n        if (\n          accounting.tokenBased !== false && accounting.quota && accounting.defaultMaxCompletionTokens &&\n          parsed.max_output_tokens == null && parsed.max_completion_tokens == null && parsed.max_tokens == null\n        ) {\n          parsed.max_tokens = accounting.defaultMaxCompletionTokens;\n        }\n        // OpenRouter includes usage automatically in the final streamed chunk.\n        // Do not force deprecated usage/stream_options flags.\n        delete parsed.stream_options;\n        delete parsed.usage;\n        nextInit.body = JSON.stringify(parsed);\n      }\n    } catch {\n      // Non-JSON body. Leave untouched.\n    }\n  }\n  if (accounting.tokenBased === false || !accounting.quota) return await fetch(url, nextInit);\n  return await fetchOpenAiWithTokenAccounting({\n    url,\n    init: nextInit,\n    context: accounting.quota,\n    stage: accounting.stage,\n    provider: "openrouter",\n    defaultMaxCompletionTokens: accounting.defaultMaxCompletionTokens,\n  });\n}\n\n\nconst TOOLS = [',
)

replaceOnce(
  "OpenRouter model alias",
  'function resolveModelAlias(value: any) {\n  const key = normalizeModelChoiceKey(value);\n  if (!key) return null;\n  const registry = getConfiguredModelRegistry();\n  if (registry[key]) return { ...registry[key], key };\n\n  // Accept raw OpenAI/Anthropic model ids when the FE sends provider separately.',
  'function resolveModelAlias(value: any) {\n  const raw = String(value ?? "").trim();\n  const key = normalizeModelChoiceKey(value);\n  if (!key) return null;\n  const registry = getConfiguredModelRegistry();\n  if (registry[key]) return { ...registry[key], key };\n\n  if (/^openrouter:/i.test(raw)) {\n    const model = raw.replace(/^openrouter:/i, "").trim();\n    if (model) return { provider: "openrouter", model, label: model, key: `openrouter:${model}` };\n  }\n\n  // Accept raw OpenAI/Anthropic model ids when the FE sends provider separately.',
)

replaceOnce(
  "OpenRouter executable provider",
  '  if (provider === "anthropic") {\n    // Anthropic model keys are already registry-aware so the FE can be wired now.',
  '  if (provider === "openrouter") {\n    if (!OPENROUTER_API_KEY) throw new Error("OPENROUTER_API_KEY is missing");\n    return;\n  }\n  if (provider === "anthropic") {\n    // Anthropic model keys are already registry-aware so the FE can be wired now.',
)

replaceOnce(
  "OpenRouter tool capability cache",
  'const modelPricingCache = new Map<string, { expiresAt: number; data: any }>();',
  'let openRouterToolModelsCache: { expiresAt: number; models: Set<string> } | null = null;\n\nasync function openRouterModelSupportsTools(model: string): Promise<boolean> {\n  if (!OPENROUTER_API_KEY) return false;\n  const now = Date.now();\n  if (openRouterToolModelsCache && openRouterToolModelsCache.expiresAt > now) {\n    return openRouterToolModelsCache.models.has(model);\n  }\n  try {\n    const response = await fetch("https://openrouter.ai/api/v1/models?supported_parameters=tools", {\n      headers: { Authorization: `Bearer ${OPENROUTER_API_KEY}` },\n      signal: AbortSignal.timeout(10000),\n    });\n    if (!response.ok) throw new Error(`openrouter_models_failed:${response.status}`);\n    const payload = await response.json();\n    const models = new Set<string>((Array.isArray(payload?.data) ? payload.data : [])\n      .map((row: any) => String(row?.id ?? "").trim())\n      .filter(Boolean));\n    openRouterToolModelsCache = { expiresAt: now + 5 * 60 * 1000, models };\n    return models.has(model);\n  } catch (error) {\n    console.warn("ai-chat OpenRouter tool capability lookup failed", { model, error: String(error) });\n    // Fail closed for tool execution, but keep the model usable for chat.\n    return false;\n  }\n}\n\nconst modelPricingCache = new Map<string, { expiresAt: number; data: any }>();',
)

replaceOnce(
  "OpenRouter direct cost",
  'async function computeCost(supabaseService: any, provider: string, model: string, usage: any) {\n  if (!usage) return {};\n  const cacheKey = `${provider}:${model}`;',
  'async function computeCost(supabaseService: any, provider: string, model: string, usage: any) {\n  if (!usage) return {};\n  const directCost = Number(usage?.cost);\n  if (provider === "openrouter" && Number.isFinite(directCost) && directCost >= 0) {\n    return { input_cost: null, output_cost: null, total_cost: directCost, currency: "USD" };\n  }\n  const cacheKey = `${provider}:${model}`;',
)

replaceOnce(
  "usage cost normalization",
  '  const cached = Math.max(0, Number(\n    usage.input_tokens_details?.cached_tokens ?? usage.prompt_tokens_details?.cached_tokens ?? 0,\n  ) || 0);\n  return {\n    prompt_tokens: Math.round(prompt),\n    completion_tokens: Math.round(completion),\n    total_tokens: Math.round(total),\n    cached_prompt_tokens: Math.round(cached),\n  };',
  '  const cached = Math.max(0, Number(\n    usage.input_tokens_details?.cached_tokens ?? usage.prompt_tokens_details?.cached_tokens ?? 0,\n  ) || 0);\n  const cost = Math.max(0, Number(usage.cost ?? usage.total_cost ?? 0) || 0);\n  return {\n    prompt_tokens: Math.round(prompt),\n    completion_tokens: Math.round(completion),\n    total_tokens: Math.round(total),\n    cached_prompt_tokens: Math.round(cached),\n    cost,\n  };',
)

replaceOnce(
  "merge provider cost",
  '    total_tokens: a.total_tokens + b.total_tokens,\n    cached_prompt_tokens: a.cached_prompt_tokens + b.cached_prompt_tokens,\n  };',
  '    total_tokens: a.total_tokens + b.total_tokens,\n    cached_prompt_tokens: a.cached_prompt_tokens + b.cached_prompt_tokens,\n    cost: (a.cost ?? 0) + (b.cost ?? 0),\n  };',
)

replaceOnce(
  "conversation provider arg",
  '  thread: any;\n  model: string;\n  messages: any[];',
  '  thread: any;\n  provider: string;\n  model: string;\n  messages: any[];',
)

replaceOnce(
  "provider-aware chat transport",
  '    const payload: any = {\n      model: args.model,\n      messages: conversation,\n      tools: args.tools,\n      tool_choice: "auto",\n      parallel_tool_calls: true,\n      stream: true,\n      stream_options: { include_usage: true },\n    };\n    args.trace.mark(`openai_round_${round + 1}_request`);\n    const response = await fetchOpenAi("https://api.openai.com/v1/chat/completions", {\n      method: "POST",\n      headers: { Authorization: `Bearer ${OPENAI_API_KEY}`, "Content-Type": "application/json" },\n      body: JSON.stringify(sanitizeOpenAiPayload(payload)),\n      signal: args.ctx?.abort_signal ?? undefined,\n    }, { quota: args.ctx?.ai_token_quota, stage: `chat_round_${round + 1}`, defaultMaxCompletionTokens: 10000 });\n    if (!response.ok) throw new Error(`openai_chat_failed:${response.status}:${await response.text()}`);',
  '    const isOpenRouter = args.provider === "openrouter";\n    const payload: any = {\n      model: args.model,\n      messages: conversation,\n      stream: true,\n    };\n    if (Array.isArray(args.tools) && args.tools.length > 0) {\n      payload.tools = args.tools;\n      payload.tool_choice = "auto";\n      // OpenRouter standardizes tool calls across providers. Avoid forcing\n      // parallel_tool_calls because not every compatible model exposes it.\n      if (!isOpenRouter) payload.parallel_tool_calls = true;\n    }\n    if (!isOpenRouter) payload.stream_options = { include_usage: true };\n\n    args.trace.mark(`${args.provider}_round_${round + 1}_request`);\n    const response = isOpenRouter\n      ? await fetchOpenRouter("https://openrouter.ai/api/v1/chat/completions", {\n          method: "POST",\n          headers: {\n            Authorization: `Bearer ${OPENROUTER_API_KEY}`,\n            "Content-Type": "application/json",\n            "HTTP-Referer": "https://www.whyarticulate.com",\n            "X-Title": "Articulate",\n          },\n          body: JSON.stringify(payload),\n          signal: args.ctx?.abort_signal ?? undefined,\n        }, { quota: args.ctx?.ai_token_quota, stage: `chat_round_${round + 1}`, defaultMaxCompletionTokens: 10000 })\n      : await fetchOpenAi("https://api.openai.com/v1/chat/completions", {\n          method: "POST",\n          headers: { Authorization: `Bearer ${OPENAI_API_KEY}`, "Content-Type": "application/json" },\n          body: JSON.stringify(sanitizeOpenAiPayload(payload)),\n          signal: args.ctx?.abort_signal ?? undefined,\n        }, { quota: args.ctx?.ai_token_quota, stage: `chat_round_${round + 1}`, defaultMaxCompletionTokens: 10000 });\n    if (!response.ok) throw new Error(`${args.provider}_chat_failed:${response.status}:${await response.text()}`);',
)

replaceOnce(
  "tool capability selection",
  '    trace.mark("context_loaded");\n    const selectedTools = MODEL_TOOLS;\n    // Static system prompt first (stable prompt-cache prefix); volatile per-turn',
  '    trace.mark("context_loaded");\n    const modelSupportsTools = resolvedModel.provider === "openrouter"\n      ? await openRouterModelSupportsTools(resolvedModel.model)\n      : resolvedModel.provider === "openai";\n    const selectedTools = modelSupportsTools ? MODEL_TOOLS : [];\n    // Static system prompt first (stable prompt-cache prefix); volatile per-turn',
)

replaceOnce(
  "chat-only model capability context",
  '      ...(turnContextPrompt ? [{ role: "system", content: turnContextPrompt }] : []),\n      { role: "user", content: currentContent },',
  '      ...(turnContextPrompt ? [{ role: "system", content: turnContextPrompt }] : []),\n      ...(!modelSupportsTools ? [{ role: "system", content: "MODEL CAPABILITY: The explicitly selected model does not expose native function tools through OpenRouter. It remains available for conversation and content generation, but it cannot read or mutate workspace data in this run. Do not claim that a workspace change was applied." }] : []),\n      { role: "user", content: currentContent },',
)

replaceOnce(
  "pass provider into conversation",
  '      db, supabaseService, thread, model: resolvedModel.model, messages: modelMessages, tools: selectedTools,',
  '      db, supabaseService, thread, provider: resolvedModel.provider, model: resolvedModel.model, messages: modelMessages, tools: selectedTools,',
)

if (!changed) {
  console.log("ai-chat OpenRouter patch already applied")
  process.exit(0)
}

fs.writeFileSync(path, source)
console.log("ai-chat OpenRouter patch written")
