export const configTemplate = `defaults:
  schema: quick
  type: all
  base: main

runtimes:
  claude:
    # command: cc          # use a custom binary name / alias
    env: {}
    args: []
  codex:
    env: {}
    args: []
  gemini:
    env: {}
    args: []
  # kimi:
  #   env: {}
  #   args: []
  # opencode:
  #   command: opencode
  #   env: {}
  #   args: []

aliases:
  opus: claude-opus-4-6
  sonnet: claude-sonnet-4-6
  haiku: claude-haiku-4-5-20251001

diff:
  exclude:
    - "pnpm-lock.yaml"
    - "package-lock.json"
    - "yarn.lock"
    - "**/*.snap"
    - "**/*.generated.ts"

output:
  dir: .crev/reviews
  format: json

normalizer:
  enabled: true
  runtime: claude
  model: haiku

triage:
  enabled: false
  runtime: claude
  model: opus
  context: []
`
