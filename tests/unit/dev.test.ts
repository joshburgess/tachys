import { beforeEach, describe, expect, it, vi } from "vitest"
import { __DEV__, getComponentName, resetWarnings, warn, warnOnce } from "../../src/dev"

describe("__DEV__", () => {
  it("is true in test environment", () => {
    expect(__DEV__).toBe(true)
  })
})

describe("getComponentName", () => {
  it("returns function name for named functions", () => {
    function MyComponent() {}
    expect(getComponentName(MyComponent)).toBe("MyComponent")
  })

  it("returns displayName when set", () => {
    function Comp() {}
    ;(Comp as unknown as { displayName: string }).displayName = "CustomName"
    expect(getComponentName(Comp)).toBe("CustomName")
  })

  it("prefers displayName over function name", () => {
    function OriginalName() {}
    ;(OriginalName as unknown as { displayName: string }).displayName = "DisplayName"
    expect(getComponentName(OriginalName)).toBe("DisplayName")
  })

  it("returns 'Anonymous' for anonymous arrow functions", () => {
    const fn = (() => {
      const f = () => {}
      Object.defineProperty(f, "name", { value: "" })
      return f
    })()
    expect(getComponentName(fn)).toBe("Anonymous")
  })

  it("returns 'Anonymous' for null", () => {
    expect(getComponentName(null)).toBe("Anonymous")
  })

  it("returns 'Anonymous' for undefined", () => {
    expect(getComponentName(undefined)).toBe("Anonymous")
  })

  it("returns string type as-is", () => {
    expect(getComponentName("div")).toBe("div")
  })

  it("unwraps memo _inner", () => {
    function Inner() {}
    const memoized = Object.assign(() => {}, { _inner: Inner })
    expect(getComponentName(memoized)).toBe("Inner")
  })

  it("unwraps nested memo _inner", () => {
    function Deep() {}
    const inner = Object.assign(() => {}, { _inner: Deep })
    const outer = Object.assign(() => {}, { _inner: inner })
    expect(getComponentName(outer)).toBe("Deep")
  })
})

describe("warn", () => {
  it("emits a prefixed console warning", () => {
    const spy = vi.spyOn(console, "warn").mockImplementation(() => {})
    warn("test message")
    expect(spy).toHaveBeenCalledWith("[Tachys] test message")
    spy.mockRestore()
  })

  it("emits every time (no deduplication)", () => {
    const spy = vi.spyOn(console, "warn").mockImplementation(() => {})
    warn("repeated")
    warn("repeated")
    warn("repeated")
    expect(spy).toHaveBeenCalledTimes(3)
    spy.mockRestore()
  })
})

describe("warnOnce", () => {
  beforeEach(() => {
    resetWarnings()
  })

  it("emits a prefixed console warning", () => {
    const spy = vi.spyOn(console, "warn").mockImplementation(() => {})
    warnOnce("unique message")
    expect(spy).toHaveBeenCalledWith("[Tachys] unique message")
    spy.mockRestore()
  })

  it("deduplicates identical messages", () => {
    const spy = vi.spyOn(console, "warn").mockImplementation(() => {})
    warnOnce("same message")
    warnOnce("same message")
    warnOnce("same message")
    expect(spy).toHaveBeenCalledTimes(1)
    spy.mockRestore()
  })

  it("allows different messages", () => {
    const spy = vi.spyOn(console, "warn").mockImplementation(() => {})
    warnOnce("message A")
    warnOnce("message B")
    expect(spy).toHaveBeenCalledTimes(2)
    spy.mockRestore()
  })
})

describe("resetWarnings", () => {
  it("clears the deduplication set", () => {
    const spy = vi.spyOn(console, "warn").mockImplementation(() => {})
    warnOnce("dedup test")
    warnOnce("dedup test")
    expect(spy).toHaveBeenCalledTimes(1)

    resetWarnings()
    warnOnce("dedup test")
    expect(spy).toHaveBeenCalledTimes(2)
    spy.mockRestore()
  })
})
