```
  ██████ ████████  ████████ ██     ██
 ██      ██     ██ ██       ██     ██
 ██      ████████  █████    ██     ██
 ██      ██   ██   ██        ██   ██
  ██████ ██     ██ ████████    ███
```

# crev

AI-powered multi-reviewer code review CLI. Run parallel code reviews using multiple AI models and personas, then triage and merge the results.

## Features

- **Multi-model reviews** — Run Claude, Codex, Gemini, Kimi, CodeRabbit, and OpenCode in parallel
- **Reviewer personas** — Define agent personas (security expert, architect, etc.) with custom prompts
- **Configurable schemas** — YAML-based review schemas with per-reviewer model/prompt/agent settings
- **Triage pass** — Optional AI triage to deduplicate and prioritize findings
- **Issue lifecycle** — Track issues across re-runs with merge support (preserves fixed/wont-fix)
- **AI tool integration** — Auto-generates skills for Claude Code, Cursor, Windsurf, OpenCode, Copilot
- **TUI spinners** — Animated multi-spinner with keyboard controls (f=finalize, q=quit)

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

# Run with JSON output
crev run --schema standard --base main --json

# Review a specific PR
crev run --schema quick --pr 42

# Review a specific commit
crev run --schema quick --commit abc1234
```

## Commands

| Command | Description |
|---|---|
| `crev init` | Interactive setup TUI |
| `crev run` | Execute a review |
| `crev list` | List schemas, runtimes, agents |
| `crev show <schema>` | Display schema details |
| `crev validate` | Validate schemas |
| `crev review <file>` | Pretty-print a review file |
| `crev diff` | Preview diff that would be reviewed |
| `crev doctor` | Check runtime health |
| `crev update` | Regenerate AI tool skills |
| `crev schema-init <name>` | Scaffold a new schema |
| `crev agent-init <name>` | Scaffold a new agent persona |
| `crev help <topic>` | Detailed help (run, schema, agents) |

## Directory Structure

After `crev init`, your project gets:

```
.crev/
├── config.yaml          # Global defaults
├── schemas/
│   ├── quick.yaml       # 1 reviewer, fast
│   ├── standard.yaml    # 3 reviewers + triage
│   └── thorough.yaml    # 6 reviewers + triage
├── agents/
│   ├── engineer.md      # Correctness & edge cases
│   ├── security.md      # OWASP & vulnerabilities
│   └── architect.md     # Design & coupling
├── diffs/               # Cached diffs
└── reviews/             # Review output (JSON)
```

## Schema Format

Schemas are YAML files that define how a review runs:

```yaml
description: Quick single-reviewer check
reviewers:
  - name: Engineer
    runtime: claude
    model: sonnet
    agent: engineer.md

triage:
  enabled: false
```

See `crev help schema` for the full spec.

## Supported Runtimes

| Runtime | CLI | Auth |
|---|---|---|
| Claude | `claude` | `claude auth status` or `ANTHROPIC_API_KEY` |
| Codex | `codex` | `OPENAI_API_KEY` |
| Gemini | `gemini` | `GEMINI_API_KEY` or `GOOGLE_API_KEY` |
| Kimi | `kimi` | `MOONSHOT_API_KEY` |
| CodeRabbit | `cr` | `cr auth status` |
| OpenCode | `opencode` | `~/.opencode/config.json` |

Run `crev doctor` to check which runtimes are installed and authenticated.

## Packages

This is a monorepo with two packages:

- **`crev`** — The CLI tool
- **`@crev/runtimes`** — Standalone runtime adapter library (use in your own tools)

```bash
npm install @crev/runtimes
```

```typescript
import { getRuntime, getAllRuntimes } from "@crev/runtimes"

const claude = getRuntime("claude")
const health = await claude.healthCheck()
console.log(health) // { installed: true, authenticated: "yes" }
```

## License

MIT
