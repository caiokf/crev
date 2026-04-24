import type blessed from "blessed"

/**
 * Open a file in $EDITOR (or `vi` as a fallback), handing the TTY
 * back to blessed on exit. Uses `screen.program.spawn` so blessed
 * can suspend/resume its cursor + raw-mode state cleanly instead of
 * us juggling it ourselves.
 *
 * Returns a promise that resolves with the editor's exit code. On
 * platforms without a configured editor or when spawn fails, the
 * promise rejects with an Error the caller can surface inline.
 */
export function openInEditor(
  screen: blessed.Widgets.Screen,
  filePath: string,
): Promise<number> {
  const editor = process.env.EDITOR || process.env.VISUAL || "vi"

  return new Promise<number>((resolve, reject) => {
    try {
      const proc = screen.spawn(editor, [filePath], {})
      proc.on("error", (err: unknown) => reject(err instanceof Error ? err : new Error(String(err))))
      proc.on("exit", (code: number | null) => {
        screen.render()
        resolve(code ?? 0)
      })
    } catch (err) {
      reject(err instanceof Error ? err : new Error(String(err)))
    }
  })
}
