import fs from "node:fs"

const path = "supabase/functions/ai-chat/index.ts"
let source = fs.readFileSync(path, "utf8")

const search = `        if (\n          accounting.tokenBased !== false && accounting.quota && accounting.defaultMaxCompletionTokens &&\n          parsed.max_output_tokens == null && parsed.max_completion_tokens == null && parsed.max_tokens == null\n        ) {\n          parsed.max_tokens = accounting.defaultMaxCompletionTokens;\n        }\n        // OpenRouter includes usage automatically in the final streamed chunk.`
const replacement = `        // Do not force a provider max_tokens value. Models on OpenRouter expose\n        // different output limits; quota reservation can remain conservative\n        // without making otherwise compatible models ineligible.\n        // OpenRouter includes usage automatically in the final streamed chunk.`

if (source.includes(replacement)) {
  console.log("OpenRouter output-limit patch already applied")
  process.exit(0)
}
if (!source.includes(search)) throw new Error("OpenRouter output-limit patch anchor not found")
source = source.replace(search, replacement)
fs.writeFileSync(path, source)
console.log("Removed forced OpenRouter max_tokens")
