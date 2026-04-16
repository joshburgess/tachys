# SSR API

Import from `phasm/server`.

## renderToString

```ts
function renderToString(vnode: VNode): string
```

Renders a VNode tree to an HTML string. Hooks work during the render (effects are collected but not executed). Resets the `useId` counter before each call to ensure deterministic IDs.

## renderToReadableStream

```ts
function renderToReadableStream(vnode: VNode): ReadableStream<string>
```

Renders a VNode tree to a Web `ReadableStream` for chunked HTTP streaming. Compatible with Node 18+, Deno, Bun, and Cloudflare Workers.

## hydrate

```ts
function hydrate(vnode: VNode, container: Element): void
```

Hydrates server-rendered HTML on the client. Walks existing DOM nodes and attaches event listeners, refs, and component instances without recreating elements. After hydration, further updates use the normal diff/patch path.

::: warning
The client-rendered tree must match the server-rendered HTML. Mismatches may cause hydration errors or visual glitches.
:::
