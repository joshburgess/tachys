/**
 * Smoke tests for the Tachys React compatibility layer.
 *
 * Simulates how a third-party React component library would consume the compat
 * API when bundled with an alias like:
 *   { "react": "tachys/compat", "react-dom": "tachys/compat" }
 *
 * Each suite mounts into a real jsdom container and verifies the rendered HTML.
 */

import { describe, expect, it } from "vitest"
import {
  Children,
  Fragment,
  StrictMode,
  Suspense,
  cloneElement,
  createContext,
  createElement,
  createRoot,
  flushSync,
  forwardRef,
  isValidElement,
  lazy,
  memo,
  useCallback,
  useContext,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from "../../src/compat"
import { flushUpdates, h, mount } from "../../src/index"
import type { VNode } from "../../src/vnode"

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function flushMicrotasks(): Promise<void> {
  flushUpdates()
  return new Promise((resolve) => {
    setTimeout(resolve, 0)
  })
}

// ---------------------------------------------------------------------------
// createElement (aliased from h) — third-party library pattern
// ---------------------------------------------------------------------------

describe("createElement (React alias)", () => {
  it("creates a plain element and renders it", () => {
    const container = document.createElement("div")
    const vnode = createElement("p", { className: "intro" }, "Hello from compat")
    mount(vnode, container)
    expect(container.innerHTML).toBe('<p class="intro">Hello from compat</p>')
  })

  it("creates nested elements", () => {
    const container = document.createElement("div")
    const vnode = createElement(
      "ul",
      null,
      createElement("li", null, "one"),
      createElement("li", null, "two"),
    )
    mount(vnode, container)
    expect(container.innerHTML).toBe("<ul><li>one</li><li>two</li></ul>")
  })

  it("creates a fragment using null type (Fragment sentinel)", () => {
    const container = document.createElement("div")
    const vnode = createElement(
      Fragment,
      null,
      createElement("span", null, "a"),
      createElement("span", null, "b"),
    )
    mount(vnode, container)
    expect(container.innerHTML).toBe("<span>a</span><span>b</span>")
  })

  it("renders a function component", () => {
    const container = document.createElement("div")

    function Greeting(props: Record<string, unknown>) {
      return createElement("h1", null, `Hello, ${props["name"]}!`)
    }

    mount(createElement(Greeting, { name: "world" }), container)
    expect(container.innerHTML).toBe("<h1>Hello, world!</h1>")
  })
})

// ---------------------------------------------------------------------------
// Fragment
// ---------------------------------------------------------------------------

describe("Fragment", () => {
  it("is the null sentinel used by Tachys for fragments", () => {
    expect(Fragment).toBe(null)
  })

  it("renders children without a wrapper element", () => {
    const container = document.createElement("div")
    mount(h(Fragment, null, h("em", null, "A"), h("strong", null, "B")), container)
    expect(container.innerHTML).toBe("<em>A</em><strong>B</strong>")
  })
})

// ---------------------------------------------------------------------------
// memo — skip re-render for unchanged props
// ---------------------------------------------------------------------------

describe("memo", () => {
  it("renders on initial mount", () => {
    const container = document.createElement("div")

    function Badge(props: Record<string, unknown>) {
      return createElement("span", { className: "badge" }, String(props["label"]))
    }

    const MemoBadge = memo(Badge)
    mount(createElement(MemoBadge, { label: "v1" }), container)
    expect(container.innerHTML).toBe('<span class="badge">v1</span>')
  })

  it("internal state updates still trigger a re-render", () => {
    const container = document.createElement("div")
    let setVal!: (v: string) => void

    function Counter(_props: Record<string, unknown>) {
      const [val, sv] = useState("initial")
      setVal = sv
      return createElement("output", null, val)
    }

    const MemoCounter = memo(Counter)
    mount(createElement(MemoCounter, {}), container)
    expect(container.innerHTML).toBe("<output>initial</output>")

    setVal("updated")
    flushUpdates()
    expect(container.innerHTML).toBe("<output>updated</output>")
  })
})

// ---------------------------------------------------------------------------
// forwardRef + useImperativeHandle — library component pattern
// ---------------------------------------------------------------------------

describe("forwardRef + useImperativeHandle", () => {
  it("exposes an imperative handle via ref", () => {
    interface Handle {
      reset: () => void
      getValue: () => string
    }

    const ref: { current: Handle | null } = { current: null }

    const FancyInput = forwardRef((_props: Record<string, unknown>, fwdRef) => {
      useImperativeHandle(fwdRef as { current: Handle | null }, () => ({
        reset: () => {},
        getValue: () => "hello",
      }))
      return createElement("input", { type: "text" })
    })

    const container = document.createElement("div")
    mount(createElement(FancyInput, { ref }), container)

    expect(ref.current).not.toBeNull()
    expect(typeof ref.current!.reset).toBe("function")
    expect(ref.current!.getValue()).toBe("hello")
  })

  it("renders children produced by the inner render function", () => {
    const container = document.createElement("div")

    const Panel = forwardRef((props: Record<string, unknown>, _ref) => {
      return createElement(
        "section",
        { id: props["panelId"] as string },
        props["children"] as VNode,
      )
    })

    mount(
      createElement(Panel, { panelId: "main" }, createElement("p", null, "body text")),
      container,
    )
    expect(container.innerHTML).toBe('<section id="main"><p>body text</p></section>')
  })
})

// ---------------------------------------------------------------------------
// createContext + useContext — provider/consumer pattern
// ---------------------------------------------------------------------------

describe("createContext + useContext", () => {
  it("returns the default value when no Provider is present", () => {
    const ThemeCtx = createContext("light")

    function ThemedButton(_props: Record<string, unknown>) {
      const theme = useContext(ThemeCtx)
      return createElement("button", { className: theme }, "click")
    }

    const container = document.createElement("div")
    mount(createElement(ThemedButton, null), container)
    expect(container.innerHTML).toBe('<button class="light">click</button>')
  })

  it("reads the value from the nearest Provider", () => {
    const ThemeCtx = createContext("light")

    function ThemedButton(_props: Record<string, unknown>) {
      const theme = useContext(ThemeCtx)
      return createElement("button", { className: theme }, "click")
    }

    const container = document.createElement("div")
    mount(
      createElement(ThemeCtx.Provider, { value: "dark" }, createElement(ThemedButton, null)),
      container,
    )
    expect(container.innerHTML).toBe('<button class="dark">click</button>')
  })

  it("innermost Provider wins when Providers are nested", () => {
    const SizeCtx = createContext("sm")

    function SizeDisplay(_props: Record<string, unknown>) {
      const size = useContext(SizeCtx)
      return createElement("span", null, size)
    }

    const container = document.createElement("div")
    mount(
      createElement(
        SizeCtx.Provider,
        { value: "md" },
        createElement(SizeCtx.Provider, { value: "lg" }, createElement(SizeDisplay, null)),
      ),
      container,
    )
    expect(container.innerHTML).toBe("<span>lg</span>")
  })
})

// ---------------------------------------------------------------------------
// Children utilities — used by component libraries to iterate children
// ---------------------------------------------------------------------------

describe("Children utilities", () => {
  describe("Children.map", () => {
    it("maps over an array of element children", () => {
      const kids = [
        createElement("li", null, "one"),
        createElement("li", null, "two"),
        createElement("li", null, "three"),
      ]
      const result = Children.map(kids, (child) => child.type)
      expect(result).toEqual(["li", "li", "li"])
    })

    it("maps over a single element child", () => {
      const kid = createElement("span", null, "solo")
      const result = Children.map(kid, (child) => child.type)
      expect(result).toEqual(["span"])
    })

    it("returns empty array for null children", () => {
      expect(Children.map(null, () => null)).toEqual([])
    })

    it("provides index to the callback", () => {
      const kids = [createElement("a", null), createElement("b", null), createElement("c", null)]
      const indices = Children.map(kids, (_child, i) => i)
      expect(indices).toEqual([0, 1, 2])
    })
  })

  describe("Children.count", () => {
    it("counts array children", () => {
      const kids = [createElement("div", null), createElement("div", null)]
      expect(Children.count(kids)).toBe(2)
    })

    it("counts a single child as 1", () => {
      expect(Children.count(createElement("div", null))).toBe(1)
    })

    it("counts null as 0", () => {
      expect(Children.count(null)).toBe(0)
    })
  })

  describe("Children.toArray", () => {
    it("wraps a single element in an array", () => {
      const kid = createElement("p", null)
      const arr = Children.toArray(kid)
      expect(arr).toHaveLength(1)
      expect(arr[0]).toBe(kid)
    })

    it("returns a copy of array children", () => {
      const kids = [createElement("a", null), createElement("b", null)]
      const arr = Children.toArray(kids)
      expect(arr).toEqual(kids)
      expect(arr).not.toBe(kids)
    })

    it("returns empty array for null", () => {
      expect(Children.toArray(null)).toEqual([])
    })
  })
})

// ---------------------------------------------------------------------------
// cloneElement — prop-merging pattern used by many component libraries
// ---------------------------------------------------------------------------

describe("cloneElement", () => {
  it("clones with merged props", () => {
    const original = createElement("button", { type: "button", disabled: false }, "label")
    const cloned = cloneElement(original, { disabled: true })

    expect(cloned).not.toBe(original)
    expect(cloned.props!["type"]).toBe("button")
    expect(cloned.props!["disabled"]).toBe(true)
  })

  it("replaces children when provided", () => {
    const container = document.createElement("div")
    const original = createElement("article", null, "old content")
    const cloned = cloneElement(original, null, "new content")
    mount(cloned, container)
    expect(container.innerHTML).toBe("<article>new content</article>")
  })

  it("preserves original children when not replaced", () => {
    const original = createElement("nav", null, "keep this")
    const cloned = cloneElement(original, { "aria-label": "main" })
    expect(cloned.children).toBe("keep this")
  })

  it("renders the cloned element correctly", () => {
    const container = document.createElement("div")
    const base = createElement("a", { href: "#", className: "link" }, "click me")
    const cloned = cloneElement(base, { id: "primary" })
    mount(cloned, container)
    const anchor = container.querySelector("a")!
    expect(anchor.getAttribute("href")).toBe("#")
    expect(anchor.getAttribute("id")).toBe("primary")
    expect(anchor.className).toBe("link")
    expect(anchor.textContent).toBe("click me")
  })
})

// ---------------------------------------------------------------------------
// isValidElement
// ---------------------------------------------------------------------------

describe("isValidElement", () => {
  it("returns true for elements created with createElement", () => {
    expect(isValidElement(createElement("div", null))).toBe(true)
    expect(isValidElement(createElement("span", null, "text"))).toBe(true)
  })

  it("returns true for component elements", () => {
    function Comp() {
      return createElement("div", null)
    }
    expect(isValidElement(createElement(Comp, null))).toBe(true)
  })

  it("returns false for non-elements", () => {
    expect(isValidElement(null)).toBe(false)
    expect(isValidElement(undefined)).toBe(false)
    expect(isValidElement("string")).toBe(false)
    expect(isValidElement(42)).toBe(false)
    expect(isValidElement({})).toBe(false)
    expect(isValidElement({ type: "div" })).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// flushSync (aliased from flushUpdates)
// ---------------------------------------------------------------------------

describe("flushSync", () => {
  it("is exported and callable without arguments", () => {
    expect(typeof flushSync).toBe("function")
    expect(() => flushSync()).not.toThrow()
  })

  it("flushes pending state updates synchronously", () => {
    const container = document.createElement("div")
    let setValue!: (v: string) => void

    function Comp() {
      const [val, sv] = useState("before")
      setValue = sv
      return createElement("span", null, val)
    }

    mount(createElement(Comp, null), container)
    expect(container.innerHTML).toBe("<span>before</span>")

    setValue("after")
    flushSync()
    expect(container.innerHTML).toBe("<span>after</span>")
  })
})

// ---------------------------------------------------------------------------
// useState + useEffect + useCallback in a single component
// ---------------------------------------------------------------------------

describe("useState + useEffect + useCallback", () => {
  it("renders initial state correctly", () => {
    const container = document.createElement("div")

    function Counter() {
      const [count, setCount] = useState(0)
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const increment = useCallback(() => setCount((n) => n + 1), [])
      useEffect(() => {
        // no-op side effect to verify hooks compose without crashing
      }, [])
      return createElement("div", null, String(count))
    }

    mount(createElement(Counter, null), container)
    expect(container.innerHTML).toBe("<div>0</div>")
  })

  it("updates when state changes", () => {
    const container = document.createElement("div")
    let inc!: () => void

    function Counter() {
      const [count, setCount] = useState(0)
      inc = useCallback(() => setCount((n) => n + 1), [])
      return createElement("button", null, String(count))
    }

    mount(createElement(Counter, null), container)
    expect(container.innerHTML).toBe("<button>0</button>")

    inc()
    flushUpdates()
    expect(container.innerHTML).toBe("<button>1</button>")

    inc()
    flushUpdates()
    expect(container.innerHTML).toBe("<button>2</button>")
  })

  it("useRef holds a mutable value across renders", () => {
    const container = document.createElement("div")
    let trigger!: () => void

    function Comp() {
      const [tick, setTick] = useState(0)
      const renderCount = useRef(0)
      renderCount.current++
      trigger = () => setTick((t) => t + 1)
      return createElement("span", null, String(renderCount.current))
    }

    mount(createElement(Comp, null), container)
    expect(container.innerHTML).toBe("<span>1</span>")

    trigger()
    flushUpdates()
    expect(container.innerHTML).toBe("<span>2</span>")
  })
})

// ---------------------------------------------------------------------------
// Suspense + lazy — basic mounting (not async resolution)
// ---------------------------------------------------------------------------

describe("Suspense + lazy", () => {
  it("shows fallback immediately when lazy component has not resolved", () => {
    const container = document.createElement("div")

    // A loader that never resolves during this synchronous test
    const NeverResolves = lazy(
      () =>
        new Promise<{ default: () => VNode }>(() => {
          // intentionally never resolves
        }),
    )

    mount(
      createElement(
        Suspense,
        { fallback: createElement("div", null, "loading...") },
        createElement(NeverResolves, null),
      ),
      container,
    )

    expect(container.innerHTML).toBe("<div>loading...</div>")
  })

  it("renders the lazy component after its promise resolves", async () => {
    const container = document.createElement("div")

    function Loaded() {
      return createElement("p", null, "lazy loaded")
    }

    const LazyLoaded = lazy(() => Promise.resolve({ default: Loaded }))

    mount(
      createElement(
        Suspense,
        { fallback: createElement("span", null, "...") },
        createElement(LazyLoaded, null),
      ),
      container,
    )

    // Fallback is shown while promise is pending
    expect(container.innerHTML).toBe("<span>...</span>")

    // Resolve the microtask queue
    await flushMicrotasks()
    flushUpdates()
    await flushMicrotasks()
    flushUpdates()

    expect(container.innerHTML).toBe("<p>lazy loaded</p>")
  })
})

// ---------------------------------------------------------------------------
// createRoot API — create / render / unmount lifecycle
// ---------------------------------------------------------------------------

describe("createRoot", () => {
  it("renders a component tree into the container", () => {
    const container = document.createElement("div")
    const root = createRoot(container)

    root.render(createElement("main", null, "root content"))
    expect(container.innerHTML).toBe("<main>root content</main>")
  })

  it("re-renders when root.render is called again", () => {
    const container = document.createElement("div")
    const root = createRoot(container)

    root.render(createElement("span", null, "v1"))
    expect(container.innerHTML).toBe("<span>v1</span>")

    root.render(createElement("span", null, "v2"))
    expect(container.innerHTML).toBe("<span>v2</span>")
  })

  it("clears the container on unmount", () => {
    const container = document.createElement("div")
    const root = createRoot(container)

    root.render(createElement("div", null, "bye"))
    expect(container.innerHTML).toBe("<div>bye</div>")

    root.unmount()
    expect(container.innerHTML).toBe("")
  })

  it("can mount a stateful component", () => {
    const container = document.createElement("div")
    const root = createRoot(container)
    let toggle!: () => void

    function Toggle() {
      const [on, setOn] = useState(false)
      toggle = () => setOn((v) => !v)
      return createElement("div", null, on ? "on" : "off")
    }

    root.render(createElement(Toggle, null))
    expect(container.innerHTML).toBe("<div>off</div>")

    toggle()
    flushUpdates()
    expect(container.innerHTML).toBe("<div>on</div>")
  })
})

// ---------------------------------------------------------------------------
// StrictMode — passthrough wrapper
// ---------------------------------------------------------------------------

describe("StrictMode", () => {
  it("renders its single child unchanged", () => {
    const container = document.createElement("div")
    mount(
      createElement(StrictMode, null, createElement("aside", null, "strict content")),
      container,
    )
    expect(container.innerHTML).toBe("<aside>strict content</aside>")
  })

  it("can wrap a component tree via a fragment", () => {
    const container = document.createElement("div")
    mount(
      createElement(
        StrictMode,
        null,
        createElement(
          Fragment,
          null,
          createElement("header", null, "top"),
          createElement("footer", null, "bottom"),
        ),
      ),
      container,
    )
    expect(container.innerHTML).toBe("<header>top</header><footer>bottom</footer>")
  })

  it("can wrap a stateful component without interfering with state", () => {
    const container = document.createElement("div")
    let setVal!: (v: number) => void

    function Ticker() {
      const [n, sn] = useState(0)
      setVal = sn
      return createElement("span", null, String(n))
    }

    mount(createElement(StrictMode, null, createElement(Ticker, null)), container)
    expect(container.innerHTML).toBe("<span>0</span>")

    setVal(7)
    flushUpdates()
    expect(container.innerHTML).toBe("<span>7</span>")
  })
})
