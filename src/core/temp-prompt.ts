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
  // "wx" = O_CREAT | O_EXCL — fail if the path already exists (including
  // as a symlink) so an attacker who predicts the filename cannot
  // pre-create it to redirect the write. mode 0o600 keeps prompt
  // contents readable only by the owner.
  fs.writeFileSync(promptFile, prompt, { encoding: "utf-8", flag: "wx", mode: 0o600 })

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
