---
name: crev
description: Use when running AI code reviews, reviewing PRs, validating schemas, or setting up crev in a project - orchestrates multi-AI reviewer code reviews via the crev CLI with parallel execution, triage, and structured JSON output.
---

# crev

Multi-AI code review CLI. Runs multiple AI reviewers in parallel against a diff, normalizes findings, and optionally triages them.

## Quick Reference

| Task                        | Command                                                  |
|-----------------------------|----------------------------------------------------------|
| Run a review                | `crev run --schema <name> --base main`                   |
| Review a PR                 | `crev run --schema <name> --pr 42`                       |
| Review uncommitted changes  | `crev run --schema <name> --type uncommitted`            |
| Review entire codebase      | `crev run --schema <name> --type current-state`          |
| CI mode (no TUI)            | `crev run --schema <name> --plain --json`                |
| Subset of reviewers         | `crev run --schema <name> --reviewers "Security,Arch"`   |
| Preview prompts only        | `crev run --schema <name> --prompt-only`                 |
| Merge into existing review  | `crev run --schema <name> --review-file <path>`          |
| List schemas/runtimes       | `crev list --schemas` / `crev list --runtimes`           |
| Validate all schemas        | `crev schema validate --all`                             |
| Show schema details         | `crev schema show <name>`                                |
| Preview diff                | `crev diff --base main`                                  |
| Health check                | `crev doctor`                                            |
| Scaffold new schema         | `crev schema init <name>`                                |
| Full setup                  | `crev init`                                              |
| Regenerate AI tool skills   | `crev update`                                            |
| Detailed help               | `crev help run` / `crev help schema`                     |

## Workflow

### Running a Review

1. Pick a schema: `crev list --schemas`
2. Run: `crev run --schema <name> --base main`
3. Read output from `.crev/reviews/<slug>.json`
4. For each open issue: fix the code or mark as `wont-fix` in the JSON
5. Re-run to merge: `crev run --schema <name> --review-file .crev/reviews/<slug>.json`

### Reading Results

Output JSON structure:
- `metadata` — slug, timestamp, schema used, diff info
- `reviews[]` — per-reviewer: name, runtime, model, duration, issues
- `summary` — totals by severity, category, status, reviewer, triage

Each issue has:
- `severity`: critical | high | medium | low
- `category`: bug | security | performance | style | compliance | architecture
- `status`: open | fixed | wont-fix
- `triage.verdict`: actionable | deferred | dismissed (when triage enabled)
- `file`, `line`, `title`, `description`

### Creating a Schema

Schemas live in `.crev/schemas/<name>.yaml`:

```yaml
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
```

Per-reviewer fields:
- `prompt` / `agent`: mutually exclusive. CodeRabbit accepts neither.
- `scope`: `diff` (default) reviews the diff only. `codebase` includes full source of changed files.
- `context`: array of file paths or globs. Contents are appended to the prompt as additional context.

### Progress Updates

When running a review, tell the user:
- Which schema and how many reviewers
- Reviewers run in parallel (30-90s typical)
- When done: summarize issue counts by severity
- Ask which issues to fix vs dismiss
