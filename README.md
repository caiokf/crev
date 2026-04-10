```
  ██████ ████████  ████████ ██     ██
 ██      ██     ██ ██       ██     ██
 ██      ████████  █████    ██     ██
 ██      ██   ██   ██        ██   ██
  ██████ ██     ██ ████████    ███
```

# crev

### Use your existing subscriptions

AI code review tools typically require separate API keys and per-token billing. You're already paying for Claude Code, Gemini CLI, Codex, or other AI coding subscriptions -- crev runs reviews through those CLI tools directly. No extra API keys. No extra billing.

### Run multiple reviewers in parallel

Define a review schema with multiple reviewers using different models and prompts, and crev executes them all simultaneously. A security expert on Claude, an architect on Gemini, and a performance reviewer on Codex -- all running at the same time, all finishing in the time it takes the slowest one to complete.

### Configurable and reusable

YAML schemas define your review pipeline. Inline prompts or external agent files shape what each reviewer focuses on. Run the same review across PRs, branches, or commits. Share schemas across your team.

```bash
# 1 reviewer, fast feedback
crev run --schema quick --base main

# 3 reviewers + triage pass
crev run --schema standard --base main

# 6 specialized reviewers + dedup triage
crev run --schema thorough --base main
```

## Install

```bash
npm install -g crev
```

Or use without installing:

```bash
npx crev init
npx crev run --schema quick --base main
```

## Quick Start

```bash
# Initialize crev in your project
crev init

# Run a quick review against main branch
crev run --schema quick --base main

# Review a specific PR
crev run --schema quick --pr 42

# Review a specific commit
crev run --schema quick --base-commit abc1234
```

## How It Works

1. **Define a schema** -- Pick which runtimes, models, and prompts to use
2. **crev generates the diff** -- From your branch, PR, or commit
3. **Reviewers run in parallel** -- Each runtime gets the diff and a structured prompt
4. **Output is normalized** -- All results are merged into a single JSON review
5. **Optional triage** -- An AI pass deduplicates and prioritizes findings

```yaml
# .crev/schemas/standard.yaml
description: Three-reviewer standard check
reviewers:
  - name: Engineer
    runtime: claude
    model: sonnet
    prompt: >
      You are a senior software engineer reviewing code changes.
      Focus on correctness, error handling, edge cases, and readability.

  - name: Security
    runtime: gemini
    model: gemini-2.5-pro
    prompt: >
      You are a senior security engineer reviewing code changes.
      Focus on injection vulnerabilities, auth flaws, and secrets exposure.

  - name: Architect
    runtime: codex
    model: o3
    prompt: >
      You are a senior software architect reviewing code changes.
      Focus on coupling, abstraction quality, and scalability concerns.

triage:
  enabled: true
```

Each reviewer can use either an inline `prompt` or an `agent` field pointing to any external file:

```yaml
reviewers:
  - name: Security
    runtime: claude
    model: opus
    agent: ../.claude/agents/security-reviewer.md
```

## Supported Runtimes

| Runtime | CLI | Auth |
|---|---|---|
| Claude Code | `claude` | Subscription or `ANTHROPIC_API_KEY` |
| Codex | `codex` | `OPENAI_API_KEY` |
| Gemini CLI | `gemini` | `GEMINI_API_KEY` or `GOOGLE_API_KEY` |
| Kimi | `kimi` | `MOONSHOT_API_KEY` |
| CodeRabbit | `cr` | `cr auth status` |
| OpenCode | `opencode` | `~/.opencode/config.json` |
| Droid | `droid` | Subscription |
| MastraCode | `mastracode` | Subscription |
| Pi | `pi` | Subscription |

Run `crev doctor` to check which runtimes are available.

## Commands

| Command | Description |
|---|---|
| `crev init` | Interactive setup |
| `crev run` | Execute a review |
| `crev doctor` | Check runtime health |
| `crev list` | List schemas and runtimes |
| `crev schema show <name>` | Display schema details |
| `crev schema validate` | Validate schemas |
| `crev show [file]` | Pretty-print a review file (default: latest) |
| `crev diff` | Preview diff that would be reviewed |
| `crev update` | Regenerate AI tool skills |
| `crev schema init <name>` | Scaffold a new schema |
| `crev help <topic>` | Detailed help (run, schema) |

## Project Structure

After `crev init`:

```
.crev/
├── config.yaml          # Global config and model aliases
├── schemas/
│   ├── quick.yaml       # 1 reviewer, fast
│   ├── standard.yaml    # 3 reviewers + triage
│   └── thorough.yaml    # 6 reviewers + triage
└── reviews/             # Review output (JSON)
```

## Packages

This is a monorepo with two packages:

- **`crev`** -- The CLI tool
- **`@crev/runtimes`** -- Standalone runtime adapter library

```bash
npm install @crev/runtimes
```

```typescript
import { getRuntime, getAllRuntimes } from "@crev/runtimes"

const claude = getRuntime("claude")
const health = await claude.healthCheck()
```

## License

MIT
