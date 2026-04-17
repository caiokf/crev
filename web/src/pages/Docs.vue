<script setup lang="ts">
import { ref, onMounted, watch } from "vue"
import { useRoute } from "vue-router"

const route = useRoute()
const activeSection = ref("getting-started")

const sections = [
  { id: "getting-started", label: "Getting Started" },
  { id: "guides", label: "User Guides", group: true },
  { id: "guide-pr", label: "Review a PR" },
  { id: "guide-uncommitted", label: "Uncommitted Changes" },
  { id: "guide-committed", label: "Committed Changes" },
  { id: "guide-codebase", label: "Full Codebase" },
  { id: "guide-branch", label: "Review a Branch" },
  { id: "guide-multi", label: "Multiple Reviews" },
  { id: "guide-worktree", label: "Git Worktrees" },
  { id: "guide-schemas", label: "Custom Schemas" },
  { id: "guide-agents", label: "Agent Definitions" },
  { id: "guide-inline", label: "Inline Prompts" },
  { id: "guide-iterative", label: "Iterative Reviews" },
  { id: "guide-stats", label: "Stats & Tuning" },
  { id: "guide-show", label: "Viewing Reviews" },
  { id: "guide-defaults", label: "Defaults & Tips" },
  { id: "configuration", label: "Configuration", group: true },
  { id: "schemas", label: "Schemas" },
  { id: "runtimes", label: "Runtimes" },
  { id: "models", label: "Models" },
  { id: "triage", label: "Triage" },
  { id: "cli", label: "CLI Reference" },
  { id: "ci-cd", label: "CI/CD" },
  { id: "output", label: "Output Format" },
  { id: "skill", label: "SKILL.md" },
]

function scrollTo(id: string) {
  activeSection.value = id
  const el = document.getElementById(id)
  if (el) el.scrollIntoView({ behavior: "smooth", block: "start" })
}

onMounted(() => {
  if (route.hash) {
    const id = route.hash.slice(1)
    activeSection.value = id
  }

  const observer = new IntersectionObserver(
    (entries) => {
      for (const e of entries) {
        if (e.isIntersecting) {
          activeSection.value = e.target.id
        }
      }
    },
    { rootMargin: "-80px 0px -60% 0px", threshold: 0 },
  )
  sections.forEach((s) => {
    const el = document.getElementById(s.id)
    if (el) observer.observe(el)
  })
})

watch(() => route.hash, (hash) => {
  if (hash) scrollTo(hash.slice(1))
})
</script>

<template>
  <div class="docs">
    <aside class="sidebar">
      <div class="sidebar-inner">
        <h3 class="sidebar-title">Documentation</h3>
        <nav class="sidebar-nav">
          <template v-for="s in sections" :key="s.id">
            <span v-if="s.group" class="sidebar-group">{{ s.label }}</span>
            <a
              v-else
              :href="'#' + s.id"
              :class="{ active: activeSection === s.id, 'sidebar-sub': s.id.startsWith('guide-') }"
              @click.prevent="scrollTo(s.id)"
            >
              {{ s.label }}
            </a>
          </template>
        </nav>
      </div>
    </aside>

    <main class="content">
      <!-- Getting Started -->
      <section id="getting-started">
        <h1>Getting Started</h1>
        <p class="lead">
          <strong>crev</strong> (<strong>C</strong>ode <strong>REV</strong>iew) runs multiple AI reviewers in parallel against your code diffs,
          normalizes findings into structured JSON, and optionally triages them
          with a devil's-advocate pass.
        </p>

        <div class="callout">
          <strong>No API keys needed.</strong> crev runs headless through the CLI
          tools you already have installed (Claude Code, Gemini CLI, Codex CLI, etc.).
          It uses your existing subscriptions &mdash; there are no extra token costs
          or separate API billing.
        </div>

        <h2>Install</h2>
        <div class="code-block">
          <pre><code><span class="c-dim"># npm</span>
npm install -g @caiokf/crev

<span class="c-dim"># homebrew</span>
brew tap caiokf/crev https://github.com/caiokf/crev
brew install crev

<span class="c-dim"># standalone binary</span>
curl -fsSL https://crev.sh/install | sh</code></pre>
        </div>

        <h2>Quick start</h2>
        <div class="code-block">
          <pre><code><span class="c-dim"># Initialize in your project</span>
crev init

<span class="c-dim"># Run a review against main</span>
crev run --schema quick --base main

<span class="c-dim"># Run with the standard (3-reviewer) schema</span>
crev run --schema standard</code></pre>
        </div>

        <p>
          <code>crev init</code> creates a <code>.crev/</code> directory with a
          <code>config.yaml</code> and starter schemas in <code>.crev/schemas/</code>.
        </p>

        <div class="callout">
          <strong>Works with your coding agent.</strong> Running <code>crev init</code>
          installs a skill that coding agents like Claude Code understand natively.
          You don't need to memorize CLI flags &mdash; just ask your agent. It can:
          <ul class="callout-list">
            <li>Run reviews against any branch or PR</li>
            <li>Fix the issues reviewers find</li>
            <li>Create and modify review schemas</li>
            <li>Show statistics on schema performance</li>
          </ul>
        </div>
      </section>

      <!-- ═══════════════════════════════ -->
      <!-- USER GUIDES                    -->
      <!-- ═══════════════════════════════ -->

      <!-- Review a PR -->
      <section id="guide-pr">
        <h1>Review a Pull Request</h1>
        <p class="lead">
          The most common workflow. Point crev at an open (or closed) PR and get
          multi-perspective feedback in seconds.
        </p>

        <div class="code-block">
          <pre><code><span class="c-dim"># Review PR #42 with the standard schema</span>
crev run --schema standard --pr 42

<span class="c-dim"># Review a closed/merged PR — works the same way</span>
crev run --schema thorough --pr 117

<span class="c-dim"># Run only the Security reviewer against a PR</span>
crev run --schema standard --pr 42 --reviewers Security</code></pre>
        </div>

        <p>
          crev fetches the PR diff via <code>gh pr diff</code>, so you need the
          <a href="https://cli.github.com" target="_blank" class="link">GitHub CLI</a>
          installed and authenticated.
        </p>

        <div class="tui-block">
          <div class="tui-bar">output</div>
          <pre class="tui-body">Running 3 reviewers from schema standard
│
│    ◆ Security   (gemini/gemini-2.5-pro)      38.7s  2 issues
│    ◆ Engineer   (claude/sonnet)              42.1s  5 issues
│    ◆ Architect  (claude/opus)                51.3s  1 issue
│
│  Triage: 8 issues → 4 actionable, 2 deferred, 2 dismissed
│
│  Review Summary
│    <span class="tui-green">actionable</span>: 4
│    <span class="tui-yellow">deferred</span>: 2
│    <span class="tui-dim">dismissed</span>: 2
│
│    Output: .crev/reviews/2026-04-17-1523-pr-42.json</pre>
        </div>

        <div class="callout">
          <strong>Your coding agent knows this.</strong> If you've run <code>crev init</code>,
          just tell your agent <em>"review PR 42"</em> and it handles the rest.
        </div>
      </section>

      <!-- Uncommitted Changes -->
      <section id="guide-uncommitted">
        <h1>Review Uncommitted Changes</h1>
        <p class="lead">
          Get feedback before you even commit. Reviews only your unstaged changes
          &mdash; perfect for a quick sanity check while coding.
        </p>

        <div class="code-block">
          <pre><code><span class="c-dim"># Review only unstaged changes</span>
crev run --schema quick --type uncommitted

<span class="c-dim"># Review staged + unstaged (default)</span>
crev run --schema quick --type all</code></pre>
        </div>

        <p>
          <code>--type uncommitted</code> runs <code>git diff</code> (unstaged only).
          <code>--type all</code> includes both staged and unstaged changes. This is
          the default when no <code>--base</code> or <code>--pr</code> is given.
        </p>
      </section>

      <!-- Committed Changes -->
      <section id="guide-committed">
        <h1>Review Committed Changes</h1>
        <p class="lead">
          Review your last commit, or everything you've committed since branching
          off from main.
        </p>

        <div class="code-block">
          <pre><code><span class="c-dim"># Review only the last commit</span>
crev run --schema quick --type committed

<span class="c-dim"># Review all commits since main</span>
crev run --schema standard --base main

<span class="c-dim"># Review since a specific commit</span>
crev run --schema standard --base-commit abc123f</code></pre>
        </div>

        <p>
          <code>--type committed</code> diffs <code>HEAD~1..HEAD</code> (just the last commit).
          <code>--base main</code> diffs your current branch against <code>main</code>, covering
          all your feature branch commits.
        </p>
      </section>

      <!-- Full Codebase -->
      <section id="guide-codebase">
        <h1>Review the Full Codebase</h1>
        <p class="lead">
          Run a review against every tracked file in the repository. Useful for
          initial audits, onboarding to a new codebase, or comprehensive security scans.
        </p>

        <div class="code-block">
          <pre><code><span class="c-dim"># Full codebase review</span>
crev run --schema thorough --type current-state

<span class="c-dim"># Security-focused codebase scan</span>
crev run --schema standard --type current-state --reviewers Security</code></pre>
        </div>

        <p>
          Instead of generating a massive diff, <code>current-state</code> gives reviewers
          the list of all tracked files and instructs them to read and review each one
          directly. This works reliably even on very large repositories.
        </p>

        <div class="callout">
          <strong>Tip:</strong> Combine with <code>scope: codebase</code> in your schema
          to inline the full source of every file into the reviewer's prompt &mdash;
          giving it the deepest possible context for architectural reviews.
        </div>
      </section>

      <!-- Review a Branch -->
      <section id="guide-branch">
        <h1>Review a Branch</h1>
        <p class="lead">
          Review all changes between your current branch and any base.
        </p>

        <div class="code-block">
          <pre><code><span class="c-dim"># Review current branch vs main</span>
crev run --schema standard --base main

<span class="c-dim"># Review vs a different base</span>
crev run --schema standard --base develop

<span class="c-dim"># Review vs a release tag</span>
crev run --schema thorough --base-commit v2.1.0

<span class="c-dim"># Preview what would be reviewed</span>
crev diff --base main</code></pre>
        </div>

        <p>
          Use <code>crev diff --base main</code> first to preview the diff before
          running a full review. This is especially useful to verify you're reviewing
          the right scope.
        </p>
      </section>

      <!-- Multiple Reviews -->
      <section id="guide-multi">
        <h1>Run Multiple Reviews</h1>
        <p class="lead">
          Review several PRs, run different schemas, or combine targets in one session.
        </p>

        <div class="code-block">
          <pre><code><span class="c-dim"># Review 3 PRs in parallel (background each one)</span>
crev run --schema quick --pr 41 &amp;
crev run --schema quick --pr 42 &amp;
crev run --schema quick --pr 43 &amp;
wait

<span class="c-dim"># Run different schemas against the same diff</span>
crev run --schema quick --base main
crev run --schema thorough --base main

<span class="c-dim"># Run specific reviewers from different schemas</span>
crev run --schema standard --reviewers Security --base main
crev run --schema thorough --reviewers Performance,Testing --base main</code></pre>
        </div>

        <p>
          Each run produces its own review artifact in <code>.crev/reviews/</code>.
          Since reviewers run in parallel within each invocation, backgrounding
          multiple <code>crev run</code> commands gives you massive parallelism.
        </p>
      </section>

      <!-- Git Worktrees -->
      <section id="guide-worktree">
        <h1>Git Worktrees</h1>
        <p class="lead">
          Run reviews in isolated git worktrees to avoid interfering with your
          working directory.
        </p>

        <div class="code-block">
          <pre><code><span class="c-dim"># Create a worktree for the feature branch</span>
git worktree add ../review-auth feature/auth

<span class="c-dim"># Run a review in that worktree</span>
cd ../review-auth
crev run --schema standard --base main

<span class="c-dim"># Clean up</span>
cd -
git worktree remove ../review-auth</code></pre>
        </div>

        <p>
          Worktrees let you review branches without switching context. This is
          especially useful when you want to review someone else's branch while
          keeping your own work intact.
        </p>

        <div class="callout">
          <strong>Coding agents can do this for you.</strong> If you're using Claude Code
          or Codex, ask your agent to <em>"review the feature/auth branch in a worktree"</em>
          &mdash; the skill file teaches it how.
        </div>
      </section>

      <!-- Custom Schemas -->
      <section id="guide-schemas">
        <h1>Create Custom Schemas</h1>
        <p class="lead">
          Schemas define your reviewer team. Start from a built-in and customize,
          or build one from scratch.
        </p>

        <div class="code-block">
          <pre><code><span class="c-dim"># Scaffold a new schema</span>
crev schema init my-schema

<span class="c-dim"># Validate it</span>
crev schema validate my-schema

<span class="c-dim"># See what it looks like</span>
crev schema show my-schema</code></pre>
        </div>

        <h2>Example: API-focused schema</h2>
        <div class="code-block">
          <div class="code-label">api-review.yaml</div>
          <pre><code><span class="y-key">description</span>: <span class="y-val">API endpoint review &mdash; security, validation, and contract</span>
<span class="y-key">reviewers</span>:
  - <span class="y-key">name</span>: <span class="y-val">Input Validation</span>
    <span class="y-key">runtime</span>: <span class="y-val">claude</span>
    <span class="y-key">model</span>: <span class="y-val">sonnet</span>
    <span class="y-key">prompt</span>: <span class="y-str">|
      Focus exclusively on input validation and sanitization.
      Flag any user input that reaches a database query,
      file system operation, or external API without validation.</span>

  - <span class="y-key">name</span>: <span class="y-val">API Contract</span>
    <span class="y-key">runtime</span>: <span class="y-val">gemini</span>
    <span class="y-key">model</span>: <span class="y-val">gemini-2.5-pro</span>
    <span class="y-key">scope</span>: <span class="y-val">codebase</span>
    <span class="y-key">prompt</span>: <span class="y-str">|
      Review for API contract consistency. Check that response
      shapes match documented types, error codes are consistent,
      and breaking changes are flagged.</span>
    <span class="y-key">context</span>:
      - <span class="y-str">"docs/api-spec.yaml"</span>

  - <span class="y-key">name</span>: <span class="y-val">Auth</span>
    <span class="y-key">runtime</span>: <span class="y-val">claude</span>
    <span class="y-key">model</span>: <span class="y-val">opus</span>
    <span class="y-key">agent</span>: <span class="y-val">auth-reviewer.md</span>

<span class="y-key">triage</span>:
  <span class="y-key">enabled</span>: <span class="y-bool">true</span>
  <span class="y-key">runtime</span>: <span class="y-val">claude</span>
  <span class="y-key">model</span>: <span class="y-val">opus</span>
  <span class="y-key">context</span>:
    - <span class="y-str">"ARCHITECTURE.md"</span></code></pre>
        </div>

        <p>
          Key design principle: <strong>treat schemas as portable</strong>. Avoid
          hardcoding file paths in prompts. Use <code>context</code> to provide
          project-specific files and keep prompts focused on <em>what</em> to look for,
          not <em>where</em>.
        </p>
      </section>

      <!-- Agent Definitions -->
      <section id="guide-agents">
        <h1>Agent Definitions</h1>
        <p class="lead">
          Agent files are reusable prompt documents that define a reviewer's
          persona, expertise, and review criteria. Use them to build a library
          of specialized reviewers.
        </p>

        <div class="code-block">
          <div class="code-label">.crev/agents/security.md</div>
          <pre><code>You are a senior application security engineer with
expertise in OWASP Top 10, CWE classifications, and
secure coding practices.

## Review Focus

- Authentication and authorization flaws
- Injection vulnerabilities (SQL, NoSQL, command, LDAP)
- Secrets and credentials in source code
- Cryptographic misuse (weak algorithms, hardcoded keys)
- Insecure deserialization
- SSRF and path traversal

## Severity Guidelines

- **critical**: Exploitable in production with no auth required
- **high**: Exploitable with authenticated access
- **medium**: Defense-in-depth issue or configuration weakness
- **low**: Best-practice deviation with low exploitation risk

## Output Rules

- Cite the exact line and file
- Include a concrete remediation suggestion
- Reference CWE IDs where applicable</code></pre>
        </div>

        <p>
          Reference the agent file in your schema with the <code>agent</code> field:
        </p>

        <div class="code-block">
          <pre><code><span class="y-key">reviewers</span>:
  - <span class="y-key">name</span>: <span class="y-val">Security</span>
    <span class="y-key">runtime</span>: <span class="y-val">claude</span>
    <span class="y-key">model</span>: <span class="y-val">opus</span>
    <span class="y-key">agent</span>: <span class="y-val">security.md</span>      <span class="c-dim"># Relative to .crev/agents/</span></code></pre>
        </div>

        <p>
          Agent files let you version-control your review expertise. When you find
          a reviewer producing too many false positives, tune the agent file and
          track the improvement with <code>crev stats --history</code>.
        </p>
      </section>

      <!-- Inline Prompts -->
      <section id="guide-inline">
        <h1>Inline Prompts</h1>
        <p class="lead">
          For quick, one-off reviewers that don't need a full agent file,
          use inline prompts directly in your schema.
        </p>

        <div class="code-block">
          <pre><code><span class="y-key">reviewers</span>:
  - <span class="y-key">name</span>: <span class="y-val">Bug Hunter</span>
    <span class="y-key">runtime</span>: <span class="y-val">claude</span>
    <span class="y-key">model</span>: <span class="y-val">sonnet</span>
    <span class="y-key">prompt</span>: <span class="y-str">"Find bugs. Ignore style. Only report issues that would cause incorrect behavior in production."</span>

  - <span class="y-key">name</span>: <span class="y-val">Perf</span>
    <span class="y-key">runtime</span>: <span class="y-val">codex</span>
    <span class="y-key">model</span>: <span class="y-val">gpt-5.4</span>
    <span class="y-key">prompt</span>: <span class="y-str">|
      Focus on performance issues:
      - N+1 queries
      - Unnecessary re-renders
      - Missing memoization
      - Unbounded list operations
      - Memory leaks</span></code></pre>
        </div>

        <p>
          Inline prompts are great for experimentation. Once you find a prompt
          that works well, consider promoting it to an agent file for reuse
          across schemas.
        </p>
      </section>

      <!-- Iterative Reviews -->
      <section id="guide-iterative">
        <h1>Iterative Reviews</h1>
        <p class="lead">
          Fix issues from a review, then re-run against the same file to
          track progress. User annotations (status, triage) are preserved.
        </p>

        <div class="code-block">
          <pre><code><span class="c-dim"># First run — generates the review file</span>
crev run --schema standard --base main

<span class="c-dim"># Fix some issues, then re-run merging into the same file</span>
crev run --schema standard --base main \
  --review-file .crev/reviews/2026-04-17-1523-main.json

<span class="c-dim"># Run only specific reviewers to re-check their findings</span>
crev run --schema standard --base main \
  --reviewers Security \
  --review-file .crev/reviews/2026-04-17-1523-main.json</code></pre>
        </div>

        <p>
          When using <code>--review-file</code>, crev merges new results with the
          existing review. Issues you've already marked as <code>fixed</code> or
          <code>wont-fix</code> keep their status. New issues from the re-run are
          added, and stale issues that no longer appear are preserved with their
          annotations.
        </p>
      </section>

      <!-- Stats & Tuning -->
      <section id="guide-stats">
        <h1>Stats &amp; Tuning</h1>
        <p class="lead">
          Use <code>crev stats</code> to evaluate how well your reviewers are
          performing and tune prompts for better signal-to-noise.
        </p>

        <div class="code-block">
          <pre><code><span class="c-dim"># Stats for the standard schema</span>
crev stats --schema standard

<span class="c-dim"># Track improvement across schema revisions</span>
crev stats --schema standard --history

<span class="c-dim"># Machine-readable output</span>
crev stats --schema standard --json</code></pre>
        </div>

        <div class="tui-block">
          <div class="tui-bar">crev stats --schema standard</div>
          <pre class="tui-body">Schema: standard  (12 runs, 2 revisions)

Reviewer         Runtime              Runs  Issues  Actioned   Dismissed  Avg Time  Cost/Act
─────────────────────────────────────────────────────────────────────────────────────────────
Engineer         claude/sonnet          12      66  19 (40%)   19 (40%)     42.1s     26.6s
Security         gemini/gemini-2.5-pro  12      31  22 (71%)    4 (13%)     38.7s     21.1s
Architect        claude/opus            12      18  14 (78%)    2 (11%)     51.3s     44.0s

Recurring dismissed patterns:
  • "Missing error handling for..."  (dismissed 8 times across 6 runs)
  • "Consider adding JSDoc for..."   (dismissed 5 times across 4 runs)</pre>
        </div>

        <h2>Reading the stats</h2>
        <div class="props-table compact">
          <div class="prop-row">
            <code class="prop-name">Cost/Act</code>
            <span class="prop-desc">Average time per actionable finding. Lower = better signal per dollar.</span>
          </div>
          <div class="prop-row">
            <code class="prop-name">Dismissed rate</code>
            <span class="prop-desc">High dismissed rate means the reviewer needs prompt tightening.</span>
          </div>
          <div class="prop-row">
            <code class="prop-name">Recurring patterns</code>
            <span class="prop-desc">Issues dismissed repeatedly = add explicit exclusions to the prompt.</span>
          </div>
        </div>

        <h2>The tuning loop</h2>
        <ol class="steps">
          <li>Run <code>crev stats --schema standard</code> to identify noisy reviewers</li>
          <li>Check recurring dismissed patterns &mdash; these are prompt gaps</li>
          <li>Update the reviewer's prompt or agent file to exclude those patterns</li>
          <li>Run a few more reviews and check <code>--history</code> for improvement</li>
          <li>Repeat until dismissed rate is below ~20%</li>
        </ol>
      </section>

      <!-- Viewing Reviews -->
      <section id="guide-show">
        <h1>Viewing Reviews</h1>
        <p class="lead">
          Use <code>crev show</code> to pretty-print review results in the terminal.
        </p>

        <div class="code-block">
          <pre><code><span class="c-dim"># Show the most recent review</span>
crev show

<span class="c-dim"># Show a specific review file</span>
crev show .crev/reviews/2026-04-17-1523-main.json

<span class="c-dim"># Output as raw JSON (pipe to jq)</span>
crev show --json | jq '.reviews[].issues[] | select(.severity == "high")'</code></pre>
        </div>

        <p>
          The <code>crev show</code> output groups issues by reviewer, shows severity
          with color coding, and includes triage verdicts when available. Use
          <code>--json</code> for programmatic filtering.
        </p>
      </section>

      <!-- Defaults & Tips -->
      <section id="guide-defaults">
        <h1>Defaults &amp; Tips</h1>
        <p class="lead">
          What happens when you run crev with minimal flags, and tips
          for getting the most out of it.
        </p>

        <h2>Default behaviors</h2>
        <div class="props-table compact">
          <div class="prop-row">
            <code class="prop-name">crev run</code>
            <span class="prop-desc">Uses schema from <code>defaults.schema</code> in config (default: <code>quick</code>). Diffs staged + unstaged changes against <code>defaults.base</code> (default: <code>main</code>).</span>
          </div>
          <div class="prop-row">
            <code class="prop-name">--type all</code>
            <span class="prop-desc">Default diff type. Includes both staged and unstaged changes.</span>
          </div>
          <div class="prop-row">
            <code class="prop-name">--base main</code>
            <span class="prop-desc">Default base branch. Change in <code>config.yaml</code> if your default branch is different.</span>
          </div>
          <div class="prop-row">
            <code class="prop-name">Output location</code>
            <span class="prop-desc"><code>.crev/reviews/</code> by default. Timestamped JSON files, one per run.</span>
          </div>
        </div>

        <h2>Power tips</h2>
        <ul class="tips-list">
          <li>
            <strong>Preview before reviewing.</strong> Use <code>crev diff --base main</code>
            to see exactly what will be reviewed before spending time on a full run.
          </li>
          <li>
            <strong>Health check first.</strong> Run <code>crev doctor</code> after setup to
            verify all runtimes are installed and authenticated.
          </li>
          <li>
            <strong>Start with <code>quick</code>.</strong> The single-reviewer schema gives
            fast feedback. Graduate to <code>standard</code> or <code>thorough</code> for PRs.
          </li>
          <li>
            <strong>Use <code>--prompt-only</code> to debug schemas.</strong> Outputs the full
            prompt that would be sent to each reviewer without executing anything.
          </li>
          <li>
            <strong>Exclude noisy files.</strong> Add lock files, snapshots, and generated
            code to <code>diff.exclude</code> in your config to keep reviews focused.
          </li>
          <li>
            <strong>Let your agent drive.</strong> After <code>crev init</code>, your coding
            agent knows every command on this page. Just describe what you want in
            natural language.
          </li>
        </ul>
      </section>

      <!-- Configuration -->
      <section id="configuration">
        <h1>Configuration</h1>
        <p class="lead">
          Global settings live in <code>.crev/config.yaml</code>. This file controls
          defaults, runtime overrides, model aliases, and output preferences.
        </p>

        <div class="code-block">
          <div class="code-label">config.yaml</div>
          <pre><code><span class="y-key">defaults</span>:
  <span class="y-key">schema</span>: <span class="y-val">quick</span>          <span class="c-dim"># Default schema to run</span>
  <span class="y-key">type</span>: <span class="y-val">all</span>              <span class="c-dim"># Diff type: all | committed | uncommitted</span>
  <span class="y-key">base</span>: <span class="y-val">main</span>             <span class="c-dim"># Default base branch</span>

<span class="y-key">aliases</span>:
  <span class="y-key">opus</span>: <span class="y-val">claude-opus-4-6</span>
  <span class="y-key">sonnet</span>: <span class="y-val">claude-sonnet-4-6</span>
  <span class="y-key">haiku</span>: <span class="y-val">claude-haiku-4-5-20251001</span>

<span class="y-key">diff</span>:
  <span class="y-key">exclude</span>:              <span class="c-dim"># Globs to exclude from diffs</span>
    - <span class="y-str">"pnpm-lock.yaml"</span>
    - <span class="y-str">"package-lock.json"</span>
    - <span class="y-str">"*.snap"</span>

<span class="y-key">output</span>:
  <span class="y-key">dir</span>: <span class="y-val">.crev/reviews</span>     <span class="c-dim"># Output directory</span>
  <span class="y-key">format</span>: <span class="y-val">json</span>           <span class="c-dim"># json | markdown | both</span>

<span class="y-key">normalizer</span>:
  <span class="y-key">enabled</span>: <span class="y-bool">true</span>
  <span class="y-key">runtime</span>: <span class="y-val">claude</span>
  <span class="y-key">model</span>: <span class="y-val">haiku</span>            <span class="c-dim"># Fast/cheap model for normalization</span>

<span class="y-key">triage</span>:
  <span class="y-key">enabled</span>: <span class="y-bool">false</span>
  <span class="y-key">runtime</span>: <span class="y-val">claude</span>
  <span class="y-key">model</span>: <span class="y-val">opus</span></code></pre>
        </div>

        <h2>Diff exclusions</h2>
        <p>
          Use <code>diff.exclude</code> to skip lock files, snapshots, or generated code
          from reviews. Patterns follow standard glob syntax.
        </p>

        <h2>Output</h2>
        <p>
          Reviews are written to <code>output.dir</code> (default <code>.crev/reviews/</code>).
          Set <code>format</code> to <code>json</code>, <code>markdown</code>, or
          <code>both</code>.
        </p>
      </section>

      <!-- Schemas -->
      <section id="schemas">
        <h1>Schemas</h1>
        <p class="lead">
          A schema defines your reviewer team. Each schema is a YAML file in
          <code>.crev/schemas/</code> that specifies which reviewers to run,
          what runtime and model each uses, and optional prompts or agents.
        </p>

        <h2>Reviewer fields</h2>
        <div class="props-table">
          <div class="prop-row">
            <code class="prop-name">name</code>
            <span class="prop-type">string</span>
            <span class="prop-req">required</span>
            <span class="prop-desc">Unique display name for the reviewer</span>
          </div>
          <div class="prop-row">
            <code class="prop-name">runtime</code>
            <span class="prop-type">string</span>
            <span class="prop-req">required</span>
            <span class="prop-desc">Runtime to use (claude, gemini, codex, etc.)</span>
          </div>
          <div class="prop-row">
            <code class="prop-name">model</code>
            <span class="prop-type">string</span>
            <span class="prop-req">required</span>
            <span class="prop-desc">Model identifier or alias</span>
          </div>
          <div class="prop-row">
            <code class="prop-name">prompt</code>
            <span class="prop-type">string</span>
            <span class="prop-req">optional</span>
            <span class="prop-desc">Inline review instructions (mutually exclusive with <code>agent</code>)</span>
          </div>
          <div class="prop-row">
            <code class="prop-name">agent</code>
            <span class="prop-type">string</span>
            <span class="prop-req">optional</span>
            <span class="prop-desc">Path to an external agent/prompt file</span>
          </div>
          <div class="prop-row">
            <code class="prop-name">scope</code>
            <span class="prop-type">"diff" | "codebase"</span>
            <span class="prop-req">optional</span>
            <span class="prop-desc">Review scope. <code>codebase</code> includes full source files of changed files</span>
          </div>
          <div class="prop-row">
            <code class="prop-name">context</code>
            <span class="prop-type">string[]</span>
            <span class="prop-req">optional</span>
            <span class="prop-desc">Additional context file globs to include in the prompt</span>
          </div>
        </div>

        <h2>Example schema</h2>
        <div class="code-block">
          <div class="code-label">standard.yaml</div>
          <pre><code><span class="y-key">reviewers</span>:
  - <span class="y-key">name</span>: <span class="y-val">Engineer</span>
    <span class="y-key">runtime</span>: <span class="y-val">claude</span>
    <span class="y-key">model</span>: <span class="y-val">sonnet</span>
    <span class="y-key">prompt</span>: <span class="y-str">|
      You are a senior software engineer. Focus on
      correctness, error handling, and edge cases.</span>

  - <span class="y-key">name</span>: <span class="y-val">Security</span>
    <span class="y-key">runtime</span>: <span class="y-val">gemini</span>
    <span class="y-key">model</span>: <span class="y-val">gemini-2.5-pro</span>
    <span class="y-key">agent</span>: <span class="y-val">security.md</span>

  - <span class="y-key">name</span>: <span class="y-val">Architect</span>
    <span class="y-key">runtime</span>: <span class="y-val">claude</span>
    <span class="y-key">model</span>: <span class="y-val">opus</span>
    <span class="y-key">scope</span>: <span class="y-val">codebase</span>

<span class="y-key">triage</span>:
  <span class="y-key">enabled</span>: <span class="y-bool">true</span>
  <span class="y-key">runtime</span>: <span class="y-val">claude</span>
  <span class="y-key">model</span>: <span class="y-val">opus</span></code></pre>
        </div>

        <h2>Built-in schemas</h2>
        <div class="props-table">
          <div class="prop-row">
            <code class="prop-name">quick</code>
            <span class="prop-desc">Single reviewer (Engineer/Sonnet). Fast feedback loop.</span>
          </div>
          <div class="prop-row">
            <code class="prop-name">standard</code>
            <span class="prop-desc">Three reviewers (Engineer, Security, Architect) with triage enabled.</span>
          </div>
          <div class="prop-row">
            <code class="prop-name">thorough</code>
            <span class="prop-desc">Six reviewers covering engineering, security, architecture, performance, testing, and docs.</span>
          </div>
        </div>
      </section>

      <!-- Runtimes -->
      <section id="runtimes">
        <h1>Runtimes</h1>
        <p class="lead">
          A runtime is an AI CLI tool that executes review prompts. crev runs
          each reviewer headless through the CLI you already have installed &mdash;
          Claude Code, Gemini CLI, Codex CLI, etc. No API keys or separate
          billing: it uses your existing subscriptions.
        </p>

        <h2>Supported runtimes</h2>
        <div class="props-table">
          <div class="prop-row">
            <code class="prop-name">claude</code>
            <span class="prop-desc">Anthropic Claude models (Opus, Sonnet, Haiku)</span>
          </div>
          <div class="prop-row">
            <code class="prop-name">gemini</code>
            <span class="prop-desc">Google Gemini models (2.5 Pro, 2.5 Flash, 3.0 series)</span>
          </div>
          <div class="prop-row">
            <code class="prop-name">codex</code>
            <span class="prop-desc">OpenAI CodeX / GPT-5.x models</span>
          </div>
          <div class="prop-row">
            <code class="prop-name">coderabbit</code>
            <span class="prop-desc">CodeRabbit's built-in review engine (no custom prompt/agent)</span>
          </div>
          <div class="prop-row">
            <code class="prop-name">opencode</code>
            <span class="prop-desc">OpenCode / GLM models</span>
          </div>
          <div class="prop-row">
            <code class="prop-name">kimi</code>
            <span class="prop-desc">Moonshot Kimi models</span>
          </div>
        </div>

        <h2>Runtime overrides</h2>
        <p>
          You can customize runtime behavior in <code>config.yaml</code> with
          custom commands, environment variables, or extra CLI arguments:
        </p>
        <div class="code-block">
          <pre><code><span class="y-key">runtimes</span>:
  <span class="y-key">claude</span>:
    <span class="y-key">command</span>: <span class="y-val">/usr/local/bin/claude</span>   <span class="c-dim"># Custom binary path</span>
    <span class="y-key">env</span>:
      <span class="y-key">ANTHROPIC_API_KEY</span>: <span class="y-str">"sk-..."</span>
    <span class="y-key">args</span>:
      - <span class="y-str">"--max-tokens"</span>
      - <span class="y-str">"8192"</span></code></pre>
        </div>

        <h2>Checking runtime health</h2>
        <div class="code-block">
          <pre><code><span class="c-dim"># Check which runtimes are available</span>
crev doctor

<span class="c-dim"># List all detected runtimes</span>
crev list --runtimes</code></pre>
        </div>
      </section>

      <!-- Models -->
      <section id="models">
        <h1>Models</h1>
        <p class="lead">
          Each runtime exposes different models. You can use the full model ID
          or define short aliases in your config.
        </p>

        <h2>Model aliases</h2>
        <p>
          Define aliases in <code>config.yaml</code> to use short names in your schemas:
        </p>
        <div class="code-block">
          <pre><code><span class="y-key">aliases</span>:
  <span class="y-key">opus</span>: <span class="y-val">claude-opus-4-6</span>
  <span class="y-key">sonnet</span>: <span class="y-val">claude-sonnet-4-6</span>
  <span class="y-key">haiku</span>: <span class="y-val">claude-haiku-4-5-20251001</span></code></pre>
        </div>
        <p>
          Then in your schema, just write <code>model: opus</code> instead of the
          full identifier.
        </p>

        <h2>Available models</h2>

        <h3>Claude</h3>
        <div class="props-table compact">
          <div class="prop-row">
            <code class="prop-name">claude-opus-4-6</code>
            <span class="prop-desc">Most capable. Best for architecture reviews and triage.</span>
          </div>
          <div class="prop-row">
            <code class="prop-name">claude-sonnet-4-6</code>
            <span class="prop-desc">Balanced speed/quality. Good default for code review.</span>
          </div>
          <div class="prop-row">
            <code class="prop-name">claude-haiku-4-5-20251001</code>
            <span class="prop-desc">Fast and cheap. Used by the normalizer by default.</span>
          </div>
        </div>

        <h3>Gemini</h3>
        <div class="props-table compact">
          <div class="prop-row">
            <code class="prop-name">gemini-2.5-pro</code>
            <span class="prop-desc">Strong reasoning. Good for security and architecture.</span>
          </div>
          <div class="prop-row">
            <code class="prop-name">gemini-2.5-flash</code>
            <span class="prop-desc">Fast variant. Good for quick passes.</span>
          </div>
        </div>

        <h3>CodeX</h3>
        <div class="props-table compact">
          <div class="prop-row">
            <code class="prop-name">gpt-5.4</code>
            <span class="prop-desc">Latest flagship model.</span>
          </div>
          <div class="prop-row">
            <code class="prop-name">gpt-5.4-mini</code>
            <span class="prop-desc">Smaller, faster variant.</span>
          </div>
        </div>
      </section>

      <!-- Triage -->
      <section id="triage">
        <h1>Triage</h1>
        <p class="lead">
          Triage is an optional second pass that challenges every finding with a
          devil's-advocate AI. Only genuinely actionable issues survive.
        </p>

        <h2>How it works</h2>
        <ol class="steps">
          <li>All issues from all reviewers are collected</li>
          <li>Context files are loaded (if configured)</li>
          <li>A triage agent reviews each issue against the diff and context</li>
          <li>Each issue receives a verdict:
            <strong class="verdict-actionable">actionable</strong>,
            <strong class="verdict-deferred">deferred</strong>, or
            <strong class="verdict-dismissed">dismissed</strong>
          </li>
        </ol>

        <h2>Configuration</h2>
        <p>
          Triage can be configured globally in <code>config.yaml</code> or
          per-schema. Schema-level settings override global ones.
        </p>
        <div class="code-block">
          <div class="code-label">In a schema file</div>
          <pre><code><span class="y-key">triage</span>:
  <span class="y-key">enabled</span>: <span class="y-bool">true</span>
  <span class="y-key">runtime</span>: <span class="y-val">claude</span>
  <span class="y-key">model</span>: <span class="y-val">opus</span>             <span class="c-dim"># Use a strong model for triage</span>
  <span class="y-key">context</span>:                  <span class="c-dim"># Additional files for context</span>
    - <span class="y-str">"ARCHITECTURE.md"</span>
    - <span class="y-str">"docs/conventions.md"</span>
  <span class="y-key">prompt</span>: <span class="y-str">|
    Focus on production impact. Dismiss style
    nits unless they affect readability.</span></code></pre>
        </div>

        <h2>Verdicts</h2>
        <div class="props-table">
          <div class="prop-row">
            <code class="prop-name verdict-actionable">actionable</code>
            <span class="prop-desc">Genuine problem that should be fixed.</span>
          </div>
          <div class="prop-row">
            <code class="prop-name verdict-deferred">deferred</code>
            <span class="prop-desc">Valid concern but out of scope or low priority for this PR.</span>
          </div>
          <div class="prop-row">
            <code class="prop-name verdict-dismissed">dismissed</code>
            <span class="prop-desc">Not a real issue. False positive or acceptable trade-off.</span>
          </div>
        </div>
      </section>

      <!-- CLI Reference -->
      <section id="cli">
        <h1>CLI Reference</h1>
        <p class="lead">
          All available commands and their flags.
        </p>

        <h2>crev run</h2>
        <p>Execute a review.</p>
        <div class="props-table compact">
          <div class="prop-row">
            <code class="prop-name">--schema &lt;name&gt;</code>
            <span class="prop-desc">Schema to use (default: from config)</span>
          </div>
          <div class="prop-row">
            <code class="prop-name">--base &lt;branch&gt;</code>
            <span class="prop-desc">Diff against this branch</span>
          </div>
          <div class="prop-row">
            <code class="prop-name">--base-commit &lt;sha&gt;</code>
            <span class="prop-desc">Diff against a specific commit</span>
          </div>
          <div class="prop-row">
            <code class="prop-name">--pr &lt;number&gt;</code>
            <span class="prop-desc">Review a GitHub pull request</span>
          </div>
          <div class="prop-row">
            <code class="prop-name">--type &lt;type&gt;</code>
            <span class="prop-desc">Diff type: all | committed | uncommitted</span>
          </div>
          <div class="prop-row">
            <code class="prop-name">--reviewers &lt;names&gt;</code>
            <span class="prop-desc">Run only specific reviewers from the schema</span>
          </div>
          <div class="prop-row">
            <code class="prop-name">--json</code>
            <span class="prop-desc">Machine-readable JSON output</span>
          </div>
          <div class="prop-row">
            <code class="prop-name">--plain</code>
            <span class="prop-desc">Plain text output (CI-friendly)</span>
          </div>
          <div class="prop-row">
            <code class="prop-name">--prompt-only</code>
            <span class="prop-desc">Output prompts without executing</span>
          </div>
        </div>

        <h2>Other commands</h2>
        <div class="props-table compact">
          <div class="prop-row">
            <code class="prop-name">crev init</code>
            <span class="prop-desc">Interactive setup wizard. Creates <code>.crev/</code> directory.</span>
          </div>
          <div class="prop-row">
            <code class="prop-name">crev show [file]</code>
            <span class="prop-desc">Pretty-print a review artifact.</span>
          </div>
          <div class="prop-row">
            <code class="prop-name">crev diff</code>
            <span class="prop-desc">Preview the diff that would be reviewed (dry run).</span>
          </div>
          <div class="prop-row">
            <code class="prop-name">crev doctor</code>
            <span class="prop-desc">Health check all runtimes and schemas.</span>
          </div>
          <div class="prop-row">
            <code class="prop-name">crev list</code>
            <span class="prop-desc">List available schemas (<code>--schemas</code>) or runtimes (<code>--runtimes</code>).</span>
          </div>
          <div class="prop-row">
            <code class="prop-name">crev stats</code>
            <span class="prop-desc">Aggregate review statistics across runs.</span>
          </div>
          <div class="prop-row">
            <code class="prop-name">crev schema init &lt;name&gt;</code>
            <span class="prop-desc">Create a new schema file.</span>
          </div>
          <div class="prop-row">
            <code class="prop-name">crev schema validate</code>
            <span class="prop-desc">Validate schema files.</span>
          </div>
        </div>
      </section>

      <!-- CI/CD -->
      <section id="ci-cd">
        <h1>CI/CD</h1>
        <p class="lead">
          crev works in headless CI environments with the <code>--plain</code>
          and <code>--json</code> flags. Run reviews automatically on every PR.
        </p>

        <h2>GitHub Actions</h2>
        <div class="code-block">
          <div class="code-label">.github/workflows/crev.yml</div>
          <pre v-pre><code>name: Code Review
on: [pull_request]

jobs:
  review:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0

      - uses: actions/setup-node@v4
        with:
          node-version: 20

      - run: npm install -g @caiokf/crev

      - run: crev run --schema quick --plain --json
        env:
          ANTHROPIC_API_KEY: ${{ secrets.ANTHROPIC_API_KEY }}</code></pre>
        </div>

        <h2>Key flags</h2>
        <div class="props-table compact">
          <div class="prop-row">
            <code class="prop-name">--plain</code>
            <span class="prop-desc">Disables the TUI. Plain text output suitable for CI logs.</span>
          </div>
          <div class="prop-row">
            <code class="prop-name">--json</code>
            <span class="prop-desc">Machine-readable JSON output. Pipe to <code>jq</code> or post to PR comments.</span>
          </div>
          <div class="prop-row">
            <code class="prop-name">--base &lt;branch&gt;</code>
            <span class="prop-desc">Diff against the target branch. In PRs, use the base branch.</span>
          </div>
        </div>

        <div class="callout">
          <strong>API keys in CI.</strong> In headless CI environments where CLI
          tools aren't logged in interactively, you'll need API keys set as
          environment variables (e.g. <code>ANTHROPIC_API_KEY</code>,
          <code>GEMINI_API_KEY</code>). Locally, crev uses your existing CLI
          subscriptions with no keys needed.
        </div>
      </section>

      <!-- Output Format -->
      <section id="output">
        <h1>Output Format</h1>
        <p class="lead">
          Reviews produce structured JSON with metadata, per-reviewer issues,
          and an aggregate summary.
        </p>

        <h2>Issue structure</h2>
        <div class="code-block">
          <pre><code>{
  <span class="y-key">"id"</span>: <span class="y-str">"engineer--1"</span>,
  <span class="y-key">"reviewer"</span>: <span class="y-str">"Engineer"</span>,
  <span class="y-key">"runtime"</span>: <span class="y-str">"claude"</span>,
  <span class="y-key">"model"</span>: <span class="y-str">"claude-sonnet-4-6"</span>,
  <span class="y-key">"file"</span>: <span class="y-str">"src/core/auth.ts"</span>,
  <span class="y-key">"line"</span>: <span class="y-val">42</span>,
  <span class="y-key">"severity"</span>: <span class="y-str">"high"</span>,
  <span class="y-key">"category"</span>: <span class="y-str">"security"</span>,
  <span class="y-key">"title"</span>: <span class="y-str">"Missing input validation"</span>,
  <span class="y-key">"description"</span>: <span class="y-str">"User input is passed directly..."</span>,
  <span class="y-key">"triage"</span>: {
    <span class="y-key">"verdict"</span>: <span class="y-str">"actionable"</span>,
    <span class="y-key">"reasoning"</span>: <span class="y-str">"Direct SQL injection risk..."</span>
  }
}</code></pre>
        </div>

        <h2>Severity levels</h2>
        <div class="props-table compact">
          <div class="prop-row">
            <code class="prop-name sev-critical">critical</code>
            <span class="prop-desc">Security vulnerability, data loss, or crash in production path.</span>
          </div>
          <div class="prop-row">
            <code class="prop-name sev-high">high</code>
            <span class="prop-desc">Bug or significant logic error that will cause incorrect behavior.</span>
          </div>
          <div class="prop-row">
            <code class="prop-name sev-medium">medium</code>
            <span class="prop-desc">Code quality issue, missing edge case, or performance concern.</span>
          </div>
          <div class="prop-row">
            <code class="prop-name sev-low">low</code>
            <span class="prop-desc">Style nit, minor readability improvement, or documentation gap.</span>
          </div>
        </div>

        <h2>Categories</h2>
        <p>
          Each issue is classified into one of:
          <code>bug</code>, <code>security</code>, <code>performance</code>,
          <code>style</code>, <code>compliance</code>, or <code>architecture</code>.
        </p>

        <h2>Summary</h2>
        <p>
          Every review includes a <code>summary</code> object with totals broken
          down by severity, category, and reviewer &mdash; plus triage counts
          when triage is enabled.
        </p>
      </section>

      <!-- SKILL.md -->
      <section id="skill">
        <h1>SKILL.md</h1>
        <p class="lead">
          Running <code>crev init</code> generates a <code>SKILL.md</code> file
          for each coding agent you have installed (Claude Code, Codex CLI, etc.).
          The agent reads this file automatically and knows how to run reviews,
          create schemas, show stats &mdash; no manual configuration needed.
        </p>

        <div class="callout">
          <strong>Just ask your agent.</strong> Once <code>crev init</code> has
          run, your coding agent understands the full crev workflow. Ask it to
          review a PR, fix findings, or tune a schema &mdash; it reads the skill
          file and handles the rest.
        </div>

        <h2>Generated template</h2>
        <div class="code-block">
          <div class="code-label">SKILL.md</div>
          <pre class="skill-pre"><code>---
name: crev
description: Use when running AI code reviews, reviewing PRs,
  validating schemas, or setting up crev in a project -
  orchestrates multi-AI reviewer code reviews via the crev CLI
  with parallel execution, triage, and structured JSON output.
---

# crev

Multi-AI code review CLI. Runs multiple AI reviewers in parallel
against a diff, normalizes findings, and optionally triages them.

## Quick Reference

| Task                        | Command                                           |
|-----------------------------|-------------------------------------------------  |
| Run a review                | `crev run --schema &lt;name&gt; --base main`            |
| Review a PR                 | `crev run --schema &lt;name&gt; --pr 42`                |
| Review uncommitted changes  | `crev run --schema &lt;name&gt; --type uncommitted`     |
| Review entire codebase      | `crev run --schema &lt;name&gt; --type current-state`   |
| CI mode (no TUI)            | `crev run --schema &lt;name&gt; --plain --json`         |
| Subset of reviewers         | `crev run --schema &lt;name&gt; --reviewers "Sec,Arch"` |
| Preview prompts only        | `crev run --schema &lt;name&gt; --prompt-only`          |
| List schemas/runtimes       | `crev list --schemas` / `crev list --runtimes`    |
| Validate all schemas        | `crev schema validate --all`                      |
| Preview diff                | `crev diff --base main`                           |
| Health check                | `crev doctor`                                     |
| Scaffold new schema         | `crev schema init &lt;name&gt;`                         |
| Full setup                  | `crev init`                                       |
| Review stats                | `crev stats --schema &lt;name&gt;`                      |
| Stats across versions       | `crev stats --schema &lt;name&gt; --history`            |

## Workflow

### Running a Review

1. Pick a schema: `crev list --schemas`
2. Run: `crev run --schema &lt;name&gt; --base main`
3. Read output from `.crev/reviews/&lt;slug&gt;.json`
4. For each open issue: fix or mark as `wont-fix`
5. Re-run to merge: `crev run --schema &lt;name&gt; --review-file ...`

### Reading Results

Output JSON structure:
- `metadata` — slug, timestamp, schema used, diff info
- `reviews[]` — per-reviewer: name, runtime, model, duration, issues
- `summary` — totals by severity, category, status, reviewer, triage

Each issue has:
- `severity`: critical | high | medium | low
- `category`: bug | security | performance | style | compliance | architecture
- `status`: open | fixed | wont-fix
- `triage.verdict`: actionable | deferred | dismissed
- `file`, `line`, `title`, `description`

### Creating a Schema

Schemas live in `.crev/schemas/&lt;name&gt;.yaml`:

```yaml
description: What this schema reviews for
reviewers:
  - name: Security
    runtime: claude
    model: opus
    agent: security.md
  - name: Quick Check
    runtime: gemini
    model: gemini-2.5-flash
    prompt: "Focus on bugs and logic errors only."
  - name: Architecture
    runtime: claude
    model: opus
    scope: codebase
    context:
      - packages/cli/src/bin.ts
      - packages/cli/src/commands/*.ts
triage:
  enabled: true
  runtime: claude
  model: opus
```

### Schema Authoring: Black-Box Approach

Treat the target codebase as a black box. Schemas should
be portable and resilient to internal refactors.

Avoid in prompts:
- Specific file paths
- Internal directory structures
- References to specific function/class/variable names

Encouraged in prompts:
- Coding patterns and conventions
- Code examples showing desired style
- Conceptual guidance
- Category-level references ("test files", "config files")
- Architectural principles

### Reviewing Effectiveness

Use `crev stats` to evaluate reviewer signal-to-noise:

1. `crev stats --schema &lt;name&gt;` — per-reviewer rates
2. `--history` to compare across schema revisions
3. High dismissed rate = needs prompt tuning
4. `--json` for machine-readable output</code></pre>
        </div>
      </section>
    </main>
  </div>
</template>

<style scoped>
.docs {
  display: flex;
  min-height: 100vh;
  padding-top: 56px;
  background: var(--bg);
}

/* ── Sidebar ── */
.sidebar {
  position: fixed;
  top: 56px;
  left: 0;
  bottom: 0;
  width: 240px;
  border-right: 1px solid var(--border);
  background: var(--surface);
  overflow-y: auto;
  z-index: 10;
}

.sidebar-inner {
  padding: 32px 20px;
}

.sidebar-title {
  font-family: var(--font-mono);
  font-size: 13px;
  font-weight: 500;
  color: var(--text-3);
  text-transform: uppercase;
  letter-spacing: 0.5px;
  margin-bottom: 20px;
}

.sidebar-nav {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.sidebar-group {
  display: block;
  font-family: var(--font-mono);
  font-size: 11px;
  font-weight: 500;
  color: var(--text-3);
  text-transform: uppercase;
  letter-spacing: 0.5px;
  margin-top: 20px;
  margin-bottom: 4px;
  padding: 0 12px;
}

.sidebar-nav a {
  display: block;
  padding: 8px 12px;
  font-size: 14px;
  color: var(--text-2);
  border-radius: 6px;
  transition: color 0.15s, background 0.15s;
}

.sidebar-nav a.sidebar-sub {
  padding-left: 20px;
  font-size: 13px;
  color: var(--text-3);
}

.sidebar-nav a:hover {
  color: var(--text);
  background: var(--surface-2);
}

.sidebar-nav a.active {
  color: var(--accent);
  background: rgba(255, 157, 0, 0.08);
}

/* ── Content ── */
.content {
  flex: 1;
  margin-left: 240px;
  padding: 48px 64px 120px;
  max-width: 840px;
}

.content section {
  padding-top: 24px;
  padding-bottom: 48px;
  border-bottom: 1px solid var(--border);
}

.content section:last-child {
  border-bottom: none;
}

.content h1 {
  font-family: var(--font-display);
  font-size: 2rem;
  font-weight: 400;
  letter-spacing: -0.5px;
  margin-bottom: 12px;
  color: var(--text);
}

.content h2 {
  font-family: var(--font-body);
  font-size: 1.15rem;
  font-weight: 600;
  margin-top: 36px;
  margin-bottom: 12px;
  color: var(--text);
}

.content h3 {
  font-family: var(--font-body);
  font-size: 0.95rem;
  font-weight: 600;
  margin-top: 24px;
  margin-bottom: 8px;
  color: var(--text-2);
}

.lead {
  font-size: 16px;
  color: var(--text-2);
  line-height: 1.7;
  font-weight: 300;
  margin-bottom: 24px;
}

.content p {
  font-size: 15px;
  color: var(--text-2);
  line-height: 1.7;
  margin-bottom: 16px;
}

.content p code,
.content li code {
  font-family: var(--font-mono);
  font-size: 13px;
  color: var(--text);
  background: var(--surface-2);
  padding: 2px 6px;
  border-radius: 4px;
}

/* ── Code blocks ── */
.code-block {
  background: #0a0a10;
  border: 1px solid var(--border);
  border-radius: 10px;
  overflow-x: auto;
  margin-bottom: 20px;
}

.code-label {
  padding: 10px 20px;
  font-family: var(--font-mono);
  font-size: 12px;
  color: var(--text-3);
  border-bottom: 1px solid var(--border);
}

.code-block pre {
  padding: 20px;
  font-family: var(--font-mono);
  font-size: 13px;
  line-height: 1.7;
  color: var(--text-2);
}

.skill-pre {
  white-space: pre-wrap;
  word-wrap: break-word;
}

.y-key { color: #7dd3fc; }
.y-val { color: var(--text); }
.y-str { color: var(--accent); }
.y-bool { color: #fbbf24; }
.c-dim { color: var(--text-3); }

/* ── Props table ── */
.props-table {
  display: flex;
  flex-direction: column;
  gap: 1px;
  background: var(--border);
  border: 1px solid var(--border);
  border-radius: 10px;
  overflow: hidden;
  margin-bottom: 20px;
}

.prop-row {
  display: grid;
  grid-template-columns: 160px 140px 80px 1fr;
  gap: 12px;
  padding: 12px 16px;
  background: var(--surface);
  align-items: baseline;
  font-size: 14px;
}

.props-table.compact .prop-row {
  grid-template-columns: 220px 1fr;
}

.prop-name {
  font-family: var(--font-mono);
  font-size: 13px;
  color: var(--accent);
}

.prop-type {
  font-family: var(--font-mono);
  font-size: 12px;
  color: var(--text-3);
}

.prop-req {
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  color: var(--text-3);
}

.prop-desc {
  color: var(--text-2);
  line-height: 1.5;
}

.prop-desc code {
  font-family: var(--font-mono);
  font-size: 12px;
  color: var(--text);
  background: var(--surface-2);
  padding: 1px 5px;
  border-radius: 3px;
}

/* ── Callout ── */
.callout {
  padding: 16px 20px;
  background: rgba(255, 157, 0, 0.06);
  border: 1px solid rgba(255, 157, 0, 0.15);
  border-radius: 8px;
  font-size: 14px;
  color: var(--text-2);
  line-height: 1.7;
  margin-bottom: 24px;
}

.callout strong {
  color: var(--accent);
  font-weight: 600;
}

.callout code {
  font-family: var(--font-mono);
  font-size: 13px;
  color: var(--text);
  background: var(--surface-2);
  padding: 2px 6px;
  border-radius: 4px;
}

.callout-list {
  margin: 10px 0 0;
  padding-left: 20px;
  list-style: none;
}

.callout-list li {
  position: relative;
  padding-left: 4px;
  margin-bottom: 4px;
  color: var(--text-2);
}

.callout-list li::before {
  content: "–";
  position: absolute;
  left: -16px;
  color: var(--accent-dim);
}

/* ── TUI output blocks ── */
.tui-block {
  background: rgba(10, 10, 16, 0.8);
  border: 1px solid var(--border);
  border-radius: 10px;
  overflow: hidden;
  margin-bottom: 20px;
}

.tui-bar {
  padding: 8px 16px;
  font-family: var(--font-mono);
  font-size: 11px;
  color: var(--text-3);
  text-transform: uppercase;
  letter-spacing: 0.5px;
  border-bottom: 1px solid var(--border);
  background: rgba(17, 17, 24, 0.5);
}

.tui-body {
  padding: 16px 20px;
  font-family: var(--font-mono);
  font-size: 13px;
  line-height: 1.7;
  color: var(--text-2);
  white-space: pre;
  overflow-x: auto;
}

.tui-green { color: #4ade80; }
.tui-yellow { color: #fbbf24; }
.tui-red { color: #f87171; }
.tui-dim { color: var(--text-3); }
.tui-accent { color: var(--accent); }

/* ── Link ── */
.link {
  color: var(--accent);
  text-decoration: underline;
  text-underline-offset: 2px;
}

.link:hover {
  opacity: 0.8;
}

/* ── Tips list ── */
.tips-list {
  list-style: none;
  padding: 0;
  margin-bottom: 20px;
}

.tips-list li {
  position: relative;
  padding: 12px 16px 12px 28px;
  font-size: 14px;
  color: var(--text-2);
  line-height: 1.7;
  border-left: 2px solid var(--border);
  margin-bottom: 2px;
}

.tips-list li::before {
  content: "→";
  position: absolute;
  left: 8px;
  color: var(--accent-dim);
}

.tips-list li strong {
  color: var(--text);
}

.tips-list li code {
  font-family: var(--font-mono);
  font-size: 13px;
  color: var(--text);
  background: var(--surface-2);
  padding: 2px 6px;
  border-radius: 4px;
}

/* ── Misc ── */
.steps {
  padding-left: 24px;
  margin-bottom: 20px;
}

.steps li {
  font-size: 15px;
  color: var(--text-2);
  line-height: 1.7;
  margin-bottom: 8px;
}

.verdict-actionable { color: #4ade80; }
.verdict-deferred { color: #fbbf24; }
.verdict-dismissed { color: var(--text-3); }

.sev-critical { color: #ef4444; }
.sev-high { color: #f87171; }
.sev-medium { color: #fbbf24; }
.sev-low { color: #60a5fa; }

/* ── Responsive ── */
@media (max-width: 900px) {
  .sidebar {
    display: none;
  }

  .content {
    margin-left: 0;
    padding: 32px 20px 80px;
  }

  .prop-row {
    grid-template-columns: 1fr;
    gap: 4px;
  }

  .props-table.compact .prop-row {
    grid-template-columns: 1fr;
  }
}
</style>
