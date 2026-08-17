import fs from 'node:fs';

const path = 'supabase/functions/ai-chat/index.ts';
let text = fs.readFileSync(path, 'utf8');

function replaceOnce(from, to, label) {
  const count = text.split(from).length - 1;
  if (count !== 1) throw new Error(`${label}: expected exactly one match, found ${count}`);
  text = text.replace(from, to);
}

replaceOnce(
  'const response = await fetch("https://openrouter.ai/api/v1/models", {',
  'const response = await fetch("https://openrouter.ai/api/v1/models?supported_parameters=tools", {',
  'filtered OpenRouter tool lookup',
);

replaceOnce(
  'Max ~450 words. Output only the structured summary.',
  'Max ~350 words. Output only the structured summary.',
  'summary size cap',
);

// Keep OpenRouter context-length discovery out of the latency-sensitive chat path.
// ai-context-meter already resolves the model context window dynamically.
replaceOnce(
  '    const modelContextLimit = resolvedModel.provider === "openrouter"\n      ? openRouterMetadata?.contextLength ?? null\n      : nativeModelContextLimit(resolvedModel.provider, resolvedModel.model);',
  '    const modelContextLimit = resolvedModel.provider === "openrouter"\n      ? null\n      : nativeModelContextLimit(resolvedModel.provider, resolvedModel.model);',
  'OpenRouter context limit off critical path',
);

fs.writeFileSync(path, text);
console.log('context caching performance follow-up applied');
