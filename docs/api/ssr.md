# SSR API

Import from `phasm/server`.

## renderToString

```ts
function renderToString(vnode: VNode): string
```

Synchronous render to an HTML string. Hooks work during the render (effects are collected but not executed). Resets the `useId` counter before each call to ensure deterministic IDs.

Suspense boundaries render their fallback content since lazy components are not awaited.

## renderToStringAsync

```ts
function renderToStringAsync(vnode: VNode): Promise<string>
```

Async render that waits for all Suspense boundaries to resolve before returning the complete HTML string. Useful when you want the full page content including lazy-loaded components.

```ts
const html = await renderToStringAsync(h(App, null))
```

## renderToReadableStream

```ts
function renderToReadableStream(vnode: VNode): ReadableStream<string>
```

Renders a VNode tree to a Web `ReadableStream` for chunked HTTP streaming. Compatible with Node 18+, Deno, Bun, and Cloudflare Workers.

The streaming protocol:

1. Fallback content is sent immediately inside `<span id="ph:N">` placeholder elements
2. When a Suspense boundary resolves, the resolved content is sent in a `<div hidden id="phr:N">` element along with an inline `<script>` that swaps the placeholder with the resolved content
3. On the client, hydration cleans up any remaining streaming artifacts

This enables fast time-to-first-byte while Suspense boundaries resolve in the background.

## hydrate

```ts
function hydrate(vnode: VNode, container: Element): void
```

Hydrates server-rendered HTML on the client. Walks existing DOM nodes and attaches event listeners, refs, and component instances without recreating elements. After hydration, further updates use the normal diff/patch path.

Hydration handles:

- **Suspense boundaries** - both streaming (with `ph:N` placeholders) and non-streaming (children rendered synchronously)
- **Streaming SSR artifact cleanup** - removes swap scripts, placeholder comments (`<!--$ph:N-->`), and hidden resolved-content divs (`<div hidden id="phr:N">`)
- **Selective hydration** - prioritizes Suspense boundaries the user interacts with (click, input, keydown, focusin) for faster time-to-interactive
- **Lazy components** - if a `lazy()` component hasn't loaded during hydration, the Suspense fallback is shown until it resolves

::: warning
The client-rendered tree must match the server-rendered HTML. Mismatches may cause hydration errors or visual glitches.
:::
