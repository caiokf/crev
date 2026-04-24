import fs from "node:fs"
import os from "node:os"
import path from "node:path"

export type AgentPathContext = {
  schemaPath?: string
  crevDir?: string
  projectRoot?: string
  cwd?: string
}

/**
 * Resolve an agent path deterministically, independent of the current working directory.
 *
 * Resolution order for relative paths:
 * 1) schema directory (if schemaPath is known)
 * 2) project root (if known)
 * 3) .crev directory (if known)
 * 4) cwd (fallback)
 *
 * Returns the first existing candidate; if none exist, returns the first candidate.
 *
 * After resolving, the path is verified to live under an allowed root
 * (project root, crev dir, user crev dir, or — as a fallback when no
 * context is given — cwd). Agent fields come from schema YAML
 * authored by potentially untrusted third parties, so we refuse to
 * read agent prompts from arbitrary filesystem locations like
 * /etc/passwd or ../../../etc/shadow.
 */
export function resolveAgentPath(agentPath: string, ctx: AgentPathContext = {}): string {
  const cwd = ctx.cwd ?? process.cwd()
  const projectRoot = ctx.projectRoot ?? (ctx.crevDir ? path.dirname(ctx.crevDir) : undefined)

  const resolved = path.isAbsolute(agentPath)
    ? path.normalize(agentPath)
    : resolveRelative(agentPath, ctx, cwd, projectRoot)

  if (!isUnderAllowedRoot(resolved, ctx, projectRoot, cwd)) {
    throw new Error(
      `Agent path "${agentPath}" resolves outside the allowed roots (project, .crev, ~/.crev)`,
    )
  }

  return resolved
}

function resolveRelative(
  agentPath: string,
  ctx: AgentPathContext,
  cwd: string,
  projectRoot: string | undefined,
): string {
  const isBareFilename = !agentPath.includes("/") && !agentPath.includes("\\")

  const candidates: string[] = []
  if (isBareFilename && ctx.crevDir) candidates.push(path.resolve(ctx.crevDir, "agents", agentPath))
  if (ctx.schemaPath) candidates.push(path.resolve(path.dirname(ctx.schemaPath), agentPath))
  if (projectRoot) candidates.push(path.resolve(projectRoot, agentPath))
  if (ctx.crevDir) candidates.push(path.resolve(ctx.crevDir, agentPath))
  candidates.push(path.resolve(cwd, agentPath))

  const uniqueCandidates = [...new Set(candidates)]
  const existing = uniqueCandidates.find((candidate) => fs.existsSync(candidate))

  return existing ?? uniqueCandidates[0] ?? path.resolve(cwd, agentPath)
}

function isUnderAllowedRoot(
  resolved: string,
  ctx: AgentPathContext,
  projectRoot: string | undefined,
  cwd: string,
): boolean {
  const normalized = path.resolve(resolved)
  const roots: string[] = []
  if (projectRoot) roots.push(path.resolve(projectRoot))
  if (ctx.crevDir) roots.push(path.resolve(ctx.crevDir))
  if (ctx.schemaPath) roots.push(path.resolve(path.dirname(ctx.schemaPath)))
  roots.push(path.join(os.homedir(), ".crev"))
  // Fall back to cwd when nothing else is known so ad-hoc callers
  // (e.g. tests) still get a usable default.
  if (roots.length === 1) roots.push(path.resolve(cwd))

  return roots.some((root) => normalized === root || normalized.startsWith(root + path.sep))
}
