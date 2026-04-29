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
  item: unknown
}

interface CondInstance {
  dom: Node
  state: Record<string, unknown>
  props: Record<string, unknown>
}

/**
 * State kept between mount and patch for a compiled conditional child.
 * The plugin emits `state._c_N = _mountCond(...)` once, then calls
 * `_patchCond` with that same object on every subsequent render.
 *
 * `inst` is null when the condition is false (child unmounted). The
 * `parent` + `anchor` pair tell the patch where to (re-)insert on a
 * false -> true transition.
 */
export interface CompiledCondState {
  parent: Node
  anchor: Comment
  inst: CondInstance | null
}

/**
 * Mount a compiled conditional child. `anchor` is the comment marker
 * in the parent template at the child's position. When `cond` is truthy
 * the child is mounted and inserted before the anchor; otherwise only
 * the placeholder state is returned.
 *
 * `makeProps` is a module-scoped pure function emitted by the plugin;
 * it must not close over per-render values.
 */
export function _mountCond(
  cond: unknown,
  Child: CompiledComponent,
  makeProps: () => Record<string, unknown>,
  anchor: Comment,
): CompiledCondState {
  const parent = anchor.parentNode as Node
  const state: CompiledCondState = { parent, anchor, inst: null }
  if (cond) {
    const props = makeProps()
    const mounted = Child(props)
    parent.insertBefore(mounted.dom, anchor)
    state.inst = { dom: mounted.dom, state: mounted.state, props }
  }
  return state
}

/**
 * Patch a compiled conditional child.
 *
 * Four cases:
 *   - cond true, no prior inst  -> mount + insert
 *   - cond false, prior inst    -> remove + drop state
 *   - cond true, prior inst     -> patch child props (honoring _compare)
 *   - cond false, no prior inst -> nothing to do
 */
export function _patchCond(
  state: CompiledCondState,
  cond: unknown,
  Child: CompiledComponent,
  makeProps: () => Record<string, unknown>,
): void {
  const inst = state.inst
  if (cond && inst === null) {
    const props = makeProps()
    const mounted = Child(props)
    state.parent.insertBefore(mounted.dom, state.anchor)
    state.inst = { dom: mounted.dom, state: mounted.state, props }
    return
  }
  if (!cond && inst !== null) {
    state.parent.removeChild(inst.dom)
    state.inst = null
    return
  }
  if (cond && inst !== null) {
    const props = makeProps()
    const compare = Child._compare
    if (compare === undefined) {
      Child.patch(inst.state, props)
    } else if (!compare(inst.props, props)) {
      Child.patch(inst.state, props)
      inst.props = props
    }
  }
}

/**
 * State kept between mount and patch for a compiled ternary conditional
 * (`cond ? <A/> : <B/>`). Exactly one child is always mounted; `branch`
 * tracks which side we last rendered so patches can detect cond flips.
 */
export interface CompiledAltState {
  parent: Node
  anchor: Comment
  branch: 0 | 1
  inst: CondInstance
}

/**
 * Mount a compiled ternary child. The truthy branch (A) maps to branch 0;
 * the falsy branch (B) maps to branch 1. Like `_mountCond`, `makeProps`
 * closures observe live parent props so the emitter can share one shape
 * across mount and patch.
 */
export function _mountAlt(
  cond: unknown,
  ChildA: CompiledComponent,
  makePropsA: () => Record<string, unknown>,
  ChildB: CompiledComponent,
  makePropsB: () => Record<string, unknown>,
  anchor: Comment,
): CompiledAltState {
  const parent = anchor.parentNode as Node
  const branch: 0 | 1 = cond ? 0 : 1
  const Child = branch === 0 ? ChildA : ChildB
  const make = branch === 0 ? makePropsA : makePropsB
  const props = make()
  const mounted = Child(props)
  parent.insertBefore(mounted.dom, anchor)
  return {
    parent,
    anchor,
    branch,
    inst: { dom: mounted.dom, state: mounted.state, props },
  }
}

/**
 * Patch a compiled ternary child. Cond flip swaps the mounted subtree;
 * same-branch patches forward to the child's .patch (honoring _compare).
 */
export function _patchAlt(
  state: CompiledAltState,
  cond: unknown,
  ChildA: CompiledComponent,
  makePropsA: () => Record<string, unknown>,
  ChildB: CompiledComponent,
  makePropsB: () => Record<string, unknown>,
): void {
  const nextBranch: 0 | 1 = cond ? 0 : 1
  if (state.branch !== nextBranch) {
    state.parent.removeChild(state.inst.dom)
    const Child = nextBranch === 0 ? ChildA : ChildB
    const make = nextBranch === 0 ? makePropsA : makePropsB
    const props = make()
    const mounted = Child(props)
    state.parent.insertBefore(mounted.dom, state.anchor)
    state.branch = nextBranch
    state.inst = { dom: mounted.dom, state: mounted.state, props }
    return
  }
  const Child = nextBranch === 0 ? ChildA : ChildB
  const make = nextBranch === 0 ? makePropsA : makePropsB
  const props = make()
  const compare = Child._compare
  if (compare === undefined) {
    Child.patch(state.inst.state, props)
  } else if (!compare(state.inst.props, props)) {
    Child.patch(state.inst.state, props)
    state.inst.props = props
  }
}

/**
 * State kept between mount and patch for a compiled keyed list. The plugin
 * emits `state._list_N = _mountList(...)` once, then calls `_patchList`
 * with that same object on every subsequent render.
 */
export interface CompiledListState {
  instances: ListInstance[]
  /**
   * When the list is the last child of its parent template, the compiler
   * skips emitting a `<!>` marker. `anchor` is null in that case and inserts
   * use `parent.appendChild` (= insertBefore(node, null)) instead.
   */
  anchor: Comment | null
  parent: Node
  lastParentDeps: unknown[] | null
  /**
   * Scratch props object reused across `_patchList` iterations when the
   * child has no user-supplied compare. The compiler-emitted makeProps
   * mutates and returns this object instead of allocating a fresh one per
   * row, trading 1000 allocations per patch for 0. Undefined until the
   * first iteration allocates it via the makeProps default parameter.
   */
  scratchProps: Record<string, unknown> | undefined
  /**
   * Reference to the items array passed to the previous mount/patch. Used
   * by the targeted-row fast path to detect "no shape change" without
   * iterating: when the user mutates a prop like `selectedId` but reuses
   * the same `data` array, `items === lastItemsRef` confirms positions
   * and item identities are unchanged.
   */
  lastItemsRef: ArrayLike<unknown> | null
  /**
   * Lazily built key->instance map for the targeted-row fast path. Built
   * the first time the targeted path is taken, and cleared whenever a
   * shape-changing patch runs (insertion, removal, or LIS reorder).
   */
  keyToInst: Map<unknown, ListInstance> | null
}

/**
 * Mount a compiled keyed list. `anchorOrParent` is either a `Comment`
 * placeholder at the list's position (children get inserted before it) or
 * the parent element itself when the list is the last child of its parent
 * (no `<!>` marker emitted; children get appended). `makeProps` and `keyOf`
 * are module-scoped pure functions emitted by the plugin; they must not
 * close over per-render values.
 */
export function _mountList<Item>(
  items: ArrayLike<Item>,
  Child: CompiledComponent,
  makeProps: (item: Item, scratch?: Record<string, unknown>) => Record<string, unknown>,
  keyOf: (item: Item) => unknown,
  anchorOrParent: Node,
  parentDeps?: unknown[],
): CompiledListState {
  const isComment = anchorOrParent.nodeType === 8
  const parent = (isComment ? anchorOrParent.parentNode : anchorOrParent) as Node
  const anchor = isComment ? (anchorOrParent as Comment) : null
  const n = items.length
  const instances: ListInstance[] = new Array(n)
  // Detach `parent` from its grandparent for the duration of the mount
  // when the row count is large enough to matter. Blink's style/layout
  // engine does substantially less work attributing dirtiness to nodes
  // that aren't currently in the document, and reattaching once at the
  // end produces a single layout/paint cycle instead of N incremental
  // ones. The 64-row threshold keeps small mounts on the original path
  // (the detach/reattach has a fixed cost that loses on tiny lists).
  const grandparent = n >= 64 ? parent.parentNode : null
  const nextSib = grandparent ? parent.nextSibling : null
  if (grandparent) grandparent.removeChild(parent)
  // When the child has no _compare hook, the patch path never reads
  // `inst.props`. Two consequences worth exploiting on a 10k mount:
  //   • Let `makeProps` reuse a single scratch across rows. The first
  //     call seeds it (default arg `t={}`); subsequent calls overwrite
  //     in place. Saves N-1 small object allocations.
  //   • Set `inst.props = scratch` (undefined-aware): we still need a
  //     reference there to keep the hidden class stable, but we don't
  //     pay for fresh per-row props snapshots.
  // For children with _compare, `inst.props` is read on every patch
  // and must be a per-row snapshot, so fall back to the un-shared
  // path.
  const reuseScratch = Child._compare === undefined
  if (reuseScratch) {
    let scratch: Record<string, unknown> | undefined
    for (let i = 0; i < n; i++) {
      const item = items[i] as Item
      scratch = makeProps(item, scratch)
      const mounted = Child(scratch)
      const inst: ListInstance = {
        key: keyOf(item),
        dom: mounted.dom,
        state: mounted.state,
        props: scratch,
        item,
      }
      parent.insertBefore(mounted.dom, anchor)
      instances[i] = inst
    }
  } else {
    for (let i = 0; i < n; i++) {
      const item = items[i] as Item
      const props = makeProps(item)
      const mounted = Child(props)
      const inst: ListInstance = {
        key: keyOf(item),
        dom: mounted.dom,
        state: mounted.state,
        props,
        item,
      }
      parent.insertBefore(mounted.dom, anchor)
      instances[i] = inst
    }
  }
  if (grandparent) grandparent.insertBefore(parent, nextSib)
  return {
    instances,
    anchor,
    parent,
    lastParentDeps: parentDeps === undefined ? null : parentDeps.slice(),
    scratchProps: undefined,
    lastItemsRef: items,
    keyToInst: null,
  }
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
  makeProps: (item: Item, scratch?: Record<string, unknown>) => Record<string, unknown>,
  keyOf: (item: Item) => unknown,
  makePropsOrDiff?: (
    item: Item,
    scratch: Record<string, unknown> | undefined,
    prevState: Record<string, unknown>,
  ) => Record<string, unknown> | null,
  parentDeps?: unknown[],
  selectionDepIndices?: number[],
): void {
  const prev = list.instances
  const prevLen = prev.length
  const nextLen = items.length
  const parent = list.parent
  const anchor = list.anchor
  const compare = Child._compare
  const patchFn = Child.patch
  const lastDeps = list.lastParentDeps

  let parentChanged = false
  let onlySelectionChanged = false
  let anyDepChanged = false
  if (parentDeps !== undefined) {
    if (lastDeps === null || lastDeps.length !== parentDeps.length) {
      parentChanged = true
      anyDepChanged = true
    } else {
      onlySelectionChanged =
        selectionDepIndices !== undefined && selectionDepIndices.length > 0
      for (let d = 0; d < parentDeps.length; d++) {
        if (lastDeps[d] !== parentDeps[d]) {
          parentChanged = true
          anyDepChanged = true
          if (
            onlySelectionChanged &&
            selectionDepIndices!.indexOf(d) < 0
          ) {
            onlySelectionChanged = false
          }
        }
      }
    }
  }

  // Targeted-row fast path. When only "selection" parent deps changed (each
  // appears in a `<keyExpr> === props.X` propSpec) and the items array is
  // the same reference as last render, the only rows whose props can have
  // changed are those whose key equals the old or new value of any changed
  // selection dep. Look them up in keyToInst and patch only those, skipping
  // the prefix-trim entirely.
  let scratch = list.scratchProps
  if (
    onlySelectionChanged &&
    anyDepChanged &&
    items === list.lastItemsRef &&
    prevLen === nextLen &&
    compare === undefined &&
    makePropsOrDiff !== undefined &&
    lastDeps !== null
  ) {
    let keyToInst = list.keyToInst
    if (keyToInst === null) {
      keyToInst = new Map<unknown, ListInstance>()
      for (let i = 0; i < prevLen; i++) {
        keyToInst.set(prev[i]!.key, prev[i]!)
      }
      list.keyToInst = keyToInst
    }
    for (let s = 0; s < selectionDepIndices!.length; s++) {
      const idx = selectionDepIndices![s]!
      const prevVal = lastDeps[idx]
      const nextVal = parentDeps![idx]
      if (prevVal === nextVal) continue
      const prevInst = keyToInst.get(prevVal)
      if (prevInst !== undefined) {
        const result = makePropsOrDiff(prevInst.item as Item, scratch, prevInst.state)
        if (result !== null) {
          scratch = result
          patchFn(prevInst.state, scratch)
        }
      }
      const nextInst = keyToInst.get(nextVal)
      if (nextInst !== undefined) {
        const result = makePropsOrDiff(nextInst.item as Item, scratch, nextInst.state)
        if (result !== null) {
          scratch = result
          patchFn(nextInst.state, scratch)
        }
      }
    }
    const snap = new Array(parentDeps!.length)
    for (let d = 0; d < parentDeps!.length; d++) snap[d] = parentDeps![d]
    list.lastParentDeps = snap
    list.scratchProps = scratch
    return
  }

  if (parentChanged && parentDeps !== undefined) {
    const snap = new Array(parentDeps.length)
    for (let d = 0; d < parentDeps.length; d++) snap[d] = parentDeps[d]
    list.lastParentDeps = snap
  }

  // Fast-path: if the item object is identity-equal to the last render's
  // item and no parent deps changed, everything makeProps could return is
  // already bound into existing.state/props. Skip allocation + compare.
  const canSkipOnIdentity = !parentChanged

  // Pure-clear fast path. When the list is the only content of `parent`
  // (prev[0] is the first child, anchor is the last), `textContent = ""`
  // is Chrome's fastest mass-detach — it's how Inferno wipes. We then
  // re-insert the anchor so future inserts still have a reference node.
  // Falls back to Range.deleteContents() when the list is surrounded by
  // other siblings we must preserve.
  if (nextLen === 0 && prevLen > 0) {
    const lastIsListEnd =
      anchor !== null
        ? parent.lastChild === anchor
        : parent.lastChild === prev[prevLen - 1]!.dom
    if (parent.firstChild === prev[0]!.dom && lastIsListEnd) {
      ;(parent as Element).textContent = ""
      if (anchor !== null) parent.appendChild(anchor)
    } else {
      const range = document.createRange()
      range.setStartBefore(prev[0]!.dom)
      if (anchor !== null) range.setEndBefore(anchor)
      else range.setEndAfter(prev[prevLen - 1]!.dom)
      range.deleteContents()
    }
    list.instances = []
    list.lastItemsRef = items
    list.keyToInst = null
    return
  }

  // Single-item-removal fast path (Krausest 06_remove-one-1k). When the
  // new array is the old one with exactly one item spliced out and no
  // parent deps changed, no row's props could have changed. Locate the
  // removed position by identity compare and skip keyOf/patchInPlace
  // entirely across the 999 preserved rows. We mutate `prev` in place
  // (which is `list.instances`) using copyWithin + length truncation
  // rather than splice, since splice allocates a 1-element return array
  // we never use.
  if (!parentChanged && nextLen === prevLen - 1 && prevLen > 0) {
    let r = 0
    while (r < nextLen && (items[r] as Item) === prev[r]!.item) r++
    // r === nextLen: tail-removal. Otherwise verify the tail shifts by 1.
    let ok = true
    if (r < nextLen) {
      for (let k = r; k < nextLen; k++) {
        if ((items[k] as Item) !== prev[k + 1]!.item) {
          ok = false
          break
        }
      }
    }
    if (ok) {
      const removed = prev[r]!
      parent.removeChild(removed.dom)
      if (r < nextLen) prev.copyWithin(r, r + 1)
      prev.length = nextLen
      // Maintain keyToInst incrementally: drop just the one removed entry.
      // The remaining entries still point at live instances at correct keys.
      if (list.keyToInst !== null) list.keyToInst.delete(removed.key)
      list.lastItemsRef = items
      return
    }
  }

  const next: ListInstance[] = new Array(nextLen)

  // Split the per-row patch into two specialisations: when Child has no
  // compare (the compiler-emitted common case), `patch` itself owns the
  // early-bail so we skip one indirect call and one props-field write,
  // and we can reuse a scratch props object across iterations rather
  // than allocating one per row. User-supplied compare still uses the
  // memo-style path (compare reads prev.props so we can't mutate it).
  // (`scratch` was hoisted above for the targeted-row fast path.)
  // When `makePropsOrDiff` is supplied (compiler-emitted patch helper),
  // call it instead of `makeProps + patchFn`: it computes the new prop
  // values into locals, compares them to `existing.state`, and returns
  // `null` when every slot already matches — letting us skip both the
  // scratch writes and the patchFn's leading-bail call entirely. For
  // the select_row case (one parent dep changed, ~998/1000 rows
  // unaffected) this drops the per-row no-op work from ~25ns to ~10ns.
  const patchInPlace =
    compare === undefined
      ? makePropsOrDiff !== undefined
        ? (existing: ListInstance, item: Item): void => {
            if (canSkipOnIdentity && existing.item === item) return
            const result = makePropsOrDiff(item, scratch, existing.state)
            if (result !== null) {
              scratch = result
              patchFn(existing.state, scratch)
            }
            existing.item = item
          }
        : (existing: ListInstance, item: Item): void => {
            if (canSkipOnIdentity && existing.item === item) return
            scratch = makeProps(item, scratch)
            patchFn(existing.state, scratch)
            existing.item = item
          }
      : (existing: ListInstance, item: Item): void => {
          if (canSkipOnIdentity && existing.item === item) return
          const props = makeProps(item)
          if (!compare(existing.props, props)) {
            patchFn(existing.state, props)
            existing.props = props
          }
          existing.item = item
        }

  // ── 1. Prefix trim ────────────────────────────────────────────────────
  // When parent deps changed but the item array is the same reference (the
  // common select_row pattern: store mutates `selected` and renders with
  // the same `data` array), every row has `existing.item === items[i]`.
  // keyOf is pure, so identity-equal items have identity-equal keys; skip
  // the call. The patch body still has to run because parent-dep-derived
  // props may have changed.
  //
  // The compiler-emitted no-compare path inlines the patch body here to
  // drop the patchInPlace closure dispatch across the prefix run (the hot
  // path on select_row, where 1000 rows traverse this loop per click).
  let i = 0
  const minLen = prevLen < nextLen ? prevLen : nextLen
  if (compare === undefined && makePropsOrDiff !== undefined) {
    while (i < minLen) {
      const existing = prev[i]!
      const item = items[i] as Item
      if (existing.item !== item) {
        const key = keyOf(item)
        if (existing.key !== key) break
      } else if (canSkipOnIdentity) {
        next[i] = existing
        i++
        continue
      }
      const result = makePropsOrDiff(item, scratch, existing.state)
      if (result !== null) {
        scratch = result
        patchFn(existing.state, scratch)
      }
      existing.item = item
      next[i] = existing
      i++
    }
  } else {
    while (i < minLen) {
      const item = items[i] as Item
      const existing = prev[i]!
      if (existing.item !== item) {
        const key = keyOf(item)
        if (existing.key !== key) break
      }
      patchInPlace(existing, item)
      next[i] = existing
      i++
    }
  }
  const prefixEnd = i

  // ── 2. Suffix trim ────────────────────────────────────────────────────
  let e1 = prevLen - 1
  let e2 = nextLen - 1
  if (compare === undefined && makePropsOrDiff !== undefined) {
    while (e1 >= prefixEnd && e2 >= prefixEnd) {
      const existing = prev[e1]!
      const item = items[e2] as Item
      if (existing.item !== item) {
        const key = keyOf(item)
        if (existing.key !== key) break
      } else if (canSkipOnIdentity) {
        next[e2] = existing
        e1--
        e2--
        continue
      }
      const result = makePropsOrDiff(item, scratch, existing.state)
      if (result !== null) {
        scratch = result
        patchFn(existing.state, scratch)
      }
      existing.item = item
      next[e2] = existing
      e1--
      e2--
    }
  } else {
    while (e1 >= prefixEnd && e2 >= prefixEnd) {
      const item = items[e2] as Item
      const existing = prev[e1]!
      if (existing.item !== item) {
        const key = keyOf(item)
        if (existing.key !== key) break
      }
      patchInPlace(existing, item)
      next[e2] = existing
      e1--
      e2--
    }
  }

  // ── 3a. Pure removal case: next middle is empty ──────────────────────
  if (prefixEnd > e2) {
    const removedCount = e1 - prefixEnd + 1
    for (let k = prefixEnd; k <= e1; k++) parent.removeChild(prev[k]!.dom)
    list.instances = next
    list.scratchProps = scratch
    list.lastItemsRef = items
    if (removedCount > 0) list.keyToInst = null
    return
  }

  // ── 3b. Pure insertion case: prev middle is empty ────────────────────
  if (prefixEnd > e1) {
    const nextSib: Node | null = e1 + 1 < prevLen ? prev[e1 + 1]!.dom : anchor
    let insertedCount = 0
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
        item,
      }
      parent.insertBefore(mounted.dom, nextSib)
      next[k] = inst
      insertedCount++
    }
    list.instances = next
    list.scratchProps = scratch
    list.lastItemsRef = items
    if (insertedCount > 0) list.keyToInst = null
    return
  }

  // ── 4. Mixed middle: LIS-based reorder ───────────────────────────────
  // Sentinel -1 means "new node"; -2 marks a deferred slot (same-position
  // fast-path missed, need Map lookup in the second pass).
  const middleLen = e2 - prefixEnd + 1
  const oldIndex = new Int32Array(middleLen)
  const prevMiddleLen = e1 - prefixEnd + 1
  const used = new Uint8Array(prevMiddleLen)

  // Phase A: same-position fast-path. For swap / update / tail-churn
  // benches the vast majority of middle items stay at their original
  // index, so we can patchInPlace without building keyToPrevIdx at all.
  // Items whose position key diverged get deferred to phase B.
  //
  // When canSkipOnIdentity holds (no parent deps changed) and the item at
  // position `srcIdx` has the same object identity as last render, the
  // row's key is trivially unchanged and every makeProps output is already
  // bound into existing.state — we can skip keyOf, the closure call, and
  // the patch branch entirely. Swap hits this for ~998/1000 rows.
  let deferredKeys: unknown[] | null = null
  let deferredMs: Int32Array | null = null
  let deferredCount = 0
  // Tracks how many prev middle slots we reused (in either phase). When
  // matchedCount stays 0 through phase B, every prev middle row will be
  // removed, which lets us swap N removeChild calls for a single
  // textContent="" wipe in the full-replace case.
  let matchedCount = 0
  // Phase A only has a position-aligned prev for m < prevMiddleLen. Past
  // that we're in the "next middle is longer than prev middle" tail
  // (e.g. remove-one followed by a fresh-keyed run): every such slot is
  // either a key match elsewhere or a new mount, both handled by phase B.
  const phaseALen = middleLen < prevMiddleLen ? middleLen : prevMiddleLen
  for (let m = 0; m < phaseALen; m++) {
    const srcIdx = prefixEnd + m
    const item = items[srcIdx] as Item
    const prevAtPos = prev[srcIdx]!
    if (prevAtPos.item === item) {
      used[m] = 1
      matchedCount++
      oldIndex[m] = srcIdx
      next[srcIdx] = prevAtPos
      // Identity match: key is trivially equal so skip keyOf. When parent
      // deps changed, parent-dep-derived props may still differ; patchFn
      // still has to run.
      if (!canSkipOnIdentity) patchInPlace(prevAtPos, item)
      continue
    }
    const key = keyOf(item)
    if (prevAtPos.key === key) {
      used[m] = 1
      matchedCount++
      oldIndex[m] = srcIdx
      patchInPlace(prevAtPos, item)
      next[srcIdx] = prevAtPos
      continue
    }
    if (deferredKeys === null) {
      deferredKeys = new Array(middleLen - m)
      deferredMs = new Int32Array(middleLen - m)
    }
    deferredKeys[deferredCount] = key
    deferredMs![deferredCount] = m
    deferredCount++
    oldIndex[m] = -2
  }

  // Tail of next middle that has no prev counterpart (middleLen >
  // prevMiddleLen): defer every slot. Phase B's keyToPrevIdx may still
  // map the key to a leftover prev entry, but the position itself is new.
  if (phaseALen < middleLen) {
    if (deferredKeys === null) {
      deferredKeys = new Array(middleLen - phaseALen)
      deferredMs = new Int32Array(middleLen - phaseALen)
    }
    for (let m = phaseALen; m < middleLen; m++) {
      const srcIdx = prefixEnd + m
      const item = items[srcIdx] as Item
      const key = keyOf(item)
      deferredKeys[deferredCount] = key
      deferredMs![deferredCount] = m
      deferredCount++
      oldIndex[m] = -2
    }
  }

  // Phase B: only runs if at least one position-match failed. Build
  // keyToPrevIdx solely from prev entries that phase A didn't claim, then
  // resolve each deferred slot (match, or mount-new when prevIdx is
  // missing).
  if (deferredCount > 0) {
    const keyToPrevIdx = new Map<unknown, number>()
    for (let k = prefixEnd; k <= e1; k++) {
      if (used[k - prefixEnd] === 0) {
        keyToPrevIdx.set(prev[k]!.key, k)
      }
    }
    for (let d = 0; d < deferredCount; d++) {
      const m = deferredMs![d]!
      const srcIdx = prefixEnd + m
      const item = items[srcIdx] as Item
      const key = deferredKeys![d]
      const prevIdx = keyToPrevIdx.get(key)
      if (prevIdx !== undefined) {
        used[prevIdx - prefixEnd] = 1
        matchedCount++
        oldIndex[m] = prevIdx
        const existing = prev[prevIdx]!
        patchInPlace(existing, item)
        next[srcIdx] = existing
      } else {
        oldIndex[m] = -1
        const props = makeProps(item)
        const mounted = Child(props)
        const inst: ListInstance = {
          key,
          dom: mounted.dom,
          state: mounted.state,
          props,
          item,
        }
        next[srcIdx] = inst
      }
    }
  }

  // 2-element swap fast path. When Phase A deferred exactly two items and
  // both matched existing prev entries (no mounts) and prev/next middles
  // are the same length (no removals), the only middle work is moving
  // those two items to their new positions. Skip the LIS computation and
  // the O(middleLen) reverse-walk that would otherwise scan ~998 unchanged
  // rows on Krausest 05_swap1k.
  if (
    deferredCount === 2 &&
    prevMiddleLen === middleLen &&
    oldIndex[deferredMs![0]!]! >= 0 &&
    oldIndex[deferredMs![1]!]! >= 0
  ) {
    for (let d = 0; d < 2; d++) {
      const m = deferredMs![d]!
      const srcIdx = prefixEnd + m
      const inst = next[srcIdx]!
      const nextSib: Node | null = srcIdx + 1 < nextLen ? next[srcIdx + 1]!.dom : anchor
      parent.insertBefore(inst.dom, nextSib)
    }
    list.instances = next
    list.scratchProps = scratch
    list.lastItemsRef = items
    // 2-element swap: keys preserved; keyToInst stays valid.
    return
  }

  // Full-replace fast path (Krausest 02_replace1k): every prev row gets
  // removed and the list spans the entire parent. Swap prevMiddleLen
  // individual removeChild calls (each detaches a row, walks the
  // ownerDocument's mutation queue, fires MutationObservers per node)
  // for a single textContent="" — Chrome's ContainerNode::collectChildrenAndRemoveFromOldParent
  // bulk-detaches in one pass and skips per-node bookkeeping.
  if (
    matchedCount === 0 &&
    prevMiddleLen === prevLen &&
    parent.firstChild === prev[0]!.dom &&
    (anchor !== null
      ? parent.lastChild === anchor
      : parent.lastChild === prev[prevLen - 1]!.dom)
  ) {
    ;(parent as Element).textContent = ""
    if (anchor !== null) parent.appendChild(anchor)
  } else {
    // Remove prev middle items that weren't matched in the new middle.
    for (let k = prefixEnd; k <= e1; k++) {
      if (used[k - prefixEnd] === 0) parent.removeChild(prev[k]!.dom)
    }
  }

  // Full-replace fragment fast path (Krausest 02_replace1k). Every middle
  // slot is a fresh mount with a detached .dom. Skip the LIS loop and
  // batch-insert all rows via a DocumentFragment in DOM order — Chrome
  // moves the fragment's children into the parent in one bulk operation,
  // collapsing N insertBefore mutations into a single insert and a single
  // layout/paint invalidation.
  if (matchedCount === 0 && middleLen > 0) {
    const frag = (parent.ownerDocument ?? document).createDocumentFragment()
    for (let m = 0; m < middleLen; m++) {
      frag.appendChild(next[prefixEnd + m]!.dom)
    }
    if (anchor !== null) {
      parent.insertBefore(frag, anchor)
    } else if (prefixEnd > 0) {
      // There's a kept prefix and the list owns the tail. The kept suffix
      // is empty (matchedCount === 0 implies no suffix matched), so
      // appendChild lands every new row right after the prefix.
      parent.appendChild(frag)
    } else {
      parent.appendChild(frag)
    }
    list.instances = next
    list.scratchProps = scratch
    list.lastItemsRef = items
    list.keyToInst = null
    return
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
    const nextSib: Node | null = srcIdx + 1 < nextLen ? next[srcIdx + 1]!.dom : anchor
    if (oldIndex[m] === -1) {
      parent.insertBefore(inst.dom, nextSib)
    } else if (lisPtr < 0 || m !== lis[lisPtr]) {
      parent.insertBefore(inst.dom, nextSib)
    } else {
      lisPtr--
    }
  }

  list.instances = next
  list.scratchProps = scratch
  list.lastItemsRef = items
  // LIS reorder may have inserted/removed rows; invalidate the key map
  // so the targeted-row fast path rebuilds it on next access.
  list.keyToInst = null
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
