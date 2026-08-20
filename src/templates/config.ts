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

# reviewers:
#   # Wall a reviewer gets, in milliseconds. Unset leaves each runtime's own
#   # default, which is sized for a diff. A whole-codebase pass (--analyze)
#   # needs more: a reviewer killed part way through returns nothing, and an
#   # empty result reads as "found no problems".
#   timeoutMs: 1800000

diff:
  exclude:
    - "package-lock.json"

output:
  dir: .crev/reviews
  format: json              # json | markdown | both

normalizer:
  enabled: true
  runtime: claude
  model: haiku

triage:
  enabled: false
  runtime: claude
  model: opus

# fix:
#   runtime: claude
#   model: sonnet
`
