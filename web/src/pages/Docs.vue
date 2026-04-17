<script setup lang="ts">
import { ref, onMounted, watch } from "vue"
import { useRoute } from "vue-router"

const route = useRoute()
const activeSection = ref("getting-started")

const sections = [
  { id: "getting-started", label: "Getting Started" },
  { id: "configuration", label: "Configuration" },
  { id: "schemas", label: "Schemas" },
  { id: "runtimes", label: "Runtimes" },
  { id: "models", label: "Models" },
  { id: "triage", label: "Triage" },
  { id: "cli", label: "CLI Reference" },
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
      <!-- Getting Started -->
      <section id="getting-started">
        <h1>Getting Started</h1>
        <p class="lead">
          crev runs multiple AI reviewers in parallel against your code diffs,
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

.sidebar-nav a {
  display: block;
  padding: 8px 12px;
  font-size: 14px;
  color: var(--text-2);
  border-radius: 6px;
  transition: color 0.15s, background 0.15s;
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
