import fs from "node:fs"
import path from "node:path"
import { z } from "zod"
import YAML from "yaml"
import { getAllRuntimes, getRuntimeNames } from "@caiokf/valet"

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
    context: z.array(z.string()).optional(),
    scope: z.enum(["diff", "codebase"]).default("diff"),
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
    context: z.array(z.string()).default([]),
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

export type SchemaFileType = z.infer<typeof SchemaFile>
export type ReviewerConfig = z.input<typeof ReviewerSchema>

export type ValidationIssue = {
  severity: "error" | "warning"
  reviewer?: string
  message: string
}

export function parseSchemaFile(content: string): z.SafeParseReturnType<unknown, z.infer<typeof ValidatedSchemaFile>> {
  const parsed = YAML.parse(content)
  return ValidatedSchemaFile.safeParse(parsed)
}

export function loadSchemaFile(schemaPath: string): SchemaFileType {
  const content = fs.readFileSync(schemaPath, "utf-8")
  const parsed = YAML.parse(content)
  return SchemaFile.parse(parsed)
}

export function listSchemas(schemasDir: string): string[] {
  if (!fs.existsSync(schemasDir)) return []
  return fs
    .readdirSync(schemasDir)
    .filter((f) => f.endsWith(".yaml") || f.endsWith(".yml"))
    .map((f) => path.basename(f, path.extname(f)))
    .sort()
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
