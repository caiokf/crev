import type { RuntimeAdapter, RuntimeHealth } from "@caiokf/valet"

const ANSI_ESCAPE_REGEX = /\u001b\[[0-?]*[ -/]*[@-~]/g
const ANSI_OSC_REGEX = /\u001b\][^\u0007]*(?:\u0007|\u001b\\)/g

/**
 * Decide which runtime adapters to run `healthCheck` against.
 * By default, only those referenced by at least one schema; with
 * `includeAll`, every known runtime.
 */
export function selectRuntimesToCheck<T extends { name: string }>(
  allRuntimes: ReadonlyArray<T>,
  referencedRuntimes: ReadonlySet<string>,
  includeAll: boolean,
): T[] {
  if (includeAll) return [...allRuntimes]
  if (referencedRuntimes.size === 0) return []
  return allRuntimes.filter((r) => referencedRuntimes.has(r.name))
}

/**
 * Strip ANSI escapes and control characters from runtime health fields.
 * Keeps the data safe to render in TUI / JSON / logs without leaking
 * cursor-moving or color-injection sequences from upstream CLIs.
 */
export function sanitizeRuntimeHealth(health: RuntimeHealth): RuntimeHealth {
  return {
    ...health,
    version: sanitizeRuntimeText(health.version),
    // authDetail is typed as string (not nullable) upstream, so we
    // fall back to "" instead of the raw value when sanitization
    // strips everything — otherwise we'd leak the pre-strip ANSI /
    // control-char payload we just removed.
    authDetail: sanitizeRuntimeText(health.authDetail) ?? "",
    error: sanitizeRuntimeText(health.error),
  }
}

function sanitizeRuntimeText(value: string | null | undefined): string | null {
  if (!value) return null
  const stripped = value
    .replace(ANSI_OSC_REGEX, "")
    .replace(ANSI_ESCAPE_REGEX, "")
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
  if (!stripped) return null
  return stripped.slice(0, 240)
}

/**
 * Run `healthCheck()` on the given runtimes in parallel, sanitizing
 * each result. Errors from individual runtimes are caught and
 * surfaced as an "unknown auth, not installed" record so the caller
 * can render them uniformly alongside successful checks.
 */
export async function collectRuntimeHealthParallel(
  runtimesToCheck: ReadonlyArray<RuntimeAdapter>,
  onProgress?: (checked: number, total: number) => void,
): Promise<RuntimeHealth[]> {
  const results: RuntimeHealth[] = new Array(runtimesToCheck.length)
  let checked = 0

  await Promise.all(
    runtimesToCheck.map(async (runtime, i) => {
      try {
        results[i] = sanitizeRuntimeHealth(await runtime.healthCheck())
      } catch (e) {
        results[i] = sanitizeRuntimeHealth({
          name: runtime.name,
          command: runtime.name,
          installed: false,
          version: null,
          authenticated: "unknown",
          authDetail: String(e),
          error: String(e),
        })
      }
      checked++
      onProgress?.(checked, runtimesToCheck.length)
    }),
  )

  return results
}
