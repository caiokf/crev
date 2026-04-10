export const claudeSkill = `---
name: crev
description: Run AI-powered multi-reviewer code reviews
compatibility: Requires crev CLI (npx crev or npm i -g crev)
---

# crev — AI Code Review Orchestrator

You have access to the \`crev\` CLI for running multi-AI code reviews.

## Quick Reference

    crev run --schema <name>              # Run a review
    crev run --schema quick --pr 42       # Review a PR
    crev run --schema quick --base main   # Review current branch vs main
    crev validate --all                   # Validate all schemas
    crev list --json                      # List schemas, runtimes, agents
    crev help schema                      # Schema authoring reference

## Workflow

### Running a Review

1. Check available schemas: \`crev list --schemas\`
2. Run the review: \`crev run --schema <name> --base main --json\`
3. Read the output file from \`.crev/reviews/\`
4. For each issue with status "open":
   - If actionable: fix the code
   - If not actionable: update the review file to mark as "wont-fix"
5. Re-run with \`--review-file\` to merge:
   \`crev run --schema <name> --review-file .crev/reviews/<file>.json\`

### Creating a Schema

Schemas live in \`.crev/schemas/\`. Run \`crev help schema\` for the full spec.

### Reading Results

Review results are JSON in \`.crev/reviews/\`. Key fields per issue:
- \`severity\`: critical, high, medium, low
- \`category\`: bug, security, performance, style, compliance, architecture
- \`status\`: open, fixed, wont-fix
- \`triage.verdict\`: actionable, deferred, dismissed (if triage enabled)

### Giving Progress Updates

When running a review, inform the user:
- Which schema you're using and how many reviewers
- That reviewers run in parallel (typical: 30-90 seconds)
- When complete, summarize: X issues found (Y critical, Z high)
- Ask the user which issues to fix vs dismiss
`
