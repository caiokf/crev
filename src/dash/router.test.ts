import { describe, expect, it, vi } from "vitest"
import { makeRouter } from "./router.js"
import type { AppContext, DashRoute, DashView } from "./types.js"

function makeStubView(route: DashRoute): DashView & { mount: ReturnType<typeof vi.fn>; unmount: ReturnType<typeof vi.fn> } {
  return {
    route,
    mount: vi.fn(),
    unmount: vi.fn(),
  }
}

function makeStubCtx(): AppContext {
  return {
    screen: {} as AppContext["screen"],
    body: {} as AppContext["body"],
    router: {} as AppContext["router"],
    setStatus: vi.fn(),
    crevDir: "/tmp/.crev",
    setQuitGuard: vi.fn(),
  }
}

describe("makeRouter", () => {
  it("mounts the initial view and reports it as current", () => {
    const home = makeStubView({ kind: "home" })
    const router = makeRouter(() => makeStubCtx(), () => home)

    router.navigate({ kind: "home" })

    expect(home.mount).toHaveBeenCalledTimes(1)
    expect(router.current()).toEqual({ kind: "home" })
  })

  it("unmounts the outgoing view before mounting the next one", () => {
    const views: DashView[] = []
    const router = makeRouter(
      () => makeStubCtx(),
      (route) => {
        const v = makeStubView(route)
        views.push(v)
        return v
      },
    )

    router.navigate({ kind: "home" })
    router.navigate({ kind: "schemas" })

    expect(views[0]!.unmount).toHaveBeenCalledTimes(1)
    expect(views[1]!.mount).toHaveBeenCalledTimes(1)
    expect(router.current()).toEqual({ kind: "schemas" })
  })

  it("back() pops the stack and re-mounts the previous route", () => {
    const router = makeRouter(() => makeStubCtx(), (route) => makeStubView(route))

    router.navigate({ kind: "home" })
    router.navigate({ kind: "schemas" })
    router.navigate({ kind: "schema-detail", name: "quick" })

    router.back()
    expect(router.current()).toEqual({ kind: "schemas" })

    router.back()
    expect(router.current()).toEqual({ kind: "home" })
  })

  it("back() is a no-op at the root of the stack", () => {
    const router = makeRouter(() => makeStubCtx(), (route) => makeStubView(route))
    router.navigate({ kind: "home" })
    router.back()
    router.back()
    expect(router.current()).toEqual({ kind: "home" })
  })
})
