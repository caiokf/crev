import fs from "node:fs"
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
 */
export function resolveAgentPath(agentPath: string, ctx: AgentPathContext = {}): string {
  if (path.isAbsolute(agentPath)) {
    return path.normalize(agentPath)
  }

  const cwd = ctx.cwd ?? process.cwd()
  const projectRoot = ctx.projectRoot ?? (ctx.crevDir ? path.dirname(ctx.crevDir) : undefined)
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
