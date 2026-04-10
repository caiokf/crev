import { z } from "zod"

// ── Diff source: exactly one of these, never a bag of optionals ──

export type DiffSource =
  | { kind: "pr"; pr: number }
  | { kind: "branch"; base: string; type: DiffType }
  | { kind: "commit"; baseCommit: string; type: DiffType }
  | { kind: "local"; type: DiffType }

export type DiffType = "all" | "committed" | "uncommitted"

// ── Output mode: mutually exclusive ──

export type OutputMode =
  | { kind: "tui" }
  | { kind: "plain" }
  | { kind: "json" }
  | { kind: "prompt-only"; format: "json" }

// ── Review target: fresh or merge into existing ──

export type ReviewTarget =
  | { kind: "fresh"; slug?: string; description?: string }
  | { kind: "merge"; reviewFile: string }

// ── The resolved command: all ambiguity gone ──

export interface RunCommand {
  schema: string
  diff: DiffSource
  output: OutputMode
  target: ReviewTarget
  reviewers?: string[]
}

// ── Zod validation: flat flags → discriminated unions ──

export const RawRunFlags = z
  .object({
    schema: z.string(),
    base: z.string().optional(),
    baseCommit: z.string().optional(),
    pr: z.coerce.number().positive().optional(),
    type: z.enum(["all", "committed", "uncommitted"]).default("all"),
    reviewers: z.string().optional(),
    slug: z.string().optional(),
    description: z.string().optional(),
    reviewFile: z.string().optional(),
    plain: z.boolean().default(false),
    json: z.boolean().default(false),
    promptOnly: z.boolean().default(false),
  })
  .refine((f) => [f.pr, f.base, f.baseCommit].filter(Boolean).length <= 1, {
    message: "--pr, --base, and --base-commit are mutually exclusive",
  })
  .refine((f) => !(f.pr && f.type === "uncommitted"), {
    message: "--type uncommitted is incompatible with --pr",
  })
  .refine((f) => !(f.promptOnly && f.reviewFile), {
    message: "--prompt-only and --review-file are incompatible",
  })
  .refine((f) => [f.plain, f.json, f.promptOnly].filter(Boolean).length <= 1, {
    message: "--plain, --json, and --prompt-only are mutually exclusive",
  })
  .refine((f) => !(f.reviewFile && f.slug), {
    message: "--slug is incompatible with --review-file (slug comes from existing file)",
  })
  .transform(
    (f): RunCommand => ({
      schema: f.schema,
      diff: f.pr
        ? { kind: "pr", pr: f.pr }
        : f.baseCommit
          ? { kind: "commit", baseCommit: f.baseCommit, type: f.type }
          : f.base
            ? { kind: "branch", base: f.base, type: f.type }
            : { kind: "local", type: f.type },
      output: f.promptOnly
        ? { kind: "prompt-only", format: "json" }
        : f.json
          ? { kind: "json" }
          : f.plain
            ? { kind: "plain" }
            : { kind: "tui" },
      target: f.reviewFile
        ? { kind: "merge", reviewFile: f.reviewFile }
        : { kind: "fresh", slug: f.slug, description: f.description },
      reviewers: f.reviewers?.split(",").map((r) => r.trim()),
    }),
  )

// ── Issue types ──

export type TriageVerdict = {
  verdict: "actionable" | "deferred" | "dismissed"
  reasoning: string
}

export type IssueStatus = "open" | "fixed" | "wont-fix"

export type ReviewIssue = {
  id: string
  reviewer: string
  runtime: string
  model: string
  file?: string
  line?: number
  severity: "low" | "medium" | "high" | "critical"
  category: "bug" | "security" | "performance" | "style" | "compliance" | "architecture"
  title: string
  description: string
  triage?: TriageVerdict
  status: IssueStatus
}

export type NormalizedReview = {
  reviewer: string
  runtime: string
  model: string
  durationMs: number
  exitCode: number
  issues: ReviewIssue[]
  rawLength: number
}

export type ReviewResult = {
  metadata: {
    slug: string
    timestamp: string
    schema: string
    diffBase?: string
    diffType: string
    description?: string
  }
  reviews: NormalizedReview[]
  summary: {
    totalIssues: number
    bySeverity: Record<string, number>
    byCategory: Record<string, number>
    byStatus: Record<string, number>
    byReviewer: Record<string, number>
    triage?: {
      actionable: number
      deferred: number
      dismissed: number
    }
  }
}
