# Krausest performance plan (next round)

Working doc for the swap1k + clear1k optimization pass. Update as we go.

## Current gaps vs Inferno

From the last 20-sample run:

- `05_swap1k`: tachys 21.98 vs inferno 21.09 (ratio 1.0424, gap ~0.9ms)
- `09_clear1k_x8`: tachys 15.67 vs inferno 15.18 (ratio 1.0326, gap ~0.5ms)

(Script-level wins on 1, 7, 8; losses on 4, 5, 6, 9; push on 2, 3.)

## Profile findings

### swap1k

Captured /tmp/swap.cpuprofile via jsdom harness (`/tmp/prof-tachys.mjs`) with
Node `--cpu-prof --cpu-prof-interval=50` over 3000 iterations. Median action
0.997ms. Source URLs preserved via `vm.runInThisContext(src, { filename })`;
`new Function(src)()` loses them.

Top bundle self-time frames (minified, with resolved roles):

- `d` at main.js:0:1085: VDOM diff walker (Ut/Yt/$t/Zt/Hn recursion). 62ms / 1.69% self.
- anon at main.js:0:45073: generated Row patch fn (leading-bail inlined: `e.selected.n.selected.e.id.n.id.e.label.n.label.e._root.className`). 16ms.
- anon at main.js:0:3329: 4ms.
- anon at main.js:0:1866: 3.8ms.

jsdom internals dominate wall time (SymbolTree 183ms, Node-impl _insert 174ms,
_remove 115ms), so framework-vs-framework absolute comparison doesn't
transfer. The *relative* shape of bundle frames does: the Row patch costs
very little, the outer diff walker costs most.

**Conclusion:** on every click tachys re-diffs the entire App tree (Header,
buttons, table wrapper) even though only `<RowList data={data}
selectedId={selected}/>` changes. Hot path is outer VDOM, not `_patchList`.

There's already an identity short-circuit at `src/diff.ts:213`
(`if (oldVNode === newVNode) return`), so the question is whether the outer
tree reuses VNode identity. Currently it doesn't: App re-renders and
allocates fresh VNodes for everything.

### clear1k

Cannot profile via jsdom: `Range.deleteContents()` runs 22 seconds per call
in jsdom (vs ~1.77ms in Chrome). Confirmed via `/tmp/prof-diag.mjs`.

Alternative approaches noted in the plan below.

## Attempts

### Attempt 1: `parent.replaceChildren(anchor)` for clear

**Result: regressed.** 18.3 -> 19.7ms script median on 09_clear1k_x8.
Reverted. Chrome's `replaceChildren` is not faster than `Range.deleteContents`
for this case, and the `parent.lastChild === anchor` check added one DOM read.

### Attempt 2: Phase-A identity-bail in `_patchList` mixed-middle

When `canSkipOnIdentity && prev[srcIdx].item === items[srcIdx]`, skip the
`keyOf()` call and the `patchInPlace` closure invocation entirely. For swap,
998/1000 middle iterations hit this path. Landed in `src/compiled.ts:501`.

**Result: script down on swap** (about 0.3ms median). Total time still
dominated by paint which is DOM-mutation-pattern-dependent.

### Attempt 3: `textContent = ""` + re-insert anchor for clear

When the list is the entire content of its parent (first child is the first
row's DOM, last child is the anchor), do:

```js
parent.textContent = ""
parent.appendChild(anchor)
```

Matches Inferno's `clearDOM`. Falls back to `Range.deleteContents()` when
there are trailing siblings past the anchor. Landed in `src/compiled.ts:360`.

**Result: -1.2ms script median on 09_clear1k_x8** (16.1 -> 14.9 in the same
machine run). Gap to Inferno narrowed from +4.2ms to +3.0ms script.

## Current gaps (paired 30-sample run, same machine)

- `05_swap1k`: tachys 27.80 vs inferno 23.85 (ratio 1.166). Script delta
  0.15ms (essentially parity). Paint gap ~3.8ms is Chrome render phase.
- `09_clear1k_x8`: tachys 18.70 vs inferno 16.40 (ratio 1.140). Script
  gap 2.2ms. Closing the 2.2ms scripting remainder is the next target.

## Next session: pick up here

### Recommended first swing

Profile the clear script-time remainder to isolate where the 2.2ms lives:
is it App re-render, compat-layer hooks, or compiled dispatch? That result
tells us whether to invest in **compat optimization** (small, targeted) or
the **bigger compiler work** (static VNode hoisting, compile-App). Don't
guess, and don't start the compiler work speculatively. The profile decides.

### Close-range wins (start here)

1. **Profile clear's remaining script time.** Tachys clear is 14.9ms script
   vs Inferno 12.7ms, a 2.2ms gap. The clear op itself is now at parity
   (textContent landed), so the remainder lives outside the clear. Most
   likely suspects:
   - App re-render wrapping: VNode allocation for the App subtree +
     patchInner descent.
   - Compat layer: `useState` + `useCallback` + scheduler work per click.
     Inferno's bench uses hyperscript directly without these hook layers.
   - Compiled RowList patch-dispatch overhead when invoked with `data=[]`.

   Concrete first step: capture a V8 CPU profile of a hot-loop clear in
   Chrome (via CDP against the running bench, since jsdom can't profile
   clear). See "Open issue: jsdom + clear" below.

2. **06_remove-one-1k** is ratio 1.275 (tachys 20.4 vs inferno 16.0 total).
   We already have a single-item-removal fast path but haven't profiled
   this bench. May be paint-side or compat-layer overhead.

3. **02_replace1k** ratio 1.057. Minor, not urgent.

### Structural angles (bigger payoff, more work; schedule after the close-range wins)

- **Compiler-side static VNode hoisting.** Header/span/static chrome
  become module-level constants. Skips re-allocation per App render and
  pairs with the existing `diff.ts:213` identity short-circuit. Biggest
  architectural lever still on the table.
- **Compile App itself.** Today App bails because it uses hooks. If the
  non-hook subtree could compile while hooks stay in a narrow boundary,
  the whole VDOM walker disappears on swap/clear.
- **Compat layer audit.** Same idea but smaller scope: identify where
  `useState`/`useCallback`/scheduler add cycles that Inferno's hyperscript
  setup avoids.

### Paint-bound (probably not fixable via JS)

- **05_swap1k paint gap ~3.8ms.** JS is at parity. The gap is Chrome
  render/composite and depends on DOM mutation order. Could compare our
  exact `insertBefore` sequence against Inferno's to see if one batches
  layout better. High effort for probably small gain. Deprioritize.

### Open issue: jsdom can't profile clear

`Range.deleteContents()` takes 22 seconds per call in jsdom vs ~1.77ms in
Chrome. Our Node-based profile harness (`/tmp/prof-tachys.mjs`) cannot be
used for clear. Options for next session:

- Use Chrome DevTools Protocol directly against the running bench server
  for a real CPU profile.
- Run the bench harness with `--trace` and extract V8 samples from the
  Chrome trace JSON.

## Measurements cheat sheet

```
# Pack + install + rebuild + bench one benchmark
cd /Users/joshburgess/code/tachys
pnpm build && npm pack
cp tachys-0.0.1.tgz /Users/joshburgess/code/js-framework-benchmark/frameworks/keyed/tachys/
cd /Users/joshburgess/code/js-framework-benchmark/frameworks/keyed/tachys
npm install --force ./tachys-0.0.1.tgz --no-audit --no-fund
npm run build-prod
cd /Users/joshburgess/code/js-framework-benchmark/webdriver-ts
npm run bench -- --framework keyed/tachys --benchmark 05_swap1k --count 30 --headless
```

Always pair any tachys run with an inferno run in the same session:
machine thermal state changes numbers by 30%+.
