export const skillContent = `---
name: crev
description: Use when running AI code reviews, reviewing PRs, validating schemas, or setting up crev in a project - orchestrates multi-AI reviewer code reviews via the crev CLI with parallel execution, triage, and structured JSON output.
---

# crev

Multi-AI code review CLI. Runs multiple AI reviewers in parallel against a diff, normalizes findings, and optionally triages them.

## Quick Reference

| Task                        | Command                                                  |
|-----------------------------|----------------------------------------------------------|
| Run a review                | \`crev run --schema <name> --base main\`                   |
| Review a PR                 | \`crev run --schema <name> --pr 42\`                       |
| Review uncommitted changes  | \`crev run --schema <name> --type uncommitted\`            |
| Review entire codebase      | \`crev run --schema <name> --type current-state\`          |
| CI mode (no TUI)            | \`crev run --schema <name> --plain --json\`                |
| Subset of reviewers         | \`crev run --schema <name> --reviewers "Security,Arch"\`   |
| Preview prompts only        | \`crev run --schema <name> --prompt-only\`                 |
| Merge into existing review  | \`crev run --schema <name> --review-file <path>\`          |
| List schemas/runtimes       | \`crev list --schemas\` / \`crev list --runtimes\`           |
| Validate all schemas        | \`crev schema validate --all\`                             |
| Show schema details         | \`crev schema show <name>\`                                |
| Preview diff                | \`crev diff --base main\`                                  |
| Health check                | \`crev doctor\`                                            |
| Scaffold new schema         | \`crev schema init <name>\`                                |
| Full setup                  | \`crev init\`                                              |
| Regenerate AI tool skills   | \`crev update\`                                            |
| Review stats (latest)       | \`crev stats --schema <name>\`                             |
| Review stats (all versions) | \`crev stats --schema <name> --history\`                   |
| Detailed help               | \`crev help run\` / \`crev help schema\`                     |

## Workflow

### Running a Review

1. Pick a schema: \`crev list --schemas\`
2. Run: \`crev run --schema <name> --base main\`
3. Read output from \`.crev/reviews/<slug>.json\`
4. For each open issue: fix the code or mark as \`wont-fix\` in the JSON
5. Re-run to merge: \`crev run --schema <name> --review-file .crev/reviews/<slug>.json\`

### Reading Results

Output JSON structure:
- \`metadata\` — slug, timestamp, schema used, diff info
- \`reviews[]\` — per-reviewer: name, runtime, model, duration, issues
- \`summary\` — totals by severity, category, status, reviewer, triage

Each issue has:
- \`severity\`: critical | high | medium | low
- \`category\`: bug | security | performance | style | compliance | architecture
- \`status\`: open | fixed | wont-fix
- \`triage.verdict\`: actionable | deferred | dismissed (when triage enabled)
- \`file\`, \`line\`, \`title\`, \`description\`

### Creating a Schema

Schemas live in \`.crev/schemas/<name>.yaml\`:

\\\`\\\`\\\`yaml
description: What this schema reviews for
reviewers:
  - name: Security
    runtime: claude
    model: opus
    agent: security.md        # file in .crev/agents/
  - name: Quick Check
    runtime: gemini
    model: gemini-2.5-flash
    prompt: "Focus on bugs and logic errors only."  # inline prompt
  - name: Architecture
    runtime: claude
    model: opus
    scope: codebase            # review full source files, not just diff
    context:                   # extra files/globs included as context
      - packages/cli/src/bin.ts
      - packages/cli/src/commands/*.ts
triage:
  enabled: true
  runtime: claude
  model: opus
\\\`\\\`\\\`

Per-reviewer fields:
- \`prompt\` / \`agent\`: mutually exclusive. CodeRabbit accepts neither.
- \`scope\`: \`diff\` (default) reviews the diff only. \`codebase\` includes full source of changed files.
- \`context\`: array of file paths or globs. Contents are appended to the prompt as additional context.

### Schema Authoring: Black-Box Approach

When writing reviewer prompts and agent files, treat the target codebase as a **black box**. Schemas should be portable and resilient to internal refactors.

**Avoid** in prompts and agent instructions:
- Specific file paths (\`src/core/schema.ts\`, \`lib/utils/helpers.ts\`)
- Internal directory structures (\`the handler in src/commands/\`)
- References to specific function names, class names, or variable names that are implementation details
- Assumptions about where code lives within the project

**Encouraged** in prompts and agent instructions:
- Coding patterns and conventions ("use early returns", "prefer composition over inheritance")
- Code examples showing desired style or anti-patterns
- Conceptual guidance ("API endpoints should validate input at the boundary")
- Category-level references ("test files", "configuration files", "entry points")
- Architectural principles ("keep business logic separate from transport layer")

**Exception — stable top-level structure**: References to well-known, stable top-level directories (e.g., \`packages/\`, \`src/\`, \`schemas/\`, \`.crev/\`) are acceptable when they represent permanent structural boundaries unlikely to change. The distinction: \`src/\` as a concept is stable; \`src/core/schema.ts\` as a specific file is not.

**Why**: Codebases evolve — files move, directories get renamed, modules get extracted. Schemas tied to specific paths break silently when the code changes. Black-box schemas remain effective across refactors because they describe *what to look for* conceptually, not *where to find it*.

### Reviewing Effectiveness

Use \`crev stats\` to evaluate reviewer signal-to-noise and tune schemas:

1. Run: \`crev stats --schema <name>\` — shows per-reviewer actionable/dismissed rates, cost per actionable finding, and recurring dismissed patterns
2. Use \`--history\` to compare across schema revisions (tracks by content hash) — see if prompt changes improved signal
3. High dismissed rate + recurring patterns = reviewer needs prompt tightening or removal from quick schemas
4. \`--json\` for machine-readable output

### Displaying Stats

When the user asks to see stats or reviewer effectiveness, run \`crev stats --schema <name>\` and display the results as a formatted table:

| Reviewer | Runtime | Runs | Issues | Actioned | Dismissed | Avg Time | Cost/Act |
|----------|---------|------|--------|----------|-----------|----------|----------|
| Bug Hunter | claude/opus | 10 | 66 | 19 (40%) | 19 (40%) | 231s | 122s |

Include:
- Runtime and model for each reviewer (e.g. \`claude/opus\`, \`codex/gpt-5.3-codex\`)
- Actionable and dismissed rates as count + percentage
- Average duration and cost per actionable finding
- Recurring dismissed patterns section — highlights issues the user should address in prompts
- Brief commentary: which reviewers are most/least effective, which need prompt tuning or removal

### Progress Updates

When running a review, tell the user:
- Which schema and how many reviewers
- Reviewers run in parallel (30-90s typical)
- When done: summarize issue counts by severity
- Ask which issues to fix vs dismiss
`
