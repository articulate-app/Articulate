export function decodeBasicHtmlEntities(value: string) {
  return String(value ?? "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
}

export function htmlToPlainTextWithLineBreaks(html: string) {
  return decodeBasicHtmlEntities(
    String(html ?? "")
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<\/(p|div|li|tr|h[1-6])>/gi, "\n")
      .replace(/<\/t[dh]>/gi, "\t")
      .replace(/<[^>]+>/g, "")
  )
}

export function normalizePastedTextForChatInput(text: string) {
  return String(text ?? "")
    .replace(/\u00A0/g, " ")
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .replace(/\t+/g, "\n")
    .replace(/^\s*[-•*]\s+/gm, "")
    .replace(/^\s*\d+[.)]\s+/gm, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
}

export function shouldUseHtmlFallback(plain: string, html: string) {
  if (!html) return false

  const plainText = String(plain ?? "")
  const htmlText = String(html ?? "")

  const htmlSuggestsLineBreaks =
    /<br\s*\/?>|<\/(p|div|li|tr|h[1-6])>|<\/t[dh]>/i.test(htmlText)

  if (!htmlSuggestsLineBreaks) return false

  if (plainText.includes("\n")) return false

  return plainText.length > 40
}

export function resolveNormalizedPastedTextForChatInput(data: DataTransfer): string | null {
  const plain = data.getData("text/plain")
  const html = data.getData("text/html")

  const rawText = shouldUseHtmlFallback(plain, html)
    ? htmlToPlainTextWithLineBreaks(html)
    : plain

  const normalized = normalizePastedTextForChatInput(rawText)
  return normalized.length > 0 ? normalized : null
}
