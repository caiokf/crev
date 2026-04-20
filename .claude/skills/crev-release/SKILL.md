---
name: crev-release
description: Use when releasing a new version of crev - bumps version, builds, tests, tags, pushes, monitors CI pipeline, and verifies all distribution channels (npm, homebrew, GitHub release, standalone binary) are serving the correct version
---

# crev-release

Release a new version of crev to all distribution channels.

## Quick Reference

| Step | Command |
|------|---------|
| Pre-flight | `npx vitest run && npx tsup` |
| Bump | `npm version patch` (or `minor` / `major`) |
| Push | `git push origin main --tags` |
| Monitor | `gh run watch` |
| Verify npm | `npm view @caiokf/crev version` |
| Verify brew | `brew info caiokf/tap/crev` |
| Verify GH release | `gh release view v<VERSION>` |

## Workflow

### 1. Pre-release checks

```bash
# Must be on main, clean working tree
git status  # no uncommitted changes
git log --oneline -3  # verify HEAD

# Tests + build
npx vitest run
npx tsup
```

All tests must pass. Build must succeed. Stop if either fails.

### 2. Version bump

Ask the user what type of release: `patch`, `minor`, or `major`.

```bash
npm version patch   # 0.4.2 → 0.4.3
npm version minor   # 0.4.2 → 0.5.0
npm version major   # 0.4.2 → 1.0.0
```

This updates `package.json` and creates a git tag `v<VERSION>`.

### 3. Push to trigger CI

```bash
git push origin main --tags
```

The `v*` tag push triggers `.github/workflows/release.yml` which runs:
1. **npm-publish** — publishes `@caiokf/crev` to npm
2. **build-binaries** — compiles standalone binaries via `bun build --compile` for:
   - `crev-linux-x64`, `crev-linux-arm64`
   - `crev-darwin-x64`, `crev-darwin-arm64`
   - `crev-windows-x64.exe`
3. **github-release** — creates GitHub release with binaries + checksums
4. **update-homebrew** — updates `Formula/crev.rb` with new SHA256 hashes

### 4. Monitor CI

```bash
gh run list --limit 3
gh run watch  # interactive, waits for completion
```

All 4 jobs must pass. If any fail:
- `gh run view <RUN_ID> --log-failed` to diagnose
- Fix and re-tag if needed: `git tag -d v<VERSION> && git push origin :refs/tags/v<VERSION>`, fix, then re-bump

### 5. Verify distribution

Run all checks after CI completes:

```bash
# npm (may take 1-2 min to propagate)
npm view @caiokf/crev version

# GitHub release
gh release view v<VERSION>

# Homebrew (formula auto-updated by CI)
brew update && brew info caiokf/tap/crev

# Standalone installer
curl -fsSL https://raw.githubusercontent.com/caiokf/crev/main/install.sh | head -5
```

Expected: all channels report the new version.

## Rollback

If a broken version was published:

```bash
# npm: unpublish within 72 hours
npm unpublish @caiokf/crev@<VERSION>

# GitHub release: delete
gh release delete v<VERSION> --yes

# Tag: remove
git tag -d v<VERSION>
git push origin :refs/tags/v<VERSION>
```

Then fix, re-bump, and re-release.
