export const cursorSkill = `---
name: crev
description: Run AI-powered multi-reviewer code reviews
---

# crev — AI Code Review

Run multi-AI code reviews with \`crev\`.

## Commands

    crev run --schema <name> --base main --json    # Run review
    crev list --json                                # List schemas
    crev validate --all                             # Validate schemas
    crev help schema                                # Schema reference

## Workflow

1. \`crev list --schemas\` to see available review schemas
2. \`crev run --schema <name> --base main --json\` to run
3. Read \`.crev/reviews/\` output, fix issues or mark as wont-fix
4. Re-run with \`--review-file\` to merge updated statuses
`
