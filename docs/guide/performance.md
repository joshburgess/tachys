# Performance

Phasm is designed for V8-optimized performance from the ground up.

## Architecture

### Object Pooling

VNode objects are pooled and reused across renders. When a VNode is unmounted, it's returned to a free list. The next `h()` or `jsx()` call pops from the pool instead of allocating. This reduces GC pressure significantly in update-heavy apps.

### Bitwise Flags

VNode types and child shapes are represented as bitwise flags (SMI-safe integers) rather than string comparisons. Type dispatch in the diff algorithm uses integer bitmasking:

```ts
if ((flags & VNodeFlags.Element) !== 0) { /* element path */ }
```

### Event Delegation

All event handlers are delegated to a single root listener rather than individual DOM elements. Handler references are stored on DOM nodes via a lightweight `__phasm` property, avoiding closure allocation per element.

### Keyed Diff Algorithm

The keyed children reconciliation uses an Inferno-style LIS (Longest Increasing Subsequence) algorithm for minimal DOM moves. A small-list fast path avoids Map/LIS overhead for lists under 32 items.

### Priority-Based Scheduler

Phasm's scheduler uses three priority lanes (Sync, Default, Transition) to process updates in the right order. `useSyncExternalStore` uses the Sync lane for tearing prevention, normal state updates use Default, and `startTransition`/`useDeferredValue` use the Transition lane so they don't block urgent work.

### Two-Phase Commit for Transitions

Transition-lane renders use a two-phase commit. The render phase walks the VNode tree and, instead of mutating the DOM directly, pushes mutations (`appendChild`, `insertBefore`, `removeChild`, property sets) onto a typed effect queue. The commit phase flushes the queue atomically after the render completes successfully.

The effect queue unlocks two guarantees:

- **Abandonment is free.** If a higher-priority update arrives mid-render, the queue is thrown away. No DOM mutation has happened yet, so no rollback is needed. Hook state and ref callbacks are also rolled back to their pre-Transition values.
- **Suspense during Transition never flashes the fallback.** If a component throws a promise during a Transition render, the scheduler retries when the promise resolves instead of committing the fallback.

On the Sync and Default lanes the `R.collecting` flag is `false`, so the effect queue is bypassed entirely. These lanes pay only a single branch-predicted-false load per DOM operation, which V8 folds away in the optimized code.

### Fiber-Style Mid-Render Yield

Keyed and non-keyed children diffing on the Transition lane check a ~5ms time slice budget between children. When the budget is exhausted the render yields by setting `R.pending` and returns. The scheduler picks up the continuation on the next tick. Sync and Default renders always run to completion for predictable latency.

## Bundle Size

| Build | Size | Gzipped |
|-------|------|---------|
| `index.min.js` (ESM, minified) | 36 KB | **~10.6 KB** |
| `jsx-runtime.min.js` | 1.5 KB | ~0.7 KB |

## Tips

1. **Use keys** for dynamic lists to enable the optimized keyed diff path.
2. **Memoize callbacks** with `useCallback` to prevent unnecessary child re-renders when passing handlers as props.
3. **Split contexts** by update frequency to minimize re-renders.
4. **Use `memo`** for components that receive complex props but re-render infrequently.
5. **Use `startTransition`** for expensive state updates that don't need to block user input.
6. **Use `useSyncExternalStore`** for external stores to get tearing prevention with Sync-lane scheduling.
