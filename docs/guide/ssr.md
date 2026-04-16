# Server-Side Rendering

Phasm supports SSR with `renderToString`, streaming with `renderToReadableStream`, and client-side hydration.

## renderToString

Render your app to an HTML string on the server:

```ts
import { renderToString } from "phasm/server"
import { App } from "./App"
import { h } from "phasm"

const html = renderToString(h(App, null))
// => '<div class="app"><h1>Hello</h1>...</div>'
```

Hooks work during SSR (effects are no-ops). `useId` generates deterministic IDs.

## renderToReadableStream

For streaming SSR (Node 18+, Deno, Bun, Cloudflare Workers):

```ts
import { renderToReadableStream } from "phasm/server"

export default {
  async fetch(request: Request) {
    const stream = renderToReadableStream(h(App, null))
    return new Response(stream, {
      headers: { "Content-Type": "text/html" },
    })
  },
}
```

## Client-Side Hydration

On the client, use `hydrate` instead of `render` to attach to server-rendered HTML:

```ts
import { hydrate } from "phasm/server"
import { h } from "phasm"
import { App } from "./App"

hydrate(h(App, null), document.getElementById("app")!)
```

Hydration walks the existing DOM nodes and attaches event listeners, refs, and component state without recreating elements. After hydration, updates use the normal diff/patch path.

## Full Example

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
