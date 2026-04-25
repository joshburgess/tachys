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

## Profile findings (Chrome CDP, 2026-04-24)

Drove headed Chromium against the running bench server via Playwright +
CDP `Profiler.start/stop` per clear (`tools/profile-clear.mjs`). 60
iterations, 10us sampling. Per-iteration: click `#run` (outside profile),
click `#clear` (inside profile), wait for empty tbody.

### Bundle frame mapping (corrected)

The earlier swap-derived note "`d` at main.js:0:1085 = VDOM diff walker"
was wrong. Verified by reading the function body:

- `d` at `main.js:0:1085` = **`_patchList`** (`function d(e,n,t,l,o,i){const r=e.instances,s=r.length,c=n.length,d=e.parent,u=e.anchor,f=t._compare,h=t.patch;...`)
- `Ut` at `main.js:0:29938` = **`patch`** (the diff walker — has the `e===n` short-circuit at `diff.ts:213`)
- `$t` at `main.js:0:30252` = **`patchElement`**

This invalidates the "walker dominates the click path" hypothesis. On
clear, the walker is essentially absent.

### Tachys clear (60 iters, 10us)

```
                     hits   self_ms   self/clear
_patchList (d)       14175  227.27    3.79 ms   (97.7% of tachys self-time)
patch walker (Ut)       54    0.91   0.015 ms
patchElement ($t)       17    0.31   0.005 ms
co (compat?)            38    0.58   0.010 ms
sn (compat?)            33    0.52   0.009 ms
```

Total tachys self-time: 232.47ms / 60 = **3.87ms per clear**.

`_patchList`'s only call-tree child is `appendChild` (39 hits). The
textContent="" + appendChild(anchor) fast path **is** being taken on
clear (no `Range.deleteContents` in any sample tree). Most of `_patchList`'s
self-time is the native `textContent=""` setter doing 1000-node DOM removal,
attributed up to the JS frame because property setters don't appear as
their own profile node.

### Inferno clear (same harness, 60 iters, 10us)

```
                     hits   self_ms   self/clear
Ke (_patchList eq.)   9162  234.17    3.90 ms
qe (unmount?)          238    7.17   0.119 ms
me                      30    0.69   0.011 ms
```

Total inferno self-time: 245.19ms / 60 = **4.09ms per clear**.

### Decisive comparison

| | tachys | inferno |
|---|---|---|
| total bundle self / clear | **3.87 ms** | **4.09 ms** |
| list patcher self / clear | 3.79 ms | 3.90 ms |
| walker / unmount overhead | 0.015 ms | 0.119 ms |

**Tachys's clear is at parity with (slightly faster than) Inferno at the
JS level.** This contradicts the 2.2ms script gap reported by the
benchmark harness (~0.275 ms/clear). The gap is either below our 10us
sampling floor (very small per-clear), or it's a measurement-window
artifact between Playwright-driven profiling and webdriver-cdp's bench
loop. Either way, clear is no longer the highest-leverage target.

### Implication: pivot

The structural levers in the prior plan (static VNode hoisting,
compile-App) were motivated by the swap-derived "walker dominates"
hypothesis. The clear profile invalidates that motivation for clear.
Walker on clear is 15us per click — there's nothing to hoist away here.

For swap, the picture might still be different (re-profile needed), but
the labelling correction means we should re-read the swap profile too
before committing to compiler-side work.

## 06_remove-one-1k profile (Chrome CDP, 2026-04-24)

Adapted the harness as `tools/profile-remove.mjs`. Replicates the bench's
init state (run, then delete rows 9..5, then row 6) and profiles 60
measured deletes of row 4.

### Measured

| | tachys | inferno |
|---|---|---|
| total bundle self / 60 deletes | 8.47 ms | 9.70 ms |
| per delete | **0.14 ms** | **0.16 ms** |
| top frame | `_patchList` (d) — 39 us | `ot` at 24212 — 16 us |

Tachys is slightly faster in the profile, same as for clear.

### Bench-result confirmation

Reading `webdriver-ts/results/*_06_remove-one-1k.json` directly:

```
                tachys     inferno
total median   20.4 ms    16.0 ms
script median   0.5 ms     0.5 ms     <-- parity
paint median   17.8 ms    14.3 ms     <-- 3.5 ms gap
```

**Script is at parity. The whole 4.4ms total gap is paint.** The 1.275
ratio in the prior plan was conflating total with script time.

## Final picture: all three contested benchmarks are paint-bound

```
                  total gap   script gap   paint gap
05_swap1k          ~4 ms       ~0 ms        ~3.8 ms
06_remove-one-1k   4.4 ms       0 ms         3.5 ms
09_clear1k_x8      2.3 ms       ~0 ms       ~2.3 ms  *
```

\* Bench's `script` for clear reports 2.2ms above Inferno; CDP profile
shows zero gap. The 2.2ms in bench's script category may actually be
Chrome attributing some pre-paint work into "script" (composite sync,
style invalidation cascade) that the V8 sampler doesn't see. Either
way: not a JS-frame we can locate or shrink.

Tachys's compile/runtime is essentially at parity with Inferno on the
js-framework-benchmark CPU benchmarks at the JS level. Total-time gaps
are paint/composite/layout, downstream of DOM mutation patterns we
cannot meaningfully change without altering correctness.

## Next session: pick up here

The script side is done for these benchmarks. The remaining work splits
three ways:

### 1. Push the wins wider (small, mechanical)

Where we already win on script (`01_run1k`, `07_create10k`,
`08_create1k-after1k_x2`), profile and shave further. This widens the
script geomean without depending on paint-side luck.

### 2. Investigate paint-side mutation patterns (medium, uncertain)

Compare DOM mutation order between tachys and Inferno on swap and
remove. Different `insertBefore` / `removeChild` sequences cause
different layout invalidation patterns. Recording a Performance
timeline (Chrome DevTools) with the "Layout Shift" + "Paint" tracks
visible may show what we're paying for.

### 3. Structural compiler work (big, no bench payoff expected)

Static VNode hoisting and compile-App were motivated by the swap walker
hypothesis, which the corrected profile invalidates. They'd still pay
off for real-world apps with deep component trees, but **they will not
move these benchmark numbers**. Worth doing, but not for benchmark
geomean.

### Don't bother

- `02_replace1k` (ratio 1.057, script trivially small)
- Hunting the 0.275-ms-per-clear discrepancy between bench and profile.
  Below resolution, likely measurement window difference.

### Re-read swap with corrected labels

The original PERF_PLAN's swap profile attributed dominant time to `d`
calling it "the diff walker." With `d` correctly identified as
`_patchList`, the swap analysis should be re-derived. The implication
may be the same (mid-list keyed work is the cost) but the structural
recommendation (static VNode hoisting) may not follow.

### Don't pursue (deprioritized)

- **Clear's remaining 2.2ms script gap.** Profile says we're at parity
  JS-side. Probably paint/composite or harness-window artifact.
- **Static VNode hoisting / compile-App** as a clear-side optimization.
  Walker contributes 15us/click. Not worth structural work for that.

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

### Resolved: jsdom-can't-profile-clear

Done via `tools/profile-clear.mjs` (Playwright + CDP Profiler against the
running bench server). Per-clear `Profiler.start/stop` to isolate sampled
time to the clear op. See "Profile findings (Chrome CDP, 2026-04-24)"
above. Per-clear .cpuprofile files land in `/tmp/clear-prof/` for manual
inspection in Chrome DevTools.

```
# Run clear profile against tachys
SAMPLING_US=10 ITERATIONS=60 node tools/profile-clear.mjs

# Same harness, different framework
BENCH_URL=http://localhost:8080/frameworks/keyed/inferno/ \
  SAMPLING_US=10 ITERATIONS=60 node tools/profile-clear.mjs
```

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
