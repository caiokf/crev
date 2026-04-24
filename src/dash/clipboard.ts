import { spawn } from "node:child_process"

/**
 * Copy `text` to the system clipboard.
 *
 * Tries a platform-native CLI (`pbcopy` on macOS, `xclip` / `xsel` /
 * `wl-copy` on linux, `clip` on windows) first — these work on local
 * sessions. Falls back to the OSC 52 terminal escape, which is
 * relayed by modern terminals (iTerm2, WezTerm, kitty, tmux) even
 * over SSH, at the cost of terminal support being required.
 *
 * Resolves when the copy succeeds, rejects with a descriptive Error
 * otherwise so callers can surface a status-line toast.
 */
export function copyToClipboard(text: string): Promise<void> {
  const native = pickNativeCommand()
  if (native) {
    return runCopyCommand(native.cmd, native.args, text).catch((err) => {
      // If the native helper exists but failed (e.g. no X display under
      // linux), try OSC 52 before giving up.
      return writeOsc52(text).catch(() => {
        throw err
      })
    })
  }
  return writeOsc52(text)
}

type NativeCopy = { readonly cmd: string; readonly args: readonly string[] }

function pickNativeCommand(): NativeCopy | null {
  if (process.platform === "darwin") return { cmd: "pbcopy", args: [] }
  if (process.platform === "win32") return { cmd: "clip", args: [] }
  if (process.platform === "linux") {
    if (process.env.WAYLAND_DISPLAY) return { cmd: "wl-copy", args: [] }
    if (process.env.DISPLAY) return { cmd: "xclip", args: ["-selection", "clipboard"] }
  }
  return null
}

function runCopyCommand(cmd: string, args: readonly string[], text: string): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    try {
      const proc = spawn(cmd, [...args], { stdio: ["pipe", "ignore", "pipe"] })
      proc.on("error", (err) => reject(err))
      proc.on("exit", (code) => {
        if (code === 0) resolve()
        else reject(new Error(`${cmd} exited with code ${code}`))
      })
      proc.stdin?.end(text, "utf8")
    } catch (err) {
      reject(err instanceof Error ? err : new Error(String(err)))
    }
  })
}

function writeOsc52(text: string): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    try {
      const payload = Buffer.from(text, "utf8").toString("base64")
      const esc = `\x1b]52;c;${payload}\x07`
      process.stdout.write(esc, (err) => {
        if (err) reject(err)
        else resolve()
      })
    } catch (err) {
      reject(err instanceof Error ? err : new Error(String(err)))
    }
  })
}
