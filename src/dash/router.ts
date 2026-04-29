import { createDoctorView } from "./views/doctor.js"
import { createHomeView } from "./views/home.js"
import { createIssueDetailView } from "./views/issue-detail.js"
import { createRunDetailView } from "./views/run-detail.js"
import { createRunWizardView } from "./views/run-wizard.js"
import { createRunsListView } from "./views/runs-list.js"
import { createSchemaDetailView } from "./views/schema-detail.js"
import { createSchemasListView } from "./views/schemas-list.js"
import type { AppContext, DashRoute, DashRouter, DashView } from "./types.js"

/**
 * Build the dash router. Owns the view stack, mounting the active
 * view into the shell's body and calling `unmount()` on the outgoing
 * view so blessed elements + listeners are released cleanly.
 *
 * `resolveView` is injected so tests can exercise the stack/navigation
 * logic without pulling in blessed. The default resolver wires in the
 * real view factories.
 */

export type ViewResolver = (route: DashRoute) => DashView

export function makeRouter(
  ctx: () => AppContext,
  resolveView: ViewResolver = defaultResolver,
): DashRouter {
  const stack: DashRoute[] = []
  let active: DashView | null = null

  const mount = (route: DashRoute): void => {
    const next = resolveView(route)
    active?.unmount()
    active = next
    active.mount(ctx())
  }

  return {
    navigate(route) {
      stack.push(route)
      mount(route)
    },
    back() {
      if (stack.length <= 1) return
      stack.pop()
      const prev = stack[stack.length - 1]!
      mount(prev)
    },
    current() {
      return stack[stack.length - 1] ?? { kind: "home" }
    },
    reset(routes) {
      if (routes.length === 0) throw new Error("router.reset requires at least one route")
      stack.length = 0
      for (const r of routes) stack.push(r)
      mount(stack[stack.length - 1]!)
    },
  }
}

export const defaultResolver: ViewResolver = (route) => {
  switch (route.kind) {
    case "home":
      return createHomeView()
    case "schemas":
      return createSchemasListView()
    case "schema-detail":
      return createSchemaDetailView(route.name)
    case "runs":
      return createRunsListView()
    case "run-detail":
      return createRunDetailView(route.filePath)
    case "issue-detail":
      return createIssueDetailView(route.filePath, route.issueId)
    case "run-wizard":
      return createRunWizardView(route.schema)
    case "doctor":
      return createDoctorView()
  }
}
