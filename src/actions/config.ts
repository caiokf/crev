import { Effect } from "effect"
import fs from "node:fs"
import { CrevConfig } from "../services/CrevConfig.js"
import { getConfigLayerPaths } from "../core/config.js"
import type { Config } from "../core/config.js"
import type { ProvenanceMap } from "../core/merge.js"
import type { ConfigParseError } from "../errors.js"

export type ConfigLayerInfo = {
  readonly label: string
  readonly path: string
  readonly exists: boolean
}

export type ShowConfigOutput = {
  readonly crevDir: string
  readonly config: Config
  readonly provenance: ProvenanceMap
}

/**
 * Load the annotated (merged + provenance-tracked) config from the
 * discovered `.crev` directory. Renderers use `provenance` to show
 * which layer each value came from.
 */
export const showConfigAction: Effect.Effect<
  ShowConfigOutput,
  ConfigParseError,
  CrevConfig
> = Effect.gen(function* () {
  const cfg = yield* CrevConfig
  const { crevDir, config, provenance } = yield* cfg.loadAnnotated()
  return { crevDir, config, provenance }
})

/**
 * Return the ordered list of config layer paths (lowest → highest
 * priority) with an `exists` flag for each. Used by `crev config
 * --layers` and the future TUI config view.
 */
export const listConfigLayersAction: Effect.Effect<ConfigLayerInfo[], never, CrevConfig> =
  Effect.gen(function* () {
    const cfg = yield* CrevConfig
    const crevDir = yield* cfg.findCrevDir()
    return getConfigLayerPaths(crevDir).map((l) => ({
      label: l.label,
      path: l.path,
      exists: fs.existsSync(l.path),
    }))
  })
