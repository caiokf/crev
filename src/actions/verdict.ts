import { Effect } from "effect"
import path from "node:path"
import { recomputeSummary } from "../core/output.js"
import type { ReviewIssue, ReviewResult, TriageVerdict } from "../core/types.js"
import {
  IssueNotFoundError,
  type FileNotFoundError,
  type FileReadError,
  type FileWriteError,
  type ReviewParseError,
} from "../errors.js"
import { ReviewStore } from "../services/ReviewStore.js"

export type SetVerdictInput = {
  readonly filePath: string
  readonly issueId: string
  readonly verdict: TriageVerdict["verdict"]
}

export type SetVerdictOutput = {
  readonly filePath: string
  readonly result: ReviewResult
  readonly issue: ReviewIssue
}

/**
 * Mutate a single issue's triage verdict in an existing review file.
 *
 * Used by the dash's `a`/`x`/`d` keybindings on the issue-detail
 * view — the user's intent is always "change my mind about this one
 * issue", not re-run triage, so we just flip the verdict, stamp a
 * breadcrumb reasoning (preserving any existing enrichment), and
 * recompute the top-level summary counts so the dash's reviewer
 * panel reflects reality on the next render.
 *
 * The file is written back in place (via `ReviewStore.save`) rather
 * than to a new timestamped filename so the dash view keeps pointing
 * at the same review the user is currently looking at.
 */
export const setVerdictAction = (
  input: SetVerdictInput,
): Effect.Effect<
  SetVerdictOutput,
  FileNotFoundError | FileReadError | ReviewParseError | FileWriteError | IssueNotFoundError,
  ReviewStore
> =>
  Effect.gen(function* () {
    const store = yield* ReviewStore
    const resolved = path.resolve(input.filePath)
    const result = yield* store.load(resolved)

    let target: ReviewIssue | null = null
    for (const review of result.reviews) {
      for (const issue of review.issues) {
        if (issue.id === input.issueId) {
          target = issue
          break
        }
      }
      if (target) break
    }

    if (!target) {
      return yield* Effect.fail(
        new IssueNotFoundError({ filePath: resolved, issueId: input.issueId }),
      )
    }

    // Preserve existing reasoning when the user is only flipping the
    // verdict on a previously-triaged issue; otherwise stamp a
    // breadcrumb so the field stays non-empty (the type requires it).
    const priorReasoning = target.triage?.reasoning
    target.triage = {
      verdict: input.verdict,
      reasoning:
        priorReasoning && priorReasoning.trim().length > 0
          ? priorReasoning
          : `Set to ${input.verdict} from the dashboard.`,
      enrichment: target.triage?.enrichment,
    }

    result.summary = recomputeSummary(result.reviews)

    yield* store.save(resolved, result)
    return { filePath: resolved, result, issue: target }
  })
