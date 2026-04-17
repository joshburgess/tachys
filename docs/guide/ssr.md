# Server-Side Rendering

Phasm supports SSR with `renderToString`, async rendering with `renderToStringAsync`, streaming with `renderToReadableStream`, and Suspense-aware client-side hydration.

All SSR functions are imported from `phasm/server`:

```ts
import { renderToString, renderToStringAsync, renderToReadableStream, hydrate } from "phasm/server"
```

## renderToString

Synchronous render to an HTML string:

```ts
import { renderToString } from "phasm/server"
import { h } from "phasm"

const html = renderToString(h(App, null))
```

Hooks work during SSR (effects are no-ops). `useId` generates deterministic IDs. Suspense boundaries render their fallback content since lazy components are not awaited.

## renderToStringAsync

Async render that waits for all Suspense boundaries to resolve before returning. Use this when you need the complete page content including lazy-loaded components:

```ts
import { renderToStringAsync } from "phasm/server"
import { h } from "phasm"

const html = await renderToStringAsync(h(App, null))
```

## renderToReadableStream

Streaming SSR for fast time-to-first-byte. Compatible with Node 18+, Deno, Bun, and Cloudflare Workers:

```ts
import { renderToReadableStream } from "phasm/server"
import { h } from "phasm"

export default {
  fetch() {
    const stream = renderToReadableStream(h(App, null))
    return new Response(stream, {
      headers: { "Content-Type": "text/html" },
    })
  },
}
```

### How streaming works

When a Suspense boundary is encountered during streaming:

1. The fallback content is sent immediately inside a `<span id="ph:N">` placeholder
2. Rendering continues with the rest of the page
3. When the suspended content resolves, it is sent in a `<div hidden id="phr:N">` along with an inline swap script
4. The swap script replaces the placeholder with the resolved content in the browser

This means users see the page shell immediately while async content loads in the background.

## Client-Side Hydration

On the client, use `hydrate` instead of `render` to attach to server-rendered HTML:

```ts
import { hydrate } from "phasm/server"
import { h } from "phasm"

hydrate(h(App, null), document.getElementById("app")!)
```

Hydration walks the existing DOM nodes and attaches event listeners, refs, and component state without recreating elements. After hydration, updates use the normal diff/patch path.

### Suspense-aware hydration

Hydration handles Suspense boundaries in several scenarios:

- **Non-streaming Suspense**: children rendered synchronously on the server are hydrated normally with event handlers attached
- **Streaming placeholders**: if a Suspense boundary is still showing its `ph:N` placeholder, hydration waits for the swap script to run, then hydrates the resolved content
- **Post-swap content**: if the swap script has already run by the time hydration reaches the boundary, the resolved DOM is hydrated directly
- **Lazy components**: if a `lazy()` component hasn't loaded yet during hydration, the Suspense fallback is shown until the module loads

### Selective hydration

Phasm prioritizes hydrating Suspense boundaries that the user interacts with. When a user clicks, types, or focuses inside a pending Suspense boundary, that boundary is hydrated ahead of others. This provides faster time-to-interactive for the parts of the page the user cares about.

### Streaming artifact cleanup

During hydration, Phasm automatically removes streaming SSR artifacts:
- Inline `<script>` elements (the swap function and its invocations)
- `<div hidden id="phr:N">` containers for resolved content
- `<!--$ph:N-->` comment nodes used as boundary markers

## Full Example

### Basic SSR

**server.ts**
```ts
import { renderToString } from "phasm/server"
import { h } from "phasm"
import { App } from "./App"

const appHtml = renderToString(h(App, null))

const html = `<!DOCTYPE html>
<html>
<head><title>My App</title></head>
<body>
  <div id="app">${appHtml}</div>
  <script type="module" src="/client.js"></script>
</body>
</html>`
```

**client.ts**
```ts
import { hydrate } from "phasm/server"
import { h } from "phasm"
import { App } from "./App"

hydrate(h(App, null), document.getElementById("app")!)
```

### Streaming SSR with Suspense

**App.tsx**
```tsx
import { h, Suspense, lazy } from "phasm"

const HeavyContent = lazy(() => import("./HeavyContent"))

function App() {
  return h("div", null,
    h("header", null, h("h1", null, "My App")),
    h(Suspense, { fallback: h("p", null, "Loading content...") },
      h(HeavyContent, null),
    ),
  )
}
```

**server.ts**
```ts
import { renderToReadableStream } from "phasm/server"
import { h } from "phasm"
import { App } from "./App"

export default {
  fetch() {
    const stream = renderToReadableStream(h(App, null))
    return new Response(stream, {
      headers: { "Content-Type": "text/html" },
    })
  },
}
```

The user sees the header and "Loading content..." immediately. When `HeavyContent` resolves, the placeholder is swapped for the real content without a full page reload.
