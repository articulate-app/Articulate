/**
 * Calculate keyword density percentage in text
 */
export function calculateKeywordDensity(text: string, keyword: string): number {
  if (!text || !keyword) return 0
  
  const textLower = text.toLowerCase().trim()
  const keywordLower = keyword.toLowerCase().trim()
  
  if (!textLower || !keywordLower) return 0
  
  // Count keyword occurrences (whole words only)
  const words = textLower.split(/\s+/).filter(w => w.length > 0)
  const totalWords = words.length
  
  if (totalWords === 0) return 0
  
  // Count occurrences of the keyword as a whole word
  const keywordRegex = new RegExp(`\\b${keywordLower.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'gi')
  const matches = textLower.match(keywordRegex)
  const occurrences = matches ? matches.length : 0
  
  return totalWords > 0 ? (occurrences / totalWords) * 100 : 0
}

/**
 * Get color class for keyword density
 */
export function getDensityColor(density: number): { color: string; label: string } {
  if (density >= 3 && density <= 6) {
    return { color: 'text-green-600', label: 'OK' }
  } else if ((density >= 1 && density < 3) || (density > 6 && density <= 10)) {
    return { color: 'text-yellow-600', label: 'Warning' }
  } else {
    return { color: 'text-red-600', label: 'Critical' }
  }
}

/**
 * Check if density needs improvement (yellow or red)
 */
export function needsImprovement(density: number): boolean {
  return density < 3 || density > 6
}

/**
 * Extract plain text from HTML
 */
export function extractPlainText(html: string): string {
  if (!html) return ''
  
  // Remove HTML tags
  const text = html
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '') // Remove script tags
    .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '') // Remove style tags
    .replace(/<[^>]+>/g, ' ') // Remove all HTML tags
    .replace(/&nbsp;/g, ' ') // Replace &nbsp; with space
    .replace(/&[#\w]+;/g, ' ') // Replace HTML entities
    .replace(/\s+/g, ' ') // Normalize whitespace
    .trim()
  
  return text
}

