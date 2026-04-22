# AGENTS.md

## What is crev?

Multi-AI code review CLI. Runs multiple AI reviewers in parallel against a diff (or full codebase), normalizes findings into structured JSON, and optionally triages them with a devil's advocate pass.

## Architecture

```
src/
├── bin.ts                    # CLI entry point (Commander.js)
├── commands/                 # CLI subcommands (run, init, doctor, show, etc.)
├── core/                     # Business logic
│   ├── orchestrator.ts       # Main review pipeline: parallel execution, triage, output
│   ├── normalizer.ts         # JSON extraction from raw AI output
│   ├── triage.ts             # Devil's advocate triage pass
│   ├── diff.ts               # Git diff generation and filtering
│   ├── schema.ts             # YAML schema parsing and validation (Zod)
│   ├── config.ts             # Config loading and model alias resolution
│   ├── json-extract.ts       # Robust JSON extraction from free-text
│   └── types.ts              # Core types: RunCommand, ReviewResult, DiffSource
├── templates/                # Starter schemas, config, and skill templates
├── tui/                      # TUI components (multi-spinner, ANSI utils)
└── util/                     # Helpers (path resolution, AI tool detection)

web/                          # Vue 3 docs site (Cloudflare Pages) — separate from CLI
.crev/                        # Project's own crev config and schemas
```

## Key abstractions

- **`@caiokf/valet`** — Runtime adapter library. Each AI CLI (Claude, Codex, Gemini, etc.) has an adapter. Adding a runtime to valet auto-registers it in crev.
- **Schema** — YAML file defining reviewers (name, runtime, model, prompt/agent) and optional triage config. Lives in `.crev/schemas/`.
- **DiffInput** — The diff + metadata passed to reviewers. Generated from PR, branch, commit, or `--analyze` mode.
- **ReviewResult** — Structured JSON output with metadata, per-reviewer issues, and summary.

## Two review modes

1. **Review changes** (default) — crev generates a diff and passes it as a file reference. Reviewers read the diff from the filesystem.
2. **Analyze codebase** (`--analyze`) — No diff. Reviewers get a file list and read directly from the filesystem.

There is no file inlining. Reviewers always have filesystem access and read files themselves.

## Conventions

- **TypeScript, ESM-only.** Target ES2022. Build with `tsup`, test with `vitest`.
- **Zod for validation** at parse boundaries (config, schema, CLI flags). Internal code trusts types.
- **Discriminated unions** for mutually exclusive states (`DiffSource`, `OutputMode`, `ReviewTarget`).
- **No file inlining in prompts.** Always pass file references. Agents read from the filesystem.
- **Parallel execution.** Reviewers run via `Promise.allSettled`. TUI shows live progress.
- **Tests mirror source structure.** `src/core/foo.ts` → `src/core/foo.test.ts`.

## Running

```bash
pnpm install
pnpm build          # tsup
pnpm test           # vitest run
pnpm crev           # build + run from source
```

## Testing

- `npx vitest run` — run all tests
- `npx vitest run src/core/orchestrator.test.ts` — run a specific file
- Tests use temp directories (`fs.mkdtempSync`) for filesystem tests, cleaned up in `afterEach`

## Common tasks

- **Add a runtime** — Add it in `@caiokf/valet`. It auto-registers in crev.
- **Add a CLI command** — Create `src/commands/<name>.ts`, register in `src/bin.ts`.
- **Add a schema template** — Add to `src/templates/schemas/`, register in `src/commands/init.ts`.
- **Update the skill** — Edit `src/templates/skills/skill.ts` (template) and `.claude/skills/crev/SKILL.md` (this project's copy).
