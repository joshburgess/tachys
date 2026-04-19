/**
 * Compiled component runtime.
 *
 * Compiled components skip the VDOM tree entirely. A compiled component's
 * function is called ONCE per instance to clone a pre-built DOM template
 * (via `cloneNode`) and wire up dynamic slots. Updates go through a
 * per-component `patch` function that diffs slot values against cached
 * state and writes only what changed. No per-render VNode allocations,
 * no recursion into children.
 *
 * This mirrors what Inferno's `createVNode` + `$HasKeyedChildren` hints
 * and SolidJS's JSX compiler produce at build time.
 *
 * Day-1 validation: components are hand-written. A Babel plugin will
 * generate this shape automatically in a later milestone.
 */

import { ComponentMeta } from "./flags"

/**
 * A compiled component's mount result. `dom` is the root element that gets
 * appended to the parent; `state` carries cached slot values and direct
 * node references for the patch function.
 */
export interface CompiledMount {
  dom: Element
  state: Record<string, unknown>
}

/**
 * Shape of a compiled component function. Called once per instance on
 * mount to build DOM + state. The `patch` method is invoked on prop
 * changes to diff slots.
 */
export interface CompiledComponent {
  (props: Record<string, unknown>): CompiledMount
  patch(state: Record<string, unknown>, props: Record<string, unknown>): void
  _meta: number
  _compare?: (
    prev: Record<string, unknown>,
    next: Record<string, unknown>,
  ) => boolean
}

/**
 * Parse an HTML string once, return a template element that can be
 * cloned cheaply on subsequent calls.
 */
export function _template(html: string): Element {
  const tpl = document.createElement("template")
  tpl.innerHTML = html
  return tpl.content.firstElementChild as Element
}

/**
 * Mark a function as a compiled component and attach its patch method.
 */
export function markCompiled(
  mount: (props: Record<string, unknown>) => CompiledMount,
  patch: (state: Record<string, unknown>, props: Record<string, unknown>) => void,
  compare?: (prev: Record<string, unknown>, next: Record<string, unknown>) => boolean,
): CompiledComponent {
  const fn = mount as CompiledComponent
  fn.patch = patch
  fn._meta = ComponentMeta.Compiled
  if (compare !== undefined) fn._compare = compare
  return fn
}

interface ListInstance {
  key: unknown
  dom: Node
  state: Record<string, unknown>
  props: Record<string, unknown>
}

/**
 * State kept between mount and patch for a compiled keyed list. The plugin
 * emits `state._list_N = _mountList(...)` once, then calls `_patchList`
 * with that same object on every subsequent render.
 */
export interface CompiledListState {
  instances: ListInstance[]
  byKey: Map<unknown, ListInstance>
  anchor: Comment
  parent: Node
}

/**
 * Mount a compiled keyed list. `anchor` is the comment placeholder inside
 * the parent DOM at the list's position; children get inserted before it.
 * `makeProps` and `keyOf` are module-scoped pure functions emitted by the
 * plugin; they must not close over per-render values.
 */
export function _mountList<Item>(
  items: ArrayLike<Item>,
  Child: CompiledComponent,
  makeProps: (item: Item) => Record<string, unknown>,
  keyOf: (item: Item) => unknown,
  anchor: Comment,
): CompiledListState {
  const parent = anchor.parentNode as Node
  const n = items.length
  const instances: ListInstance[] = new Array(n)
  const byKey = new Map<unknown, ListInstance>()
  for (let i = 0; i < n; i++) {
    const item = items[i] as Item
    const props = makeProps(item)
    const mounted = Child(props)
    const key = keyOf(item)
    const inst: ListInstance = {
      key,
      dom: mounted.dom,
      state: mounted.state,
      props,
    }
    parent.insertBefore(mounted.dom, anchor)
    instances[i] = inst
    byKey.set(key, inst)
  }
  return { instances, byKey, anchor, parent }
}

/**
 * Patch a compiled keyed list in-place.
 *
 * The algorithm mirrors Vue/Inferno's patchKeyedChildren:
 *   1. Prefix trim -- step forward while keys match at the same position.
 *   2. Suffix trim -- same, from the tail.
 *   3. If the remaining prev range is empty, insert the rest of next.
 *      If the remaining next range is empty, remove the rest of prev.
 *   4. Otherwise: compute the longest-increasing-subsequence of prev indices
 *      within the middle, then walk the middle in reverse. Items whose
 *      oldIndex lies in the LIS stay put; everything else is inserted before
 *      the current expected sibling.
 *
 * This drops a 1000-item swap from O(n) moves down to 2 moves, matching
 * the move count of `h()`/VDOM's keyed diff.
 */
export function _patchList<Item>(
  list: CompiledListState,
  items: ArrayLike<Item>,
  Child: CompiledComponent,
  makeProps: (item: Item) => Record<string, unknown>,
  keyOf: (item: Item) => unknown,
): void {
  const prev = list.instances
  const prevLen = prev.length
  const nextLen = items.length
  const parent = list.parent
  const anchor = list.anchor
  const compare = Child._compare
  const patchFn = Child.patch

  const next: ListInstance[] = new Array(nextLen)
  const nextByKey = new Map<unknown, ListInstance>()

  const patchInPlace = (existing: ListInstance, item: Item): void => {
    const props = makeProps(item)
    if (compare === undefined || !compare(existing.props, props)) {
      patchFn(existing.state, props)
      existing.props = props
    }
  }

  // ── 1. Prefix trim ────────────────────────────────────────────────────
  let i = 0
  const minLen = prevLen < nextLen ? prevLen : nextLen
  while (i < minLen) {
    const item = items[i] as Item
    const key = keyOf(item)
    const existing = prev[i]!
    if (existing.key !== key) break
    patchInPlace(existing, item)
    next[i] = existing
    nextByKey.set(key, existing)
    i++
  }
  const prefixEnd = i

  // ── 2. Suffix trim ────────────────────────────────────────────────────
  let e1 = prevLen - 1
  let e2 = nextLen - 1
  while (e1 >= prefixEnd && e2 >= prefixEnd) {
    const item = items[e2] as Item
    const key = keyOf(item)
    const existing = prev[e1]!
    if (existing.key !== key) break
    patchInPlace(existing, item)
    next[e2] = existing
    nextByKey.set(key, existing)
    e1--
    e2--
  }

  // ── 3a. Pure removal case: next middle is empty ──────────────────────
  if (prefixEnd > e2) {
    for (let k = prefixEnd; k <= e1; k++) parent.removeChild(prev[k]!.dom)
    list.instances = next
    list.byKey = nextByKey
    return
  }

  // ── 3b. Pure insertion case: prev middle is empty ────────────────────
  if (prefixEnd > e1) {
    const nextSib: Node = e1 + 1 < prevLen ? prev[e1 + 1]!.dom : anchor
    for (let k = prefixEnd; k <= e2; k++) {
      const item = items[k] as Item
      const key = keyOf(item)
      const props = makeProps(item)
      const mounted = Child(props)
      const inst: ListInstance = {
        key,
        dom: mounted.dom,
        state: mounted.state,
        props,
      }
      parent.insertBefore(mounted.dom, nextSib)
      next[k] = inst
      nextByKey.set(key, inst)
    }
    list.instances = next
    list.byKey = nextByKey
    return
  }

  // ── 4. Mixed middle: LIS-based reorder ───────────────────────────────
  // Map each surviving key to its position in prev so we can discover
  // moves cheaply. Sentinel -1 means "new node".
  const keyToPrevIdx = new Map<unknown, number>()
  for (let k = prefixEnd; k <= e1; k++) {
    keyToPrevIdx.set(prev[k]!.key, k)
  }

  const middleLen = e2 - prefixEnd + 1
  const oldIndex = new Int32Array(middleLen)
  const prevMiddleLen = e1 - prefixEnd + 1
  const used = new Uint8Array(prevMiddleLen)

  for (let m = 0; m < middleLen; m++) {
    const srcIdx = prefixEnd + m
    const item = items[srcIdx] as Item
    const key = keyOf(item)
    const prevIdx = keyToPrevIdx.get(key)
    if (prevIdx !== undefined) {
      used[prevIdx - prefixEnd] = 1
      oldIndex[m] = prevIdx
      const existing = prev[prevIdx]!
      patchInPlace(existing, item)
      next[srcIdx] = existing
      nextByKey.set(key, existing)
    } else {
      oldIndex[m] = -1
      const props = makeProps(item)
      const mounted = Child(props)
      const inst: ListInstance = {
        key,
        dom: mounted.dom,
        state: mounted.state,
        props,
      }
      next[srcIdx] = inst
      nextByKey.set(key, inst)
    }
  }

  // Remove prev middle items that weren't matched in the new middle.
  for (let k = prefixEnd; k <= e1; k++) {
    if (used[k - prefixEnd] === 0) parent.removeChild(prev[k]!.dom)
  }

  // LIS over oldIndex; entries tagged -1 (new nodes) are skipped inside
  // getLIS and always get an insertBefore below.
  const lis = getLIS(oldIndex)

  // Walk middle in reverse, moving items whose positions aren't in the
  // LIS. The expected sibling is either the next-in-next-array instance
  // or the anchor when at the tail.
  let lisPtr = lis.length - 1
  for (let m = middleLen - 1; m >= 0; m--) {
    const srcIdx = prefixEnd + m
    const inst = next[srcIdx]!
    const nextSib: Node = srcIdx + 1 < nextLen ? next[srcIdx + 1]!.dom : anchor
    if (oldIndex[m] === -1) {
      parent.insertBefore(inst.dom, nextSib)
    } else if (lisPtr < 0 || m !== lis[lisPtr]) {
      parent.insertBefore(inst.dom, nextSib)
    } else {
      lisPtr--
    }
  }

  list.instances = next
  list.byKey = nextByKey
}

/**
 * Longest-increasing-subsequence over an array of indices, returning the
 * positions (in the input) whose values form the LIS. Entries equal to
 * `-1` are treated as "new" and excluded from the subsequence.
 *
 * Standard O(n log n) patience-sorting variant with predecessor links for
 * backtracking.
 */
function getLIS(arr: Int32Array): Int32Array {
  const n = arr.length
  const predecessors = new Int32Array(n)
  const tails: number[] = []
  for (let i = 0; i < n; i++) {
    const x = arr[i]!
    if (x === -1) continue
    if (tails.length === 0) {
      predecessors[i] = -1
      tails.push(i)
      continue
    }
    const lastIdx = tails[tails.length - 1]!
    if (arr[lastIdx]! < x) {
      predecessors[i] = lastIdx
      tails.push(i)
      continue
    }
    // Binary search for the smallest tails slot with value >= x.
    let u = 0
    let v = tails.length - 1
    while (u < v) {
      const c = (u + v) >> 1
      if (arr[tails[c]!]! < x) u = c + 1
      else v = c
    }
    if (x < arr[tails[u]!]!) {
      predecessors[i] = u > 0 ? tails[u - 1]! : -1
      tails[u] = i
    }
  }
  const resultLen = tails.length
  const result = new Int32Array(resultLen)
  let cursor = resultLen > 0 ? tails[resultLen - 1]! : -1
  for (let k = resultLen - 1; k >= 0; k--) {
    result[k] = cursor
    cursor = predecessors[cursor]!
  }
  return result
}
