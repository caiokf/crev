export const cursorSkill = `---
name: crev
description: Use when running AI code reviews, reviewing PRs, or validating schemas - orchestrates multi-AI reviewer code reviews via the crev CLI.
---

# crev

Multi-AI code review CLI. Runs reviewers in parallel, normalizes findings, optionally triages.

## Commands

    crev run --schema <name> --base main     # Run review against branch
    crev run --schema <name> --pr 42         # Review a PR
    crev run --schema <name> --type uncommitted  # Review working tree
    crev run --schema <name> --plain --json  # CI mode
    crev run --schema <name> --prompt-only   # Preview prompts
    crev list --schemas                      # List schemas
    crev validate --all                      # Validate schemas
    crev doctor                              # Health check
    crev init                                # Setup .crev/
    crev help schema                         # Schema reference

## Workflow

1. \`crev list --schemas\` to see available schemas
2. \`crev run --schema <name> --base main\` to run
3. Read \`.crev/reviews/<slug>.json\` output
4. Fix issues or mark as \`wont-fix\` in the JSON
5. Re-run with \`--review-file\` to merge updated statuses

## Results

Each issue: \`severity\` (critical/high/medium/low), \`category\` (bug/security/performance/style/compliance/architecture), \`status\` (open/fixed/wont-fix), optional \`triage.verdict\`.
`
