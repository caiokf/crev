/**
 * Extract a JSON object containing a given key from raw text.
 *
 * Anchors on the *last* occurrence of the key (the LLM's final
 * answer) and walks back through `{` positions to find its
 * enclosing object, skipping over preamble braces that don't
 * belong to any JSON value.
 *
 * Crucially, brace-walking stops at the prior occurrence of the
 * same key. Without this bound, a malformed final block could
 * silently fall back to a valid earlier block with the same key
 * (e.g. a schema example in the preamble), returning stale
 * findings as if they were the fresh output.
 */
export function extractJsonObject(raw: string, key: string): string | null {
  const keyPattern = `"${key}"`
  const lastKey = raw.lastIndexOf(keyPattern)
  if (lastKey < 0) return null

  const priorKey = raw.lastIndexOf(keyPattern, lastKey - 1)
  const minBracePos = priorKey < 0 ? 0 : priorKey + keyPattern.length

  let bracePos = raw.lastIndexOf("{", lastKey)
  while (bracePos >= minBracePos) {
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

  return null
}

/**
 * Extract a JSON object containing a given key and parse it.
 * Returns null if extraction or parsing fails.
 */
export function extractAndParse(raw: string, key: string): Record<string, unknown> | null {
  const jsonStr = extractJsonObject(raw, key)
  if (!jsonStr) return null
  try {
    const parsed = JSON.parse(jsonStr)
    if (parsed && typeof parsed === "object") return parsed as Record<string, unknown>
    return null
  } catch {
    return null
  }
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
