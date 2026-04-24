export type NavSection = {
  id: string
  label: string
}

export const docSections: NavSection[] = [
  { id: "getting-started", label: "Getting Started" },
  { id: "configuration", label: "Configuration" },
  { id: "schemas", label: "Schemas" },
  { id: "runtimes", label: "Runtimes" },
  { id: "models", label: "Models" },
  { id: "triage", label: "Triage" },
  { id: "fix", label: "Auto-Fix" },
  { id: "cli", label: "CLI Reference" },
  { id: "ci-cd", label: "CI/CD" },
  { id: "output", label: "Output Format" },
  { id: "skill", label: "SKILL.md" },
]

export const guideSections: NavSection[] = [
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
