export const copilotPrompt = `# crev — AI Code Review

You have access to the \`crev\` CLI for running multi-AI code reviews.

## Commands

- \`crev run --schema <name> --base main --json\` — Run a review
- \`crev list --json\` — List available schemas
- \`crev validate --all\` — Validate all schemas
- \`crev help schema\` — Schema format reference

## Workflow

1. Check available schemas with \`crev list --schemas\`
2. Run review: \`crev run --schema quick --base main --json\`
3. Read output from \`.crev/reviews/\`
4. Fix issues or mark as wont-fix in the JSON file
5. Re-run with \`--review-file\` to merge
`
