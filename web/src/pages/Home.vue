<script setup lang="ts">
import { ref, onMounted } from "vue"
import TerminalDemo from "../components/TerminalDemo.vue"

const activeTab = ref<"npm" | "brew" | "curl">("npm")
const copied = ref(false)

const installCommands = {
  npm: "npm install -g @caiokf/crev",
  brew: "brew tap caiokf/crev https://github.com/caiokf/crev\nbrew install crev",
  curl: "curl -fsSL https://crev.sh/install | sh",
}

function copy() {
  navigator.clipboard.writeText(installCommands[activeTab.value])
  copied.value = true
  setTimeout(() => (copied.value = false), 2000)
}

const runtimes = [
  { name: "Claude", color: "#d4a574" },
  { name: "Gemini", color: "#8b9cf7" },
  { name: "Codex", color: "#10a37f" },
  { name: "CodeRabbit", color: "#ff6b35" },
  { name: "Copilot", color: "#6e40c9" },
  { name: "OpenCode", color: "#e44d26" },
]

const features = [
  {
    icon: "\u2261",
    title: "Parallel Execution",
    desc: "Every reviewer runs simultaneously. A 3-reviewer schema finishes in the time of the slowest, not the sum.",
  },
  {
    icon: "\u25CB",
    title: "Multi-Runtime",
    desc: "Mix Claude, Gemini, Codex, and more in a single review. Each reviewer can use a different AI.",
  },
  {
    icon: "\u25B3",
    title: "Smart Triage",
    desc: "A devil's advocate AI challenges every finding. Only genuinely actionable issues survive.",
  },
  {
    icon: "\u007B\u007D",
    title: "Structured Output",
    desc: "Every issue: file, line, severity, category. JSON you can pipe, filter, and track.",
  },
  {
    icon: "\u2630",
    title: "Schema-Driven",
    desc: "YAML files define your reviewer teams. Version them, share them, tune them over time.",
  },
  {
    icon: "\u2197",
    title: "Stats & Tuning",
    desc: "Track actionable vs dismissed rates per reviewer. Data-driven prompt improvement.",
  },
]

// Scroll reveal
onMounted(() => {
  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((e) => {
        if (e.isIntersecting) {
          e.target.classList.add("visible")
          observer.unobserve(e.target)
        }
      })
    },
    { threshold: 0.08, rootMargin: "0px 0px -40px 0px" },
  )
  // Small delay to ensure DOM is ready
  requestAnimationFrame(() => {
    document.querySelectorAll(".reveal").forEach((el) => observer.observe(el))
  })
})
</script>

<template>
  <!-- Hero -->
  <section class="hero">
    <div class="hero-glow"></div>
    <div class="hero-content">
      <h1 class="hero-title">
        Multi-AI code review.<br />
        <em>One command.</em>
      </h1>
      <div class="hero-terminal">
        <TerminalDemo />
      </div>
      <h2 class="hero-headline">
        Run your coding agents headless.<br />
        <em>No API keys.</em>
      </h2>
      <p class="hero-callout">
        <strong class="accent">crev</strong> runs Claude Code, Gemini CLI, Codex CLI and more &mdash;
        using the subscriptions you already pay for.
        No extra token costs, no separate billing.
        Every reviewer in parallel, every perspective, every time.
      </p>
    </div>
  </section>

  <!-- Features -->
  <section id="features" class="section">
    <div class="container">
      <h2 class="section-title reveal">How it works</h2>
      <p class="section-sub reveal">
        Define reviewers in YAML. Run one command. Get structured findings.
      </p>
      <div class="features-grid">
        <div
          v-for="(f, i) in features"
          :key="f.title"
          class="feature-card reveal"
          :style="{ transitionDelay: `${i * 0.08}s` }"
        >
          <div class="feature-icon">{{ f.icon }}</div>
          <h3>{{ f.title }}</h3>
          <p>{{ f.desc }}</p>
        </div>
      </div>
    </div>
  </section>

  <!-- Schema example -->
  <section class="section section-dark">
    <div class="container">
      <div class="schema-row reveal">
        <div class="schema-text">
          <h2 class="section-title">Schema-driven reviews</h2>
          <p class="section-sub">
            Define your reviewer team in a YAML file. Each reviewer gets its own
            runtime, model, and custom prompt. Commit your schemas and share
            across the team.
          </p>
        </div>
        <div class="schema-code">
          <div class="schema-filename">.crev/schemas/standard.yaml</div>
          <pre><code><span class="y-key">reviewers</span>:
  - <span class="y-key">name</span>: <span class="y-val">Engineer</span>
    <span class="y-key">runtime</span>: <span class="y-val">claude</span>
    <span class="y-key">model</span>: <span class="y-val">sonnet</span>
    <span class="y-key">prompt</span>: <span class="y-str">"Focus on bugs and logic errors."</span>

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
      </div>
    </div>
  </section>

  <!-- Install -->
  <section id="install" class="section">
    <div class="container">
      <h2 class="section-title reveal" style="text-align: center">Get started</h2>
      <div class="install-block reveal">
        <div class="install-tabs">
          <button
            v-for="tab in (['npm', 'brew', 'curl'] as const)"
            :key="tab"
            :class="['tab', { active: activeTab === tab }]"
            @click="activeTab = tab"
          >
            {{ tab }}
          </button>
        </div>
        <div class="install-cmd">
          <pre><code>{{ installCommands[activeTab] }}</code></pre>
          <button class="copy-btn" @click="copy">
            {{ copied ? "copied" : "copy" }}
          </button>
        </div>
      </div>
      <p class="install-hint reveal">
        Then run <code>crev init</code> in your project to get started.
      </p>
    </div>
  </section>

  <!-- Runtimes -->
  <section class="section section-dark">
    <div class="container">
      <h2 class="section-title reveal" style="text-align: center">Supported runtimes</h2>
      <div class="runtime-strip reveal">
        <div
          v-for="rt in runtimes"
          :key="rt.name"
          class="runtime-badge"
        >
          <span class="runtime-dot" :style="{ background: rt.color }"></span>
          {{ rt.name }}
        </div>
      </div>
    </div>
  </section>

</template>

<style scoped>
/* ── Hero ── */
.hero {
  position: relative;
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 120px 24px 80px;
}

.hero-glow {
  position: absolute;
  top: -200px;
  left: 50%;
  transform: translateX(-50%);
  width: 800px;
  height: 600px;
  background: radial-gradient(ellipse, rgba(255, 140, 0, 0.08) 0%, transparent 70%);
  pointer-events: none;
  z-index: 1;
}

.hero-content {
  position: relative;
  z-index: 1;
  text-align: center;
  max-width: 720px;
}

.hero-title {
  font-family: var(--font-display);
  font-size: clamp(2.8rem, 7vw, 4.8rem);
  font-weight: 400;
  line-height: 1.15;
  letter-spacing: -1px;
  color: var(--text);
  margin-bottom: 20px;
  text-shadow: 0 2px 16px rgba(0, 0, 0, 0.6);
}

.hero-title em {
  color: var(--accent);
}

.hero-terminal {
  display: flex;
  justify-content: center;
}

/* ── Sections ── */
.section {
  padding: 100px 24px;
}

.section-dark {
  border-top: 1px solid rgba(255, 255, 255, 0.04);
  border-bottom: 1px solid rgba(255, 255, 255, 0.04);
}

.container {
  max-width: 1100px;
  margin: 0 auto;
}

.section-title {
  font-family: var(--font-display);
  font-size: clamp(1.8rem, 4vw, 2.6rem);
  font-weight: 400;
  letter-spacing: -0.5px;
  margin-bottom: 12px;
}

.section-sub {
  color: var(--text);
  font-size: 16px;
  line-height: 1.7;
  margin-bottom: 48px;
  font-weight: 300;
  max-width: 520px;
  opacity: 0.75;
  text-shadow: 0 1px 8px rgba(0, 0, 0, 0.5);
}

/* ── Features ── */
.features-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
  gap: 20px;
}

.feature-card {
  padding: 28px;
  background: rgba(12, 12, 17, 0.45);
  border: 1px solid rgba(255, 255, 255, 0.06);
  border-radius: 10px;
  backdrop-filter: blur(16px);
  -webkit-backdrop-filter: blur(16px);
  transition: border-color 0.3s, box-shadow 0.3s;
}

.feature-card:hover {
  border-color: var(--border-2);
  box-shadow: 0 0 40px var(--accent-glow);
}

.feature-icon {
  font-size: 22px;
  color: var(--accent);
  margin-bottom: 14px;
  font-weight: 500;
}

.feature-card h3 {
  font-family: var(--font-body);
  font-size: 16px;
  font-weight: 600;
  margin-bottom: 8px;
  color: var(--text);
}

.feature-card p {
  font-size: 14px;
  color: var(--text);
  line-height: 1.65;
  font-weight: 300;
  opacity: 0.7;
}

/* ── Schema ── */
.schema-row {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 48px;
  align-items: center;
}

.schema-text .section-title {
  margin-bottom: 16px;
}

.schema-code {
  background: rgba(10, 10, 16, 0.45);
  border: 1px solid rgba(255, 255, 255, 0.06);
  border-radius: 10px;
  padding: 0;
  overflow: hidden;
  backdrop-filter: blur(16px);
  -webkit-backdrop-filter: blur(16px);
}

.schema-filename {
  padding: 10px 20px;
  font-family: var(--font-mono);
  font-size: 12px;
  color: var(--text-3);
  border-bottom: 1px solid rgba(255, 255, 255, 0.06);
}

.schema-code pre {
  padding: 20px;
  font-family: var(--font-mono);
  font-size: 13px;
  line-height: 1.7;
  color: var(--text-2);
}

.y-key { color: #7dd3fc; }
.y-val { color: var(--text); }
.y-str { color: var(--accent); }
.y-bool { color: #fbbf24; }

/* ── Runtimes ── */
.runtime-strip {
  display: flex;
  justify-content: center;
  flex-wrap: wrap;
  gap: 16px;
  margin-top: 36px;
}

.runtime-badge {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 20px;
  background: rgba(12, 12, 17, 0.4);
  border: 1px solid rgba(255, 255, 255, 0.06);
  border-radius: 8px;
  backdrop-filter: blur(16px);
  -webkit-backdrop-filter: blur(16px);
  font-family: var(--font-mono);
  font-size: 14px;
  color: var(--text-2);
  transition: border-color 0.2s;
}

.runtime-badge:hover {
  border-color: var(--border-2);
  color: var(--text);
}

.runtime-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
}

/* ── Install ── */
.install-block {
  max-width: 680px;
  margin: 36px auto 0;
  border: 1px solid rgba(255, 255, 255, 0.06);
  border-radius: 10px;
  overflow: hidden;
  background: rgba(10, 10, 16, 0.45);
  backdrop-filter: blur(16px);
  -webkit-backdrop-filter: blur(16px);
}

.install-tabs {
  display: flex;
  border-bottom: 1px solid var(--border);
}

.tab {
  flex: 1;
  padding: 10px;
  font-family: var(--font-mono);
  font-size: 13px;
  color: var(--text-3);
  background: transparent;
  border: none;
  cursor: pointer;
  transition: color 0.2s, background 0.2s;
}

.tab:hover {
  color: var(--text-2);
}

.tab.active {
  color: var(--accent);
  background: var(--surface-2);
}

.install-cmd {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 20px;
  font-family: var(--font-mono);
  font-size: 14px;
  color: var(--text);
  min-height: calc(2lh + 32px);
}

.install-cmd pre {
  margin: 0;
  font-family: inherit;
  font-size: inherit;
  white-space: pre;
}

.copy-btn {
  font-family: var(--font-mono);
  font-size: 12px;
  color: var(--text-3);
  background: var(--surface-2);
  border: 1px solid var(--border);
  border-radius: 6px;
  padding: 5px 12px;
  cursor: pointer;
  transition: color 0.2s, border-color 0.2s;
  white-space: nowrap;
  margin-left: 16px;
}

.copy-btn:hover {
  color: var(--accent);
  border-color: var(--border-2);
}

.install-hint {
  text-align: center;
  margin-top: 24px;
  color: var(--text);
  opacity: 0.6;
  font-size: 14px;
}

.install-hint code {
  font-family: var(--font-mono);
  color: var(--text-2);
  background: var(--surface-2);
  padding: 2px 6px;
  border-radius: 4px;
}

/* ── Hero headline + callout ── */
.hero-headline {
  font-family: var(--font-display);
  font-size: clamp(1.6rem, 4vw, 2.6rem);
  font-weight: 400;
  line-height: 1.2;
  letter-spacing: -0.5px;
  color: var(--text);
  margin-top: 72px;
  margin-bottom: 16px;
  text-shadow: 0 2px 16px rgba(0, 0, 0, 0.6);
}

.hero-headline em {
  color: var(--accent);
}

.hero-callout {
  font-size: 16px;
  color: rgba(255, 255, 255, 0.75);
  line-height: 1.7;
  font-weight: 300;
  max-width: 540px;
  margin: 0 auto;
  text-shadow: 0 1px 8px rgba(0, 0, 0, 0.5);
}

.hero-callout strong.accent {
  color: var(--accent);
  font-weight: 600;
}

/* ── Responsive ── */
@media (max-width: 768px) {
  .schema-row {
    grid-template-columns: 1fr;
  }

  .hero-title {
    font-size: 2.4rem;
  }

  .section {
    padding: 72px 20px;
  }

  .features-grid {
    grid-template-columns: 1fr;
  }

  .install-cmd {
    flex-direction: column;
    gap: 12px;
    align-items: flex-start;
    min-height: auto;
  }

  .install-cmd pre {
    white-space: pre-wrap;
    word-break: break-all;
  }

  .install-cmd code {
    font-size: 12px;
  }

  .copy-btn {
    margin-left: 0;
  }
}
</style>
