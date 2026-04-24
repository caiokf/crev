// Must precede `import blessed` so the shim's static requires land in
// the bundle before blessed's own widget loader runs.
import "./blessed-widgets-shim.js"
import blessed from "blessed"
import { findCrevDir } from "../core/config.js"
import { makeRouter } from "./router.js"
import { DASH_COLORS, HEADER_STYLE, STATUSLINE_STYLE } from "./theme.js"
import type { AppContext, DashRoute, QuitGuard } from "./types.js"

/**
 * App shell for `crev dash`.
 *
 * Owns the blessed screen, renders a persistent header + statusline,
 * and delegates the body region to the router. Global keys (q, esc,
 * backspace, ctrl-c) are wired here so every view inherits a
 * consistent quit/back behavior without each view re-binding them.
 *
 * Returns a promise that resolves when the user quits — callers
 * (the CLI shim) can await it and return to a clean terminal.
 */

export type RunDashOptions = {
  readonly initialRoute?: DashRoute
  /** Allows the CLI shim to override where config/schemas are read from (used by tests). */
  readonly crevDir?: string
}

export function runDash(opts: RunDashOptions = {}): Promise<void> {
  const crevDir = opts.crevDir ?? findCrevDir()

  const screen = blessed.screen({
    smartCSR: true,
    title: "crev dash",
    fullUnicode: true,
    // Debug + warnings go to stderr via blessed; silence noisy output.
    warnings: false,
  })

  const header = blessed.box({
    parent: screen,
    top: 0,
    left: 0,
    right: 0,
    height: 1,
    tags: true,
    content: `{${DASH_COLORS.accent}-fg}{bold}crev dash{/bold}{/${DASH_COLORS.accent}-fg}  ${dim(crevDir)}`,
    style: HEADER_STYLE,
  })
  void header

  const body = blessed.box({
    parent: screen,
    top: 1,
    left: 0,
    right: 0,
    bottom: 1,
  })

  const statusline = blessed.box({
    parent: screen,
    bottom: 0,
    left: 0,
    right: 0,
    height: 1,
    tags: true,
    style: STATUSLINE_STYLE,
  })

  const setStatus = (text: string): void => {
    statusline.setContent(` ${text}`)
    screen.render()
  }

  // ── Router + initial mount ──
  let ctxRef: AppContext | null = null
  let quitGuard: QuitGuard | null = null
  const setQuitGuard = (guard: QuitGuard | null) => {
    quitGuard = guard
  }
  const router = makeRouter(() => {
    if (!ctxRef) throw new Error("app context accessed before init")
    return ctxRef
  })

  ctxRef = { screen, body, router, setStatus, crevDir, setQuitGuard }
  router.navigate(opts.initialRoute ?? { kind: "home" })

  return new Promise<void>((resolve) => {
    const quit = (): void => {
      screen.destroy()
      resolve()
    }

    const attemptQuit = (): void => {
      const message = quitGuard?.()
      if (!message) {
        quit()
        return
      }
      confirmQuit(screen, message).then((confirmed) => {
        if (confirmed) {
          setQuitGuard(null)
          quit()
        }
      })
    }

    // Global keybindings — views can still override locally.
    screen.key(["q", "C-c"], () => attemptQuit())
    screen.key(["escape", "backspace"], () => {
      if (router.current().kind === "home") {
        attemptQuit()
      } else {
        router.back()
      }
    })
  })
}

function confirmQuit(screen: blessed.Widgets.Screen, message: string): Promise<boolean> {
  return new Promise<boolean>((resolve) => {
    const modal = blessed.box({
      parent: screen,
      top: "center",
      left: "center",
      width: "60%",
      height: 7,
      tags: true,
      border: "line",
      label: " Quit? ",
      padding: { left: 2, right: 2, top: 1, bottom: 1 },
      style: { border: { fg: "yellow" } },
      content: `${message}\n\n{gray-fg}[y] quit · [n] cancel{/gray-fg}`,
    })
    modal.focus()
    screen.render()

    const close = (confirmed: boolean) => {
      modal.destroy()
      screen.render()
      resolve(confirmed)
    }
    modal.key(["y", "Y"], () => close(true))
    modal.key(["n", "N", "escape"], () => close(false))
  })
}

function dim(text: string): string {
  return `{${DASH_COLORS.muted}-fg}${text}{/${DASH_COLORS.muted}-fg}`
}
