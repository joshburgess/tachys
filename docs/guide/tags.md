# Tag Helpers

Tachys ships a set of typed tag-name functions for building VNodes without JSX or raw `h()` calls.

```ts
import { div, span, button, h1 } from "tachys/tags"

div({ className: "row" },
  h1(null, "Hello"),
  span(null, "label: "),
  button({ onClick: onSave }, "Save"))
```

Every HTML and SVG tag is exported as its own function, so tree-shaking strips the ones you don't use.

## Call signatures

Each helper accepts either a props object followed by children, or just children:

```ts
// props + children
div({ className: "box" }, "hello")

// children only
div("hello")
div(span(null, "nested"), "more")

// no args
div()
```

The first argument is treated as **props** only when it is a plain object that is not a VNode. Strings, numbers, VNodes, `null`, and `undefined` are all treated as children. Passing `null` explicitly as the first argument (hyperscript style) is equivalent to passing no props.

## Typed per element

Props are derived from `JSX.IntrinsicElements`, so each helper is typed for its specific element:

```ts
input({ type: "text", value: name, disabled: false })
// ^ autocompletes input attributes, rejects invalid ones

a({ href: "/home", target: "_blank" }, "home")

button({ onClick: (e) => e.preventDefault() }, "click")
```

## Reserved identifiers

A handful of tag names collide with JavaScript reserved identifiers or Tachys exports. They are suffixed or renamed:

| Tag | Exported as | Reason |
|---|---|---|
| `<var>` | `var_` | `var` is a JS keyword |
| `<switch>` (SVG) | `switch_` | `switch` is a JS keyword |
| `<use>` (SVG) | `useEl` | avoids collision with the React `use()` hook |

```ts
import { var_, switch_, useEl } from "tachys/tags"

var_(null, "x")
svg(null, switch_(null, /* children */))
svg(null, useEl({ href: "#icon" }))
```

## When to use

`tachys/tags` is most useful when:

- you don't want to set up a JSX compiler
- you're embedded in an environment without JSX (plain JS, REPL, scripting)
- you prefer a terse, expression-oriented DSL (works well with FP patterns)

For component-heavy codebases with a build step, JSX is usually more ergonomic.

## Mixing with components

Tag helpers produce regular VNodes, so they compose freely with components, Fragments, and `h()`:

```ts
import { createContext, h } from "tachys"
import { div, span } from "tachys/tags"

function Row({ children }) {
  return div({ className: "row" }, children)
}

// Call as a function:
Row({ children: [span(null, "a"), span(null, "b")] })

// Or via h():
h(Row, null, span(null, "a"), span(null, "b"))
```
