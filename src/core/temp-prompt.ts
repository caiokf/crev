import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { uniqueSuffix } from "../util/paths.js"

export async function withTempPromptFile<T>(
  prefix: string,
  prompt: string,
  run: (promptFile: string) => Promise<T>,
): Promise<T> {
  const promptFile = path.join(os.tmpdir(), `${prefix}-${process.pid}-${uniqueSuffix()}.txt`)
  fs.writeFileSync(promptFile, prompt, "utf-8")

  try {
    return await run(promptFile)
  } finally {
    try {
      fs.unlinkSync(promptFile)
    } catch {
      // Best-effort cleanup
    }
  }
}
