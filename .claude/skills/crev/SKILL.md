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
| Analyze entire codebase     | `crev run --schema <name> --analyze`                     |
| CI mode (no TUI)            | `crev run --schema <name> --plain --json`                |
| Subset of reviewers         | `crev run --schema <name> --reviewers "Security,Arch"`   |
| Override reviewer models    | `crev run --schema <name> --model codex/chatgpt-5.3`    |
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
| Show resolved config        | `crev config`                                            |
| Show config layers          | `crev config --layers`                                   |
| Review stats (latest)       | `crev stats --schema <name>`                             |
| Review stats (all versions) | `crev stats --schema <name> --history`                   |
| Detailed help               | `crev help run` / `crev help schema`                     |

## Configuration

### Layered Config

Config is loaded from three layers, deep-merged from lowest to highest priority:

1. `~/.crev/config.yaml` — user/machine defaults (shared across all projects)
2. `.crev/config.yaml` — project config (git-tracked, shared with team)
3. `.crev/config.local.yaml` — local overrides (gitignored, per-developer)

**Merge rules:**
- Objects merge recursively (adding an alias in local doesn't clobber project aliases)
- Arrays replace entirely (local `diff.exclude` replaces project's list)
- Scalars overwrite (higher priority wins)

Run `crev config` to see the fully resolved config with annotations showing which file provided each value.
Run `crev config --layers` to see which config files are active.

### Layered Schemas

Schemas are resolved in priority order (first match wins, no merging within a schema):

1. `.crev/schemas/<name>.local.yaml` — local override (gitignored)
2. `.crev/schemas/<name>.yaml` — project schema (git-tracked)
3. `~/.crev/schemas/<name>.yaml` — user schema (personal defaults)

To override a project schema locally, create `.crev/schemas/<name>.local.yaml` with the full schema content.
To add a personal schema available across all projects, place it in `~/.crev/schemas/`.

**Files to gitignore:**
```
.crev/config.local.yaml
.crev/schemas/*.local.yaml
```

## Workflow

### Running a Review

1. Pick a schema: `crev list --schemas`
2. Run: `crev run --schema <name> --base main`
3. Read output from `.crev/reviews/<slug>.json`
4. For each issue: fix it or set `status: "wont-fix"` when intentionally not fixing
5. Re-run to merge: `crev run --schema <name> --review-file .crev/reviews/<slug>.json`

### Overriding Models at Runtime

Use `--model` to override the runtime/model pair for reviewers without editing the schema file:

```bash
# Override ALL reviewers to a different runtime/model
crev run --schema standard --model codex/chatgpt-5.3

# Override SPECIFIC reviewers (case-insensitive name matching)
crev run --schema standard --model "Engineer=codex/chatgpt-5.3" --model "Security=claude/sonnet"

# Mix: blanket default + per-reviewer override (per-reviewer wins)
crev run --schema standard --model codex/chatgpt-5.3 --model "Security=claude/sonnet"
```

Format: `runtime/model` for all reviewers, or `Name=runtime/model` for a specific reviewer. The flag is repeatable.

### Reading Results

Output JSON structure:
- `metadata` — slug, timestamp, schema used, diff info
- `reviews[]` — per-reviewer: name, runtime, model, duration, issues
- `summary` — totals by severity, category, reviewer, triage

Each issue has:
- `severity`: critical | high | medium | low
- `category`: bug | security | performance | style | compliance | architecture
- `status`: open | fixed | wont-fix (optional, defaults to open)
- `triage.verdict`: actionable | deferred | dismissed (when triage enabled)
- `triage.reasoning`: why triage decided that verdict
- `triage.enrichment` (when `triage.enrichComments: true`):
  - `title`: issue headline used in PR comment
  - `context`: short evidence paragraph (where + what + risk)
  - `minimalFix.summary`: one-line fix strategy
  - `minimalFix.language`: code fence language (`diff`, `ts`, `js`, `yaml`, `bash`, `text`)
  - `minimalFix.patch`: concrete minimal patch/snippet
  - `promptForAgents`: explicit prompt another agent can run to verify/fix
- `file`, `line`, `title`, `description`

Enrichment shape:
```json
{
  "triage": {
    "verdict": "actionable",
    "reasoning": "Missing IAM permission will cause runtime AccessDenied.",
    "enrichment": {
      "title": "Add IAM permission for the new M2M secret ARN",
      "context": "Line 102 adds the secret env var, but the role policy still only allows old secret ARNs.",
      "minimalFix": {
        "summary": "Include the new secret ARN in `secretsmanager:GetSecretValue` resources.",
        "language": "diff",
        "patch": "- old\n+ new"
      },
      "promptForAgents": "Verify the finding against current code and patch the role policy with the new ARN."
    }
  }
}
```

### Posting PR Comments (CodeRabbit Style)

When the user asks to post findings to the PR:
1. Ensure triage enrichment is enabled (`triage.enrichComments: true`) before running review.
2. Only post issues where `triage.verdict === "actionable"`.
3. Post one comment per issue.
4. Use the markdown template below exactly, including collapsible blocks.
5. Keep `minimalFix.patch` and `promptForAgents` verbatim from triage enrichment.
6. If enrichment is missing, synthesize it from the issue + triage reasoning before posting.

Severity badge mapping:
- `critical` → `🔴 Critical`
- `high` → `🟠 High`
- `medium` → `🟡 Medium`
- `low` → `🔵 Low`

Exact comment template:
````md
⚠️ **Potential issue** | {{severity_badge}}

**{{triage.enrichment.title}}**

{{triage.enrichment.context}}

<details>
<summary>💡 Minimal fix</summary>

{{triage.enrichment.minimalFix.summary}}

```{{triage.enrichment.minimalFix.language}}
{{triage.enrichment.minimalFix.patch}}
```
</details>

<details>
<summary>🤖 Prompt for AI Agents</summary>

```text
{{triage.enrichment.promptForAgents}}
```
</details>
````

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
    prompt: >
      You are a senior software architect reviewing code changes.
      Focus on coupling, abstraction quality, API design, and dependency direction.
triage:
  enabled: true
  runtime: claude
  model: opus
  enrichComments: true
```

Per-reviewer fields:
- `prompt` / `agent`: mutually exclusive. CodeRabbit accepts neither.
- Reviewers have full filesystem access and can read any file in the repository during review.

### Schema Authoring: Black-Box Approach

When writing reviewer prompts and agent files, treat the target codebase as a **black box**. Schemas should be portable and resilient to internal refactors.

**Avoid** in prompts and agent instructions:
- Specific file paths (`src/core/schema.ts`, `lib/utils/helpers.ts`)
- Internal directory structures (`the handler in src/commands/`)
- References to specific function names, class names, or variable names that are implementation details
- Assumptions about where code lives within the project

**Encouraged** in prompts and agent instructions:
- Coding patterns and conventions ("use early returns", "prefer composition over inheritance")
- Code examples showing desired style or anti-patterns
- Conceptual guidance ("API endpoints should validate input at the boundary")
- Category-level references ("test files", "configuration files", "entry points")
- Architectural principles ("keep business logic separate from transport layer")

**Exception — stable top-level structure**: References to well-known, stable top-level directories (e.g., `packages/`, `src/`, `schemas/`, `.crev/`) are acceptable when they represent permanent structural boundaries unlikely to change. The distinction: `src/` as a concept is stable; `src/core/schema.ts` as a specific file is not.

**Why**: Codebases evolve — files move, directories get renamed, modules get extracted. Schemas tied to specific paths break silently when the code changes. Black-box schemas remain effective across refactors because they describe *what to look for* conceptually, not *where to find it*.

### Reviewing Effectiveness

Use `crev stats` to evaluate reviewer signal-to-noise and tune schemas:

1. Run: `crev stats --schema <name>` — shows per-reviewer actionable/dismissed rates, cost per actionable finding, and recurring dismissed patterns
2. Use `--history` to compare across schema revisions (tracks by content hash) — see if prompt changes improved signal
3. High dismissed rate + recurring patterns = reviewer needs prompt tightening or removal from quick schemas
4. `--json` for machine-readable output

### Displaying Stats

When the user asks to see stats or reviewer effectiveness, run `crev stats --schema <name>` and display the results as a formatted table:

| Reviewer | Runtime | Runs | Issues | Actioned | Dismissed | Avg Time | Cost/Act |
|----------|---------|------|--------|----------|-----------|----------|----------|
| Bug Hunter | claude/opus | 10 | 66 | 19 (40%) | 19 (40%) | 231s | 122s |

Include:
- Runtime and model for each reviewer (e.g. `claude/opus`, `codex/gpt-5.3-codex`)
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
