import fs from "node:fs"

function patch(path, anchor, insertion) {
  let source = fs.readFileSync(path, "utf8")
  if (source.includes(insertion.trim())) {
    console.log(`${path}: already patched`)
    return
  }
  if (!source.includes(anchor)) throw new Error(`${path}: anchor not found`)
  source = source.replace(anchor, `${anchor}\n${insertion}`)
  fs.writeFileSync(path, source)
  console.log(`${path}: patched`)
}

const chatAnchor = '    "LANGUAGE: Match conversational replies and clarifications to the language of the user\'s latest message. For deliverable content adapted from sources, templates or URLs, keep the language of that source material unless the user explicitly asks to translate or rewrite in another language.",'
const chatRule = '    "EDITORIAL QUALITY: Prefer specific, direct, natural writing over generic AI filler. Avoid unnecessary throat-clearing, inflated claims, canned transitions, repetitive conclusions, vague superlatives and formulaic phrases such as \'in today’s fast-paced world\', \'delve into\', \'unlock\', \'seamless\', \'crucial role\', or equivalents in the output language. Vary sentence and paragraph rhythm; do not force every section into the same structure. Never remove terminology, tone, claims or phrasing that the user, source, brand rules or learned preferences explicitly require. Explicit instructions and factual source fidelity always outrank these defaults.",'
patch("supabase/functions/ai-chat/index.ts", chatAnchor, chatRule)

const workerAnchor = '    "LANGUAGE: Keep the deliverable in the language of the provided sources/templates/URLs unless task_instruction or request explicitly asks to translate or rewrite in another language. Do not switch language just because the chat request is written in a different language.",'
const workerRule = '    "EDITORIAL QUALITY: Write with specificity and human editorial judgment. Avoid generic openings, empty scene-setting, exaggerated importance, canned transitions, repetitive summaries, symmetrical list padding, and stock AI phrases such as \'in today’s fast-paced world\', \'delve into\', \'unlock\', \'seamless\', \'crucial role\', or natural equivalents in the deliverable language. Prefer concrete nouns and verbs, useful detail, varied sentence length and section shapes that fit the subject. Do not enforce these defaults against explicit user wording, source fidelity, brand rules, templates, SEO requirements or learned preferences; those take priority.",'
patch("supabase/functions/ai-artifact-worker/index.ts", workerAnchor, workerRule)
