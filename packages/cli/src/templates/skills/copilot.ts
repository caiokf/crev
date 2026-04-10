export const copilotPrompt = `# crev

Multi-AI code review CLI. Runs reviewers in parallel, normalizes findings, optionally triages.

## Commands

- \`crev run --schema <name> --base main\` — Run review against branch
- \`crev run --schema <name> --pr 42\` — Review a PR
- \`crev run --schema <name> --type uncommitted\` — Review working tree
- \`crev run --schema <name> --type current-state\` — Review entire codebase
- \`crev run --schema <name> --plain --json\` — CI mode
- \`crev list --schemas\` — List available schemas
- \`crev validate --all\` — Validate all schemas
- \`crev doctor\` — Health check
- \`crev init\` — Setup .crev/
- \`crev help schema\` — Schema format reference

## Workflow

1. \`crev list --schemas\` to see available schemas
2. \`crev run --schema <name> --base main\` to run
3. Read output from \`.crev/reviews/<slug>.json\`
4. Fix issues or mark as wont-fix in the JSON
5. Re-run with \`--review-file\` to merge

## Schema Fields

Per-reviewer: name, runtime, model (required). Optional: prompt, agent (mutually exclusive), scope (diff|codebase, default: diff), context (file paths/globs for extra context).

## Results

Each issue: severity (critical/high/medium/low), category (bug/security/performance/style/compliance/architecture), status (open/fixed/wont-fix), optional triage verdict.
`
