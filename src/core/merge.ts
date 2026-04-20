/**
 * Deep merge utility for layered config.
 * Scalars overwrite, objects merge recursively, arrays replace.
 */

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

export function deepMerge(...objects: Record<string, unknown>[]): Record<string, unknown> {
  const result: Record<string, unknown> = {}

  for (const obj of objects) {
    for (const [key, value] of Object.entries(obj)) {
      if (isPlainObject(value) && isPlainObject(result[key])) {
        result[key] = deepMerge(result[key] as Record<string, unknown>, value)
      } else {
        result[key] = value
      }
    }
  }

  return result
}

export type ProvenanceMap = Record<string, string>

/**
 * Deep merge with provenance tracking.
 * Returns the merged object and a map of dotpath → source label for leaf values.
 */
export function annotatedMerge(
  layers: { label: string; data: Record<string, unknown> }[],
): { merged: Record<string, unknown>; provenance: ProvenanceMap } {
  const provenance: ProvenanceMap = {}

  function merge(
    base: Record<string, unknown>,
    overlay: Record<string, unknown>,
    label: string,
    prefix: string,
  ): Record<string, unknown> {
    const result = { ...base }

    for (const [key, value] of Object.entries(overlay)) {
      const dotpath = prefix ? `${prefix}.${key}` : key

      if (isPlainObject(value) && isPlainObject(result[key])) {
        result[key] = merge(result[key] as Record<string, unknown>, value, label, dotpath)
      } else {
        result[key] = value
        if (Array.isArray(value)) {
          // Mark each array element and the array itself
          provenance[dotpath] = label
        } else if (isPlainObject(value)) {
          // New object that replaced a non-object — mark all leaves
          markLeaves(value, dotpath, label, provenance)
        } else {
          provenance[dotpath] = label
        }
      }
    }

    return result
  }

  let merged: Record<string, unknown> = {}

  for (const layer of layers) {
    merged = merge(merged, layer.data, layer.label, "")
  }

  return { merged, provenance }
}

function markLeaves(
  obj: Record<string, unknown>,
  prefix: string,
  label: string,
  provenance: ProvenanceMap,
): void {
  for (const [key, value] of Object.entries(obj)) {
    const dotpath = `${prefix}.${key}`
    if (isPlainObject(value)) {
      markLeaves(value, dotpath, label, provenance)
    } else {
      provenance[dotpath] = label
    }
  }
}
