import { Context, Effect, Layer } from "effect"
import {
  configSchema,
  findCrevDir as findCrevDirSync,
  loadAnnotatedConfig as loadAnnotatedConfigSync,
  loadLayeredConfig as loadLayeredConfigSync,
  type Config,
} from "../core/config.js"
import type { ProvenanceMap } from "../core/merge.js"
import { ConfigParseError } from "../errors.js"

export type LoadedConfig = { crevDir: string; config: Config }

export type LoadedAnnotatedConfig = {
  crevDir: string
  config: Config
  provenance: ProvenanceMap
}

export interface CrevConfigService {
  /**
   * Walks up from `startDir` (or cwd) looking for a `.crev` directory.
   * Returns the found path, or a fallback next to the start directory
   * when none exists — matching current CLI behavior.
   */
  readonly findCrevDir: (
    startDir?: string,
  ) => Effect.Effect<string>

  /**
   * Load the layered config from `crevDir` (user < project < local).
   * When `crevDir` is omitted, `findCrevDir` is used to discover it.
   */
  readonly load: (
    crevDir?: string,
  ) => Effect.Effect<LoadedConfig, ConfigParseError>

  /**
   * Like `load`, but also returns the per-key provenance map used by
   * `crev config` to show where each value came from.
   */
  readonly loadAnnotated: (
    crevDir?: string,
  ) => Effect.Effect<LoadedAnnotatedConfig, ConfigParseError>
}

export class CrevConfig extends Context.Tag("crev/CrevConfig")<
  CrevConfig,
  CrevConfigService
>() {}

/**
 * Live layer — wraps the existing synchronous config loaders in
 * `core/config.ts` with Effect.try so failures surface as tagged
 * `ConfigParseError`s. The wrapped code is already covered by the
 * core/config.test.ts suite; this layer only adds the Effect seam.
 */
export const CrevConfigLive = Layer.succeed(
  CrevConfig,
  CrevConfig.of({
    findCrevDir: (startDir) => Effect.sync(() => findCrevDirSync(startDir)),

    load: (crevDir) =>
      Effect.gen(function* () {
        const dir = crevDir ?? (yield* Effect.sync(() => findCrevDirSync()))
        const config = yield* Effect.try({
          try: () => loadLayeredConfigSync(dir),
          catch: (cause) => new ConfigParseError({ path: dir, cause }),
        })
        return { crevDir: dir, config }
      }),

    loadAnnotated: (crevDir) =>
      Effect.gen(function* () {
        const dir = crevDir ?? (yield* Effect.sync(() => findCrevDirSync()))
        const { config, provenance } = yield* Effect.try({
          try: () => loadAnnotatedConfigSync(dir),
          catch: (cause) => new ConfigParseError({ path: dir, cause }),
        })
        return { crevDir: dir, config, provenance }
      }),
  }),
)

/**
 * Test layer — provides a fixed config, crevDir, and (optional)
 * provenance. The `config` input is run through the same Zod schema
 * as production config files, so missing fields get their real defaults
 * and specs only need to specify what they actually care about.
 */
export const makeTestCrevConfig = (input: {
  readonly crevDir: string
  readonly config: Record<string, unknown>
  readonly provenance?: ProvenanceMap
}): { layer: Layer.Layer<CrevConfig> } => {
  const config: Config = configSchema.parse(input.config)
  const provenance = input.provenance ?? {}

  const layer = Layer.succeed(
    CrevConfig,
    CrevConfig.of({
      findCrevDir: () => Effect.succeed(input.crevDir),
      load: () => Effect.succeed({ crevDir: input.crevDir, config }),
      loadAnnotated: () =>
        Effect.succeed({ crevDir: input.crevDir, config, provenance }),
    }),
  )
  return { layer }
}
