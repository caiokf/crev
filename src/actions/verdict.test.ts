import { Effect, Exit } from "effect"
import { describe, expect, it } from "vitest"
import { setVerdictAction } from "./verdict.js"
import { makeTestReviewStore } from "../services/ReviewStore.js"
import type { ReviewIssue, ReviewResult } from "../core/types.js"
import { extractFailError } from "../util/cli-errors.js"

function makeIssue(overrides: Partial<ReviewIssue> = {}): ReviewIssue {
  return {
    id: "i-1",
    reviewer: "Engineer",
    runtime: "claude",
    model: "sonnet",
    file: "src/foo.ts",
    line: 42,
    severity: "high",
    category: "bug",
    title: "Null deref",
    description: "calling .trim() on possibly undefined value",
    ...overrides,
  }
}

function makeReview(issues: ReviewIssue[]): ReviewResult {
  return {
    metadata: {
      slug: "add-feature",
      timestamp: "2026-04-23T12:34:56Z",
      schema: "quick",
      diffType: "all",
      diffBase: "main",
    },
    reviews: [
      {
        reviewer: "Engineer",
        runtime: "claude",
        model: "sonnet",
        durationMs: 1200,
        exitCode: 0,
        rawLength: 100,
        issues,
      },
    ],
    summary: {
      totalIssues: issues.length,
      bySeverity: {},
      byCategory: {},
      byReviewer: {},
    },
  }
}

describe("setVerdictAction", () => {
  it("stamps triage verdict on a previously-untriaged issue", async () => {
    const review = makeReview([makeIssue({ id: "i-1" })])
    const { layer, files } = makeTestReviewStore({ "/repo/x.json": review })

    const exit = await Effect.runPromiseExit(
      setVerdictAction({ filePath: "/repo/x.json", issueId: "i-1", verdict: "actionable" }).pipe(
        Effect.provide(layer),
      ),
    )

    expect(Exit.isSuccess(exit)).toBe(true)
    const saved = files.get("/repo/x.json")!
    expect(saved.reviews[0]!.issues[0]!.triage).toEqual({
      verdict: "actionable",
      reasoning: "Set to actionable from the dashboard.",
      enrichment: undefined,
    })
    // summary.triage is recomputed so the reviewer panel can reflect it
    expect(saved.summary.triage).toEqual({ actionable: 1, deferred: 0, dismissed: 0 })
  })

  it("preserves existing reasoning + enrichment when flipping a verdict", async () => {
    const review = makeReview([
      makeIssue({
        id: "i-1",
        triage: {
          verdict: "actionable",
          reasoning: "Real null deref under user input.",
          enrichment: {
            title: "Null deref",
            context: "ctx",
            minimalFix: { summary: "guard", patch: "if (x) x.trim()" },
            promptForAgents: "Verify + patch",
          },
        },
      }),
    ])
    const { layer, files } = makeTestReviewStore({ "/repo/x.json": review })

    await Effect.runPromise(
      setVerdictAction({ filePath: "/repo/x.json", issueId: "i-1", verdict: "dismissed" }).pipe(
        Effect.provide(layer),
      ),
    )

    const saved = files.get("/repo/x.json")!
    const triage = saved.reviews[0]!.issues[0]!.triage!
    expect(triage.verdict).toBe("dismissed")
    // reasoning + enrichment survive the flip — the user is expressing
    // a one-off disagreement with triage, not re-running it
    expect(triage.reasoning).toBe("Real null deref under user input.")
    expect(triage.enrichment?.promptForAgents).toBe("Verify + patch")
    expect(saved.summary.triage).toEqual({ actionable: 0, deferred: 0, dismissed: 1 })
  })

  it("fails with IssueNotFoundError when the id isn't in the file", async () => {
    const review = makeReview([makeIssue({ id: "i-1" })])
    const { layer } = makeTestReviewStore({ "/repo/x.json": review })

    const exit = await Effect.runPromiseExit(
      setVerdictAction({ filePath: "/repo/x.json", issueId: "nope", verdict: "actionable" }).pipe(
        Effect.provide(layer),
      ),
    )

    expect(Exit.isFailure(exit)).toBe(true)
    if (Exit.isFailure(exit)) {
      const err = extractFailError(exit)
      expect(err?._tag).toBe("IssueNotFoundError")
    }
  })

  it("recomputes summary.triage across mixed verdicts in all reviews", async () => {
    const review: ReviewResult = {
      ...makeReview([]),
      reviews: [
        {
          reviewer: "Engineer",
          runtime: "claude",
          model: "sonnet",
          durationMs: 1200,
          exitCode: 0,
          rawLength: 100,
          issues: [
            makeIssue({
              id: "i-1",
              triage: { verdict: "dismissed", reasoning: "noise" },
            }),
            makeIssue({
              id: "i-2",
              triage: { verdict: "deferred", reasoning: "later" },
            }),
          ],
        },
      ],
    }
    const { layer, files } = makeTestReviewStore({ "/repo/x.json": review })

    await Effect.runPromise(
      setVerdictAction({ filePath: "/repo/x.json", issueId: "i-2", verdict: "actionable" }).pipe(
        Effect.provide(layer),
      ),
    )

    const saved = files.get("/repo/x.json")!
    expect(saved.summary.triage).toEqual({ actionable: 1, deferred: 0, dismissed: 1 })
  })
})
