export const thoroughSchema = `description: Comprehensive multi-perspective review for critical changes
reviewers:
  - name: Engineer
    runtime: claude
    model: opus
    agent: engineer.md
  - name: Security
    runtime: claude
    model: opus
    agent: security.md
  - name: Architect
    runtime: gemini
    model: gemini-2.5-pro
    agent: architect.md
  - name: Performance
    runtime: codex
    model: gpt-5.3-codex
    agent: performance.md
  - name: Testing
    runtime: claude
    model: sonnet
    agent: testing.md
  - name: Documentation
    runtime: claude
    model: haiku
    agent: documentation.md
triage:
  enabled: true
  runtime: claude
  model: opus
`
