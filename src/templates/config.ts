export const configTemplate = `defaults:
  schema: quick
  type: all
  base: main

runtimes:
  claude:
    command: claude
    env: {}
    args: []

aliases:
  opus: claude-opus-4-6
  sonnet: claude-sonnet-4-6
  haiku: claude-haiku-4-5-20251001

diff:
  exclude:
    - "package-lock.json"

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
