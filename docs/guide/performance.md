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

## Bundle Size

| Build | Size | Gzipped |
|-------|------|---------|
| `index.js` (ESM) | 117 KB | ~27 KB |
| `index.min.js` (ESM, minified) | 28 KB | **~8.6 KB** |
| `jsx-runtime.min.js` | 1.5 KB | ~0.7 KB |

## Tips

1. **Use keys** for dynamic lists to enable the optimized keyed diff path.
2. **Memoize callbacks** with `useCallback` to prevent unnecessary child re-renders when passing handlers as props.
3. **Split contexts** by update frequency to minimize re-renders.
4. **Use `memo`** for components that receive complex props but re-render infrequently.
5. **Use `startTransition`** for expensive state updates that don't need to block user input.
6. **Use `useSyncExternalStore`** for external stores to get tearing prevention with Sync-lane scheduling.
