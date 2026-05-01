# Tachys Architecture

Reference for the current implementation. Describes the major subsystems and the invariants they rely on.

## Design goals

1. **Match or exceed Inferno on reconciliation speed.** Inferno is the fastest VDOM library on `js-framework-benchmark`. Tachys targets the same operations.
2. **Stay monomorphic.** Every hot-path function receives the same object shape at every call site so V8 can install inline caches and inline the callee.
3. **Ship a React-compatible API.** Hooks, Suspense, lazy, Error boundaries, concurrent rendering, SSR, hydration.
4. **Bundle small.** ~36KB min / ~11KB gzip for the core runtime. Zero dependencies. Lean entry points (`tachys/sync`, `tachys/sync-core`) drop the concurrent scheduler and Suspense/lazy/ErrorBoundary/Portal for apps that don't need them.

## Source layout

```
src/
  vnode.ts            VNode class + type guards
  flags.ts            Bitwise VNodeFlags / ChildFlags
  jsx.ts              h() factory (children normalization, childFlags inference)
  jsx-runtime.ts      Automatic JSX transform (jsx, jsxs, Fragment)
  pool.ts             VNode free list
  render-state.ts     Shared R = { collecting, activeLane, pending }
  mount.ts            Initial mount (VNode → DOM)
  unmount.ts          Teardown
  patch.ts            Prop diffing, event wiring
  diff.ts             Core reconciliation (element, component, fragment, text)
  events.ts           Root-level event delegation
  scheduler.ts        Lane-aware scheduler, time slicing, two-phase commit
  work-loop.ts        shouldYield / time slice
  effects.ts          DOM effect queue for Transition commit
  component.ts        Hooks, component lifecycle, re-render loop
  context.ts          createContext / useContext
  ref.ts              createRef + ref plumbing
  memo.ts             memo()
  forward-ref.ts      forwardRef()
  portal.ts           createPortal()
  error-boundary.ts   ErrorBoundary
  suspense.ts         Suspense + lazy
  hydrate.ts          Client hydration (used by tachys/server)
  server.ts           SSR entry (renderToString + streaming)
  compat.ts           React API surface
  reconcile-bridge.ts Cycle-breaking bridge for mount/unmount/patch
  index.ts            Public exports
```

## VNode

```ts
class VNode {
  flags: VNodeFlag              // Text | Element | Component | Fragment (+ Svg | Void)
  type: string | ComponentFn | null
  key: string | number | null
  props: Record<string, unknown> | null
  children: VNode[] | VNode | string | null
  dom: Element | Text | null
  childFlags: ChildFlag          // HasKeyedChildren | HasNonKeyedChildren | HasTextChildren | HasSingleChild | NoChildren
  parentDom: Element | null
  className: string | null       // hoisted out of props for direct assignment
}
```

Exactly 9 properties, always initialized in the same order, never deleted. This pins a single hidden class across every VNode instance in the process, which keeps every property load on the diff hot path monomorphic.

`className` is hoisted out of `props` at creation time. Mount applies it with `dom.className = vnode.className` instead of going through the generic `patchProp` loop.

`childFlags` is computed once in `h()`. The diff never re-inspects the children array to determine its shape.

All flag values are SMI-safe (< 2^30). Bitwise tests (`flags & VNodeFlags.Element`) compile to integer compares on V8's optimized integer path.

## h() factory

```ts
h(type, props, ...children) → VNode
```

Responsibilities at creation time, not at diff time:

- Flatten nested arrays of children.
- Convert primitive children (string, number) to text VNodes.
- Drop `null`, `undefined`, `false`, `true` children.
- Determine `childFlags` from the normalized children.
- Extract `className` from `props` into the top-level field.
- Allocate from the VNode pool when possible.

This front-loads all the work that would otherwise re-execute every time the differ encountered this VNode.

## Object pooling

VNodes are recycled through a module-level free list (`pool.ts`). Unmount resets every field to its initial type (null / 0) and pushes the instance back. This keeps the hidden class identical to a freshly-allocated VNode.

The pool is guarded by `R.collecting`: Transition-lane renders never release VNodes to the pool because an abandoned render would corrupt the shared pool state. Sync and Default renders release freely.

## Mount

`mount.ts` translates a VNode tree into DOM. It dispatches on `flags`:

- `VNodeFlags.Element` → `mountElement` creates the DOM node, sets `className`, mounts children off-DOM, appends to parent, then applies remaining props (events, attributes, refs).
- `VNodeFlags.Text` → creates a text node.
- `VNodeFlags.Component` → calls the component function, mounts the result.
- `VNodeFlags.Fragment` → mounts children directly into the parent.

Children dispatch (`mountInternal`) is inlined at every element call site (not a general helper) to keep the call site monomorphic.

SVG propagates through an `isSvg` boolean. `foreignObject` resets it back to HTML.

## Diff

`diff.ts` is the reconciliation core. `patch(old, new, parentDom)`:

1. `old === new` → referential equality bail-out.
2. `old.flags !== new.flags || old.type !== new.type` → unmount + mount.
3. Dispatch to `patchElement`, `patchComponent`, `patchFragment`, or `patchText`.

Element props diff: iterate old props to remove stale keys, iterate new props to add/update changed keys. Common props (`className`, `style`, event handlers) take the fast path; unknown attributes fall through to `setAttribute`.

Children diff is routed through `childFlags` combinations. The Array × Array case splits on keyed vs non-keyed.

### Keyed children (LIS)

Inferno-style:

1. Walk from both ends, patching matching keys in place.
2. If either list is exhausted, mount or unmount the remainder.
3. Build a `key → new index` map for the middle section.
4. Mark moved/removed nodes. Compute the longest increasing subsequence of target indices.
5. Move only nodes not on the LIS (minimum DOM moves).

Small lists (< 32 items) take a bitmask fast path that avoids the Map + LIS entirely.

The LIS working arrays are module-level and reused. Nothing is allocated inside the diff loop.

### Non-keyed children

Pairwise patch by index. Mount excess or unmount excess. Separate code path so the call site stays monomorphic.

## Event delegation

One root-level listener per event type. Handlers are stored directly on DOM nodes under fixed-name properties (`__tachys_click`, etc.). On dispatch, the event walks up `target.parentNode` and invokes the first handler it finds.

Fixed property names avoid dynamic key lookups (which go megamorphic). Non-bubbling events (`focus`, `blur`, media events) bypass delegation and use direct `addEventListener`.

## Scheduler

Three lanes plus an idle sentinel:

| Lane | Value | Use |
|---|---|---|
| `Lane.Sync` | 0 | `useSyncExternalStore`, tearing-sensitive updates |
| `Lane.Default` | 1 | `useState`, `useReducer` |
| `Lane.Transition` | 2 | `startTransition`, `useTransition`, `useDeferredValue` |
| `Lane.Idle` | -1 | Sentinel for "no lane active" |

Components use a per-lane bitmask (`_queuedLanes`) so the same component can be queued in multiple lanes simultaneously. This is what makes transitions work: a component has both a Default-lane update (`isPending = true`) and a Transition-lane update (the deferred work) outstanding at the same time.

`processAllLanes` splits into two loops:

- **Sync + Default loop.** No yielding, no `R.pending` checks. Drains immediately.
- **Transition loop.** Honors time slicing, checks `R.pending` for continuations, supports abandonment.

When a flush contains both urgent and Transition work, the Transition render is deferred to a separate frame. This creates a paint boundary so users see the urgent update before the deferred work renders.

### Two-phase commit (Transition only)

Transition renders separate VNode diffing from DOM mutation:

1. **Render phase.** The work loop sets `R.collecting = true`. `mount`, `unmount`, and `diff` push DOM operations onto a typed effect queue (`pushAppend`, `pushInsert`, `pushRemove`, `pushThunk`) instead of calling `appendChild` / `removeChild` / `insertBefore` directly. Property writes (className, text content, innerHTML) are also queued as thunks.
2. **Commit phase.** When the render completes successfully, `commitEffects()` replays the queue atomically. The DOM sees one coherent update.

If a higher-priority update arrives mid-Transition, `discardEffects()` drops the queue without touching the DOM. The hook state snapshots taken at the start of the Transition render are restored so the next render sees the pre-Transition state. Ref callback side effects are rolled back the same way.

If a component throws a promise during a Transition (e.g. from `use(promise)` or a `lazy()` load), the scheduler signals suspension. The queue is discarded and the Transition is re-scheduled to resume when the promise resolves. Users never see a Suspense fallback for work that was already showing valid content.

### Fiber-style mid-render yield

`patchKeyedChildren` and `patchNonKeyedChildren` running on the Transition lane check `shouldYield()` between children. When the ~5ms slice is exhausted, the loop sets `R.pending = true` and returns. The scheduler's Transition loop detects the pending continuation and resumes on the next tick.

Sync and Default always run to completion. They never check `R.pending`.

## Shared render state (R)

`render-state.ts` exports a single `R` object:

```ts
export const R = {
  collecting: false,    // queue DOM ops instead of applying them
  activeLane: LANE_IDLE,
  pending: false,       // mid-render yield outstanding
}
```

Hot paths read `R.collecting` and `R.pending` as property loads on a stable hidden class. This is measurably cheaper than cross-module function calls (`isCollecting()`, `hasPendingWork()`) which ESM live-bindings make unreliable to inline.

Writes happen once per scheduler transition, reads happen per VNode. The asymmetry makes "object property read" the right pattern.

## Hooks

All hooks follow React calling conventions (fixed order, top-level only). State is stored on the component instance's hook list, indexed by call order.

- `useState`, `useReducer` — value + pending updates list. Setters queue updates to the component's current lane and call `scheduleComponent`.
- `useEffect`, `useLayoutEffect`, `useInsertionEffect` — identical in Tachys. Fire after commit, cleanup runs on re-run or unmount.
- `useMemo`, `useCallback` — cached by shallow dep comparison.
- `useRef` — stable mutable box.
- `useContext` — reads from the render-time Provider stack.
- `useSyncExternalStore` — stores snapshot, re-reads on render, re-enters at Sync lane if the snapshot changed between schedule and render. Prevents tearing.
- `useId` — deterministic ID generator, stable across SSR and client.
- `useTransition`, `startTransition`, `useDeferredValue` — schedule at Transition lane.
- `use` — conditionally callable. Reads context synchronously, suspends on pending promises.
- `useImperativeHandle` — sets ref.current to the created handle.

### Hook state snapshots for Transition abandonment

Before a Transition render runs a component, a snapshot of each hook's value and pending update list is stashed on the component instance. If the Transition is abandoned, the snapshots are restored. The next render sees the same state it would have seen if the Transition had never started.

## Error boundaries

`ErrorBoundary` wraps its children in a try/catch during render. A thrown error is caught, the component tree is unmounted, and the `fallback(error, reset)` render is mounted in its place. `reset()` re-renders the original children.

The pattern "ErrorBoundary inside Suspense" works. "ErrorBoundary wrapping Suspense" does not catch async rejections from lazy children because the re-render that surfaces the rejection is driven by the scheduler, with no parent error handler on the call stack.

## Suspense + lazy

`lazy(loader)` returns a component that reads a cached module. If the module is still loading, reading it throws the loading promise. `Suspense` catches the thrown promise, mounts its `fallback`, and re-renders the children when the promise resolves.

`use(promise)` uses the same throw-and-retry protocol.

Under a Transition, throwing a promise does not mount the fallback. The scheduler suspends the Transition and resumes when the promise resolves.

## SSR (`tachys/server`)

- `renderToString` — synchronous HTML string. Suspense renders its fallback.
- `renderToStringAsync` — awaits all Suspense boundaries. Full content.
- `renderToReadableStream` — Web Streams API. Sends fallbacks inline, streams resolved content in `<div hidden>` + swap script pairs.
- `hydrate` — walks existing DOM, attaches event listeners, wires up refs, installs component instances. No DOM replacement on match.

Selective hydration prioritizes Suspense boundaries the user interacts with (click / input / keydown / focusin).

Hooks during SSR:
- `useState` / `useReducer` return initial values.
- `useMemo` / `useCallback` compute normally.
- `useRef` returns the initial ref object.
- `useContext` reads the provider stack.
- `useId` generates deterministic IDs.
- `useEffect` / `useLayoutEffect` are no-ops.

## Compat layer (`tachys/compat`)

Bundler aliases `react` / `react-dom` / `react-dom/client` to Tachys equivalents. `createElement` → `h`, `Fragment` → `null`, `flushSync` → `flushUpdates`, hooks / memo / forwardRef / Suspense / createPortal are direct re-exports. `Component` / `PureComponent` exist as stubs for `instanceof` checks only.

React 19 additions: `useOptimistic` (lane-aware — passthrough during Transition renders), `useActionState` (async resolution wraps updates in `startTransition`), `useFormStatus`.

## Testing hooks

- `flushUpdates()` — synchronously drain all lanes.
- `flushSyncWork()` — drain only Sync.
- `act(callback)` — flushes sync work, microtasks, and async effects. Compatible with React Testing Library.

## Invariants the codebase relies on

1. Every VNode has the same hidden class. Pool recycling resets every field.
2. No function on the hot path accepts more than two argument shapes.
3. SMI flag values only. Never exceed 2^30.
4. `R.collecting` is never mutated inside an effect thunk — only by the scheduler.
5. Transition abandonment is always followed by state restoration before the next render.
6. Lane priority is strictly ordered; a lower lane never preempts a higher one.

Changes that violate any of these will regress benchmarks or break concurrent semantics.
