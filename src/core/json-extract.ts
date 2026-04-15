/**
 * Extract a JSON object containing a given key from raw text.
 * Tries each `{` position that precedes the key, from last to first,
 * to avoid the greedy-regex problem where preamble braces corrupt the match.
 */
export function extractJsonObject(raw: string, key: string): string | null {
  const keyPattern = `"${key}"`
  let searchFrom = raw.lastIndexOf(keyPattern)

  while (searchFrom >= 0) {
    let bracePos = raw.lastIndexOf("{", searchFrom)
    while (bracePos >= 0) {
      const candidate = raw.slice(bracePos)
      try {
        const end = findMatchingBrace(candidate)
        if (end < 0) { bracePos = bracePos > 0 ? raw.lastIndexOf("{", bracePos - 1) : -1; continue }
        const parsed = JSON.parse(candidate.slice(0, end + 1))
        if (parsed && typeof parsed === "object" && key in parsed) {
          return JSON.stringify(parsed)
        }
      } catch {
        // Not valid JSON from this position, try the previous `{`
      }
      bracePos = bracePos > 0 ? raw.lastIndexOf("{", bracePos - 1) : -1
    }
    searchFrom = raw.lastIndexOf(keyPattern, searchFrom - 1)
  }

  return null
}

/**
 * Find the position of the closing `}` that matches the opening `{` at position 0.
 */
function findMatchingBrace(s: string): number {
  let depth = 0
  let inString = false
  let escape = false

  for (let i = 0; i < s.length; i++) {
    const ch = s[i]
    if (escape) { escape = false; continue }
    if (ch === "\\") { escape = true; continue }
    if (ch === '"') { inString = !inString; continue }
    if (inString) continue
    if (ch === "{") depth++
    if (ch === "}") { depth--; if (depth === 0) return i }
  }
  return -1
}
