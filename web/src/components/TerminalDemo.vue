<script setup lang="ts">
import { ref, onMounted } from "vue"

type Line = { text: string; cls: string; delay: number }

const lines: Line[] = [
  { text: "Running 3 reviewers from schema standard", cls: "info", delay: 1000 },
  { text: "│", cls: "dim", delay: 1400 },
  { text: "│    ○ Engineer  (claude/sonnet)", cls: "pending", delay: 1500 },
  { text: "│    ○ Security  (gemini/gemini-2.5-pro)", cls: "pending", delay: 1600 },
  { text: "│    ○ Architect (claude/opus)", cls: "pending", delay: 1700 },
]

/* Second phase: reviewers complete one-by-one (fastest first) */
const completions: { idx: number; text: string; cls: string; delay: number }[] = [
  { idx: 3, text: "│    ◆ Security  (gemini/gemini-2.5-pro)     38.7s  2 issues", cls: "done", delay: 3200 },
  { idx: 2, text: "│    ◆ Engineer  (claude/sonnet)             42.1s  5 issues", cls: "done-warn", delay: 3800 },
  { idx: 4, text: "│    ◆ Architect (claude/opus)               51.3s  1 issue", cls: "done", delay: 5000 },
]

const summaryLines: Line[] = [
  { text: "│", cls: "dim", delay: 5600 },
  { text: "│  Review Summary", cls: "summary", delay: 5800 },
  { text: "│    high: 2", cls: "high", delay: 6000 },
  { text: "│    medium: 4", cls: "medium", delay: 6200 },
  { text: "│    low: 2", cls: "low", delay: 6400 },
  { text: "│", cls: "dim", delay: 6600 },
  { text: "│    Output: .crev/reviews/2026-04-17-main.json", cls: "dim", delay: 6800 },
]

const cmdText = ref("")
const cmdDone = ref(false)
const visibleCount = ref(0)
const displayLines = ref<Line[]>([])
const summaryVisible = ref(0)
const fullCmd = "crev run --schema standard --base main"

onMounted(() => {
  let i = 0
  const tick = setInterval(() => {
    if (i < fullCmd.length) {
      cmdText.value = fullCmd.slice(0, ++i)
    } else {
      clearInterval(tick)
      cmdDone.value = true

      /* Phase 1: show initial lines (header + pending reviewers) */
      displayLines.value = [...lines]
      for (const [idx] of lines.entries()) {
        setTimeout(() => { visibleCount.value = idx + 1 }, lines[idx].delay)
      }

      /* Phase 2: replace pending lines with completed ones (fastest first) */
      for (const c of completions) {
        setTimeout(() => {
          displayLines.value[c.idx] = { text: c.text, cls: c.cls, delay: 0 }
        }, c.delay)
      }

      /* Phase 3: append summary */
      for (const [idx, line] of summaryLines.entries()) {
        setTimeout(() => { summaryVisible.value = idx + 1 }, line.delay)
      }
    }
  }, 32)
})
</script>

<template>
  <div class="terminal">
    <div class="terminal-bar">
      <span class="dot dot-r"></span>
      <span class="dot dot-y"></span>
      <span class="dot dot-g"></span>
      <span class="terminal-title">terminal</span>
    </div>
    <div class="terminal-body">
      <div class="line cmd">
        <span class="prompt">$</span>
        <span>{{ cmdText }}</span>
        <span v-if="!cmdDone" class="cursor">_</span>
      </div>
      <template v-for="(line, idx) in displayLines" :key="'l'+idx">
        <div v-if="idx < visibleCount" :class="['line', line.cls]" class="line-enter">
          {{ line.text }}
        </div>
      </template>
      <template v-for="(line, idx) in summaryLines" :key="'s'+idx">
        <div v-if="idx < summaryVisible" :class="['line', line.cls]" class="line-enter">
          {{ line.text }}
        </div>
      </template>
    </div>
  </div>
</template>

<style scoped>
.terminal {
  background: rgba(10, 10, 16, 0.5);
  border: 1px solid rgba(255, 255, 255, 0.06);
  border-radius: 10px;
  overflow: hidden;
  width: 100%;
  max-width: 640px;
  backdrop-filter: blur(20px);
  -webkit-backdrop-filter: blur(20px);
  box-shadow:
    0 0 0 1px rgba(255, 255, 255, 0.03),
    0 20px 60px rgba(0, 0, 0, 0.5),
    0 0 80px var(--accent-glow);
}

.terminal-bar {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 10px 14px;
  background: rgba(17, 17, 24, 0.5);
  border-bottom: 1px solid rgba(255, 255, 255, 0.04);
}

.dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
}
.dot-r { background: #ff5f57; }
.dot-y { background: #febc2e; }
.dot-g { background: #28c840; }

.terminal-title {
  margin-left: auto;
  font-family: var(--font-mono);
  font-size: 11px;
  color: var(--text-3);
  margin-right: auto;
  padding-right: 36px;
}

.terminal-body {
  padding: 18px 20px;
  font-family: var(--font-mono);
  font-size: 13px;
  line-height: 1.7;
  min-height: 260px;
  text-align: left;
}

.line {
  white-space: pre;
  color: var(--text-2);
}

.line.cmd {
  color: var(--text);
}

.prompt {
  color: var(--accent);
  margin-right: 8px;
}

.cursor {
  animation: blink 0.8s step-end infinite;
  color: var(--accent);
}

.line.info {
  color: var(--text-2);
}

.line.pending {
  color: var(--text-3);
}

.line.done {
  color: var(--accent);
}

.line.done-warn {
  color: #fbbf24;
}

.line.summary {
  color: var(--text);
  font-weight: 500;
}

.line.high {
  color: #f87171;
}

.line.medium {
  color: #fbbf24;
}

.line.low {
  color: #60a5fa;
}

.line.dim {
  color: var(--text-3);
}

.line-enter {
  animation: fadeSlideIn 0.3s ease both;
}

@keyframes blink {
  50% { opacity: 0; }
}

@keyframes fadeSlideIn {
  from {
    opacity: 0;
    transform: translateY(4px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}
</style>
