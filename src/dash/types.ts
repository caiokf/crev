import type * as blessed from "blessed"

/**
 * A dash view owns a root blessed element and gets mounted into the
 * screen's body region. When the router swaps views it calls
 * `unmount()` on the outgoing view so it can detach listeners,
 * release timers, and remove its elements from the screen.
 *
 * Views receive an `AppContext` with the blessed screen + router so
 * they can navigate (e.g. from "schemas list" into "schema detail")
 * without threading refs through their own constructor args.
 */

export type DashRoute =
  | { readonly kind: "home" }
  | { readonly kind: "schemas" }
  | { readonly kind: "schema-detail"; readonly name: string }
  | { readonly kind: "runs" }
  | { readonly kind: "run-detail"; readonly filePath: string }
  | { readonly kind: "issue-detail"; readonly filePath: string; readonly issueId: string }
  | { readonly kind: "run-wizard" }

export interface DashRouter {
  readonly navigate: (route: DashRoute) => void
  readonly back: () => void
  readonly current: () => DashRoute
  /**
   * Replace the navigation stack with `routes` and mount the last
   * entry. Used to seed a deep-linked launch (`crev dash <file>`) with
   * the intermediate views below it so `[bksp]` walks back through
   * them as if the user had navigated in manually.
   */
  readonly reset: (routes: readonly DashRoute[]) => void
}

export interface AppContext {
  readonly screen: blessed.Widgets.Screen
  readonly body: blessed.Widgets.BoxElement
  readonly router: DashRouter
  readonly setStatus: (text: string) => void
  readonly crevDir: string
  /**
   * Install/remove a guard that short-circuits the global quit
   * behavior. Called by long-running views (e.g. the wizard while a
   * review is executing) to prompt the user before discarding
   * in-flight work.
   */
  readonly setQuitGuard: (guard: QuitGuard | null) => void
}

/** A guard returns the message to confirm, or null/undefined to allow quit. */
export type QuitGuard = () => string | null | undefined

export interface DashView {
  readonly route: DashRoute
  readonly mount: (ctx: AppContext) => void
  readonly unmount: () => void
}

export type DashViewFactory = (route: DashRoute) => DashView
