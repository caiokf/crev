<script setup lang="ts">
import { ref, onMounted } from "vue"

type Line = { text: string; cls: string; delay: number }

const lines: Line[] = [
  { text: "Running 3 reviewers from schema standard", cls: "info", delay: 1000 },
  { text: "  \u2713 Engineer     5 issues (42.1s)", cls: "done", delay: 2600 },
  { text: "  \u2713 Security     2 issues (38.7s)", cls: "done", delay: 3400 },
  { text: "  \u2713 Architect    1 issue  (51.3s)", cls: "done", delay: 4600 },
  { text: "", cls: "", delay: 5200 },
  { text: "\u2502  Review Summary", cls: "summary", delay: 5400 },
  { text: "\u2502    high: 2", cls: "high", delay: 5700 },
  { text: "\u2502    medium: 4", cls: "medium", delay: 5900 },
  { text: "\u2502    low: 2", cls: "low", delay: 6100 },
  { text: "\u2502    Output: .crev/reviews/2026-04-17-main.json", cls: "dim", delay: 6400 },
]

const cmdText = ref("")
const cmdDone = ref(false)
const visibleCount = ref(0)
const fullCmd = "crev run --schema standard --base main"

onMounted(() => {
  let i = 0
  const tick = setInterval(() => {
    if (i < fullCmd.length) {
      cmdText.value = fullCmd.slice(0, ++i)
    } else {
      clearInterval(tick)
      cmdDone.value = true
      for (const [idx, line] of lines.entries()) {
        setTimeout(() => { visibleCount.value = idx + 1 }, line.delay)
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
      <template v-for="(line, idx) in lines" :key="idx">
        <div v-if="idx < visibleCount" :class="['line', line.cls]" class="line-enter">
          {{ line.text }}
        </div>
      </template>
    </div>
  </div>
</template>

<style scoped>
.terminal {
  background: #0a0a10;
  border: 1px solid var(--border);
  border-radius: 10px;
  overflow: hidden;
  width: 100%;
  max-width: 640px;
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
  background: #111118;
  border-bottom: 1px solid var(--border);
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

.line.done {
  color: var(--accent);
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
