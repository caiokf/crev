export const standardSchema = `description: Balanced review covering correctness, security, and design
reviewers:
  - name: Engineer
    runtime: claude
    model: sonnet
    agent: engineer.md
  - name: Security
    runtime: claude
    model: opus
    agent: security.md
  - name: Architect
    runtime: gemini
    model: gemini-2.5-pro
    agent: architect.md
triage:
  enabled: true
  runtime: claude
  model: opus
`
