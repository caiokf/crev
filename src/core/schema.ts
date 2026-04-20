import fs from "node:fs"
import path from "node:path"
import { z } from "zod"
import YAML from "yaml"
import { getAllRuntimes, getRuntimeNames } from "@caiokf/valet"
import { getUserCrevDir } from "./config.js"

// Single source of truth: derived from runtime adapters
export const VALID_MODELS: Record<string, readonly string[]> = Object.fromEntries(
  getAllRuntimes().map((r) => [r.name, r.models]),
)

// Derived from runtime registry — adding a runtime auto-registers it here
const runtimeNames = getRuntimeNames() as [string, ...string[]]
export const RuntimeName = z.enum(runtimeNames)

export const ReviewerSchema = z
  .object({
    name: z.string().min(1, "Reviewer name is required"),
    runtime: RuntimeName,
    model: z.string().min(1, "Model is required"),
    prompt: z.string().optional(),
    agent: z.string().optional(),
  })
  .refine((r) => !(r.prompt && r.agent), {
    message: "Specify either prompt or agent, not both",
  })
  .refine((r) => !(r.runtime === "coderabbit" && (r.prompt || r.agent)), {
    message: "CodeRabbit uses its own review engine — prompt and agent are not supported",
  })

export const TriageSchema = z
  .object({
    enabled: z.boolean().default(false),
    runtime: RuntimeName.optional(),
    model: z.string().optional(),
  })
  .refine((t) => !t.enabled || (t.runtime && t.model), {
    message: "Triage requires runtime and model when enabled",
  })

export const SchemaFile = z.object({
  description: z.string().optional(),
  reviewers: z.array(ReviewerSchema).min(1, "At least one reviewer is required"),
  triage: TriageSchema.optional(),
})

export const ValidatedSchemaFile = SchemaFile.superRefine((schema, ctx) => {
  for (const [i, reviewer] of schema.reviewers.entries()) {
    const validModels = VALID_MODELS[reviewer.runtime]
    if (validModels && !validModels.includes(reviewer.model)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["reviewers", i, "model"],
        message: `Invalid model "${reviewer.model}" for runtime "${reviewer.runtime}". Valid: ${validModels.join(", ")}`,
      })
    }
  }
})

export type SchemaFileType = z.infer<typeof ValidatedSchemaFile>
export type ReviewerConfig = z.input<typeof ReviewerSchema>

export type ValidationIssue = {
  severity: "error" | "warning"
  reviewer?: string
  message: string
}

function invalidSchemaParseResult(
  message: string,
): z.SafeParseReturnType<unknown, z.infer<typeof ValidatedSchemaFile>> {
  return {
    success: false,
    error: new z.ZodError([
      {
        code: z.ZodIssueCode.custom,
        path: [],
        message,
      },
    ]),
  }
}

export function parseSchemaFile(content: string): z.SafeParseReturnType<unknown, z.infer<typeof ValidatedSchemaFile>> {
  try {
    const parsed = YAML.parse(content)
    return ValidatedSchemaFile.safeParse(parsed)
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err)
    return invalidSchemaParseResult(`Invalid YAML: ${reason}`)
  }
}

export function loadSchemaFile(schemaPath: string): SchemaFileType {
  const content = fs.readFileSync(schemaPath, "utf-8")
  try {
    const parsed = YAML.parse(content)
    return ValidatedSchemaFile.parse(parsed)
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err)
    throw new Error(`Invalid schema file "${schemaPath}": ${reason}`)
  }
}

export function listSchemas(schemasDir: string): string[] {
  if (!fs.existsSync(schemasDir)) return []
  return fs
    .readdirSync(schemasDir)
    .filter((f) => f.endsWith(".yaml") || f.endsWith(".yml"))
    .filter((f) => !f.endsWith(".local.yaml") && !f.endsWith(".local.yml"))
    .map((f) => path.basename(f, path.extname(f)))
    .sort()
}

/**
 * List all available schemas across all layers, deduplicated by name.
 * Includes schemas from: ~/.crev/schemas, .crev/schemas, and .local.yaml overrides.
 */
export function listAllSchemas(crevDir: string): string[] {
  const userSchemasDir = path.join(getUserCrevDir(), "schemas")
  const projectSchemasDir = path.join(crevDir, "schemas")

  const names = new Set<string>()

  // Gather from user dir
  for (const name of listSchemas(userSchemasDir)) names.add(name)

  // Gather from project dir (includes base schemas)
  for (const name of listSchemas(projectSchemasDir)) names.add(name)

  // Gather .local.yaml schemas (expose them by their base name)
  if (fs.existsSync(projectSchemasDir)) {
    for (const f of fs.readdirSync(projectSchemasDir)) {
      if (f.endsWith(".local.yaml") || f.endsWith(".local.yml")) {
        const base = f.replace(/\.local\.(yaml|yml)$/, "")
        names.add(base)
      }
    }
  }

  return [...names].sort()
}

/**
 * Resolve a schema name to its file path, checking layers in priority order:
 *   .crev/schemas/<name>.local.yaml > .crev/schemas/<name>.local.yml >
 *   .crev/schemas/<name>.yaml > .crev/schemas/<name>.yml >
 *   ~/.crev/schemas/<name>.yaml > ~/.crev/schemas/<name>.yml
 */
export function resolveSchemaPath(schemaName: string, crevDir: string): string | null {
  const projectSchemasDir = path.join(crevDir, "schemas")
  const userSchemasDir = path.join(getUserCrevDir(), "schemas")

  const candidates = [
    path.join(projectSchemasDir, `${schemaName}.local.yaml`),
    path.join(projectSchemasDir, `${schemaName}.local.yml`),
    path.join(projectSchemasDir, `${schemaName}.yaml`),
    path.join(projectSchemasDir, `${schemaName}.yml`),
    path.join(userSchemasDir, `${schemaName}.yaml`),
    path.join(userSchemasDir, `${schemaName}.yml`),
  ]

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) return candidate
  }

  return null
}

export async function validateAgentRefs(
  schema: SchemaFileType,
): Promise<ValidationIssue[]> {
  const issues: ValidationIssue[] = []
  for (const reviewer of schema.reviewers) {
    if (reviewer.agent) {
      const resolved = path.resolve(reviewer.agent)
      if (!fs.existsSync(resolved)) {
        issues.push({
          severity: "error",
          reviewer: reviewer.name,
          message: `Agent file not found: ${reviewer.agent} (resolved to ${resolved})`,
        })
      }
    }
  }
  return issues
}
