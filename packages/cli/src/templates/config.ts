export const configTemplate = `defaults:
  schema: quick
  type: all
  base: main

aliases: {}

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
