import { describe, expect, it } from "vitest"
import { createContext, flushUpdates, h, mount, patch, useContext, useState } from "../../src/index"
import type { VNode } from "../../src/vnode"

function flushMicrotasks(): Promise<void> {
  flushUpdates()
  return new Promise((resolve) => {
    setTimeout(resolve, 0)
  })
}

describe("Context API", () => {
  let container: HTMLDivElement

  function setup(): HTMLDivElement {
    return document.createElement("div")
  }

  it("should return default value when no Provider", () => {
    container = setup()
    const ThemeCtx = createContext("light")

    function Consumer() {
      const theme = useContext(ThemeCtx)
      return h("span", null, theme)
    }

    mount(h(Consumer, null), container)
    expect(container.innerHTML).toBe("<span>light</span>")
  })

  it("should read value from Provider", () => {
    container = setup()
    const ThemeCtx = createContext("light")

    function Consumer() {
      const theme = useContext(ThemeCtx)
      return h("span", null, theme)
    }

    const tree = h(ThemeCtx.Provider, { value: "dark" }, h(Consumer, null))
    mount(tree, container)
    expect(container.innerHTML).toBe("<span>dark</span>")
  })

  it("should support nested Providers (innermost wins)", () => {
    container = setup()
    const Ctx = createContext("default")

    function Consumer() {
      const val = useContext(Ctx)
      return h("span", null, val)
    }

    const tree = h(
      Ctx.Provider,
      { value: "outer" },
      h(Ctx.Provider, { value: "inner" }, h(Consumer, null)),
    )
    mount(tree, container)
    expect(container.innerHTML).toBe("<span>inner</span>")
  })

  it("should not leak context to siblings outside Provider", () => {
    container = setup()
    const Ctx = createContext("default")

    function Consumer() {
      const val = useContext(Ctx)
      return h("span", null, val)
    }

    // Fragment with Provider then bare Consumer
    const tree = h(
      null,
      null,
      h(Ctx.Provider, { value: "provided" }, h(Consumer, null)),
      h(Consumer, null),
    )
    mount(tree, container)

    const spans = container.querySelectorAll("span")
    expect(spans[0]!.textContent).toBe("provided")
    expect(spans[1]!.textContent).toBe("default")
  })

  it("should update when Provider value changes via patch", () => {
    container = setup()
    const Ctx = createContext("default")

    function Consumer() {
      const val = useContext(Ctx)
      return h("span", null, val)
    }

    const old = h(Ctx.Provider, { value: "v1" }, h(Consumer, null))
    mount(old, container)
    expect(container.innerHTML).toBe("<span>v1</span>")

    const next = h(Ctx.Provider, { value: "v2" }, h(Consumer, null))
    patch(old, next, container)
    expect(container.innerHTML).toBe("<span>v2</span>")
  })

  it("should work with multiple different contexts", () => {
    container = setup()
    const ThemeCtx = createContext("light")
    const LangCtx = createContext("en")

    function Consumer() {
      const theme = useContext(ThemeCtx)
      const lang = useContext(LangCtx)
      return h("span", null, `${theme}-${lang}`)
    }

    const tree = h(
      ThemeCtx.Provider,
      { value: "dark" },
      h(LangCtx.Provider, { value: "fr" }, h(Consumer, null)),
    )
    mount(tree, container)
    expect(container.innerHTML).toBe("<span>dark-fr</span>")
  })

  it("should work with non-string context values", () => {
    container = setup()
    const Ctx = createContext({ count: 0 })

    function Consumer() {
      const val = useContext(Ctx)
      return h("span", null, String(val.count))
    }

    const tree = h(Ctx.Provider, { value: { count: 42 } }, h(Consumer, null))
    mount(tree, container)
    expect(container.innerHTML).toBe("<span>42</span>")
  })
})

describe("deeply nested consumer", () => {
  it("should read the Provider value 5 levels down through intermediate elements", () => {
    const container = document.createElement("div")
    const Ctx = createContext("root")

    function DeepConsumer() {
      const val = useContext(Ctx)
      return h("span", null, val)
    }

    // Provider -> div -> div -> div -> div -> div -> DeepConsumer
    const tree = h(
      Ctx.Provider,
      { value: "deep-value" },
      h(
        "div",
        null,
        h("div", null, h("div", null, h("div", null, h("div", null, h(DeepConsumer, null))))),
      ),
    )
    mount(tree, container)
    expect(container.querySelector("span")!.textContent).toBe("deep-value")
  })
})

describe("duplicate useContext calls", () => {
  it("should not crash and return the correct value when calling useContext with the same context twice", () => {
    const container = document.createElement("div")
    const Ctx = createContext("default")

    function Consumer() {
      const val1 = useContext(Ctx)
      const val2 = useContext(Ctx)
      return h("span", null, `${val1}-${val2}`)
    }

    const tree = h(Ctx.Provider, { value: "shared" }, h(Consumer, null))
    mount(tree, container)
    expect(container.innerHTML).toBe("<span>shared-shared</span>")
  })
})

describe("Context.Consumer render-prop", () => {
  it("should read the default value", () => {
    const container = document.createElement("div")
    const Ctx = createContext("default-val")

    const tree = h(Ctx.Consumer, null, (value: string) => h("span", null, value))
    mount(tree, container)
    expect(container.innerHTML).toBe("<span>default-val</span>")
  })

  it("should read from a Provider", () => {
    const container = document.createElement("div")
    const Ctx = createContext("default")

    const tree = h(
      Ctx.Provider,
      { value: "provided" },
      h(Ctx.Consumer, null, (value: string) => h("span", null, value)),
    )
    mount(tree, container)
    expect(container.innerHTML).toBe("<span>provided</span>")
  })

  it("should update when Provider value changes", () => {
    const container = document.createElement("div")
    const Ctx = createContext("default")

    const renderFn = (value: string) => h("span", null, value)

    const old = h(Ctx.Provider, { value: "v1" }, h(Ctx.Consumer, null, renderFn))
    mount(old, container)
    expect(container.innerHTML).toBe("<span>v1</span>")

    const next = h(Ctx.Provider, { value: "v2" }, h(Ctx.Consumer, null, renderFn))
    patch(old, next, container)
    expect(container.innerHTML).toBe("<span>v2</span>")
  })

  it("should work with nested Providers (innermost wins)", () => {
    const container = document.createElement("div")
    const Ctx = createContext("default")

    const tree = h(
      Ctx.Provider,
      { value: "outer" },
      h(
        Ctx.Provider,
        { value: "inner" },
        h(Ctx.Consumer, null, (value: string) => h("span", null, value)),
      ),
    )
    mount(tree, container)
    expect(container.innerHTML).toBe("<span>inner</span>")
  })
})

describe("context with reference type default", () => {
  it("should return the same object reference for the default value across multiple consumers without a Provider", () => {
    const defaultValue = {}
    const Ctx = createContext(defaultValue)

    let ref1: unknown
    let ref2: unknown

    function ConsumerA() {
      ref1 = useContext(Ctx)
      return h("span", null, "a")
    }

    function ConsumerB() {
      ref2 = useContext(Ctx)
      return h("span", null, "b")
    }

    const container = document.createElement("div")
    mount(h("div", null, h(ConsumerA, null), h(ConsumerB, null)), container)

    // Both consumers should receive the exact same object reference
    expect(ref1).toBe(defaultValue)
    expect(ref2).toBe(defaultValue)
    expect(ref1).toBe(ref2)
  })
})
