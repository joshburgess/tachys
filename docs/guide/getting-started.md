# Getting Started

## Installation

```bash
npm install tachys
```

## Quick Start

Tachys provides a `render` function to mount your app into the DOM:

```tsx
import { render } from "tachys"

function App() {
  return <h1>Hello, Tachys!</h1>
}

render(<App />, document.getElementById("app")!)
```

## Using the Classic `h()` Pragma

If you prefer the hyperscript style:

```ts
import { h, render } from "tachys"

function App() {
  return h("h1", null, "Hello, Tachys!")
}

render(h(App, null), document.getElementById("app")!)
```

## What's Next?

- [JSX Setup](/guide/jsx-setup) - Configure your bundler for JSX
- [Components](/guide/components) - Learn about functional components
- [Hooks](/guide/hooks) - State, effects, and more
