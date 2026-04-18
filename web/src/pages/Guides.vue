<script setup lang="ts">
import { ref, onMounted, watch } from "vue"
import { RouterLink, useRoute } from "vue-router"

const route = useRoute()
const activeSection = ref("guide-pr")
const docsExpanded = ref(false)
const guidesExpanded = ref(true)
const mobileNav = ref(false)

const docSections = [
  { id: "getting-started", label: "Getting Started" },
  { id: "configuration", label: "Configuration" },
  { id: "schemas", label: "Schemas" },
  { id: "runtimes", label: "Runtimes" },
  { id: "models", label: "Models" },
  { id: "triage", label: "Triage" },
  { id: "cli", label: "CLI Reference" },
  { id: "ci-cd", label: "CI/CD" },
  { id: "output", label: "Output Format" },
  { id: "skill", label: "SKILL.md" },
]

const sections = [
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
]

function scrollTo(id: string) {
  activeSection.value = id
  mobileNav.value = false
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
    <button class="mobile-nav-toggle" @click="mobileNav = !mobileNav">
      &#9776; {{ mobileNav ? 'Close' : 'Menu' }}
    </button>
    <aside :class="['sidebar', { open: mobileNav }]">
      <div class="sidebar-inner">
        <button class="sidebar-title" :class="{ active: docsExpanded }" @click="docsExpanded = !docsExpanded">
          <span class="toggle-icon">&#9656;</span> Documentation
        </button>
        <nav v-if="docsExpanded" class="sidebar-nav">
          <RouterLink
            v-for="s in docSections"
            :key="s.id"
            :to="'/docs#' + s.id"
          >
            {{ s.label }}
          </RouterLink>
        </nav>
        <button class="sidebar-title" :class="{ active: guidesExpanded }" @click="guidesExpanded = !guidesExpanded">
          <span class="toggle-icon">&#9656;</span> User Guides
        </button>
        <nav v-if="guidesExpanded" class="sidebar-nav">
          <a
            v-for="s in sections"
            :key="s.id"
            :href="'#' + s.id"
            :class="{ active: activeSection === s.id }"
            @click.prevent="scrollTo(s.id)"
          >
            {{ s.label }}
          </a>
        </nav>
      </div>
    </aside>

    <main class="content">
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
          <pre><code><span class="c-dim"># Full codebase analysis</span>
crev run --schema thorough --analyze

<span class="c-dim"># Security-focused codebase scan</span>
crev run --schema standard --analyze --reviewers Security</code></pre>
        </div>

        <p>
          With <code>--analyze</code>, crev instructs each reviewer to analyze the
          entire codebase rather than a diff. Reviewers have full filesystem access
          and navigate the project themselves, reading files as needed to review
          it holistically.
        </p>
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
    <span class="y-key">prompt</span>: <span class="y-str">|
      Review for API contract consistency. Read the API spec
      in docs/api-spec.yaml and check that response shapes
      match documented types, error codes are consistent,
      and breaking changes are flagged.</span>

  - <span class="y-key">name</span>: <span class="y-val">Auth</span>
    <span class="y-key">runtime</span>: <span class="y-val">claude</span>
    <span class="y-key">model</span>: <span class="y-val">opus</span>
    <span class="y-key">agent</span>: <span class="y-val">auth-reviewer.md</span>

<span class="y-key">triage</span>:
  <span class="y-key">enabled</span>: <span class="y-bool">true</span>
  <span class="y-key">runtime</span>: <span class="y-val">claude</span>
  <span class="y-key">model</span>: <span class="y-val">opus</span>
</code></pre>
        </div>

        <p>
          Key design principle: <strong>treat schemas as portable</strong>. Avoid
          hardcoding file paths in prompts. Keep prompts focused on <em>what</em>
          to look for &mdash; reviewers have filesystem access and can read files
          directly when they need additional context.
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
    </main>
  </div>
</template>

<style scoped>
@import "../styles/docs-shared.css";

.sidebar-title + .sidebar-title {
  margin-top: 24px;
}
</style>
