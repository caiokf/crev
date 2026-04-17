<script setup lang="ts">
import { RouterLink, RouterView } from "vue-router"
</script>

<template>
  <nav class="nav">
    <div class="nav-inner">
      <RouterLink to="/" class="nav-logo">crev</RouterLink>
      <div class="nav-links">
        <RouterLink to="/#features">Features</RouterLink>
        <RouterLink to="/docs">Docs</RouterLink>
        <RouterLink to="/#install">Install</RouterLink>
        <a href="https://github.com/caiokf/crev" target="_blank" class="nav-gh">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
            <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z"/>
          </svg>
        </a>
      </div>
    </div>
  </nav>

  <RouterView />

  <footer class="footer">
    <div class="footer-inner">
      <span class="footer-logo">crev</span>
      <div class="footer-links">
        <a href="https://github.com/caiokf/crev" target="_blank">GitHub</a>
        <a href="https://www.npmjs.com/package/@caiokf/crev" target="_blank">npm</a>
        <span class="footer-sep">&middot;</span>
        <span>MIT License</span>
      </div>
    </div>
  </footer>
</template>

<style scoped>
.nav {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  z-index: 100;
  backdrop-filter: blur(12px);
  background: rgba(5, 5, 8, 0.8);
  border-bottom: 1px solid var(--border);
}

.nav-inner {
  max-width: 1100px;
  margin: 0 auto;
  padding: 0 24px;
  height: 56px;
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.nav-logo {
  font-family: var(--font-mono);
  font-size: 18px;
  font-weight: 500;
  color: var(--accent);
  letter-spacing: -0.5px;
}

.nav-links {
  display: flex;
  align-items: center;
  gap: 28px;
  font-size: 14px;
  color: var(--text-2);
}

.nav-links a:hover {
  color: var(--text);
}

.nav-gh {
  display: flex;
  color: var(--text-2);
  transition: color 0.2s;
}

.nav-gh:hover {
  color: var(--text);
}

.footer {
  padding: 40px 24px;
  border-top: 1px solid var(--border);
}

.footer-inner {
  max-width: 1100px;
  margin: 0 auto;
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.footer-logo {
  font-family: var(--font-mono);
  font-size: 15px;
  color: var(--text-3);
  font-weight: 500;
}

.footer-links {
  display: flex;
  align-items: center;
  gap: 16px;
  font-size: 13px;
  color: var(--text-3);
}

.footer-links a:hover {
  color: var(--text-2);
}

.footer-sep {
  color: var(--border-2);
}

@media (max-width: 768px) {
  .footer-inner {
    flex-direction: column;
    gap: 16px;
  }
}
</style>
