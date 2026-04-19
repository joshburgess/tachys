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
 * Patch a compiled keyed list in-place. Reuses existing instances when
 * their key matches, patches the child's state only when `Child._compare`
 * (if present) returns false, and reconciles DOM order with a backward
 * walk from the anchor. The fast path — same instances in same order —
 * does zero DOM writes.
 */
export function _patchList<Item>(
  list: CompiledListState,
  items: ArrayLike<Item>,
  Child: CompiledComponent,
  makeProps: (item: Item) => Record<string, unknown>,
  keyOf: (item: Item) => unknown,
): void {
  const prev = list.instances
  const prevByKey = list.byKey
  const prevLen = prev.length
  const nextLen = items.length
  const nextByKey = new Map<unknown, ListInstance>()
  const next: ListInstance[] = new Array(nextLen)
  const compare = Child._compare
  const patchFn = Child.patch
  let orderChanged = prevLen !== nextLen
  let created = false

  for (let i = 0; i < nextLen; i++) {
    const item = items[i] as Item
    const key = keyOf(item)
    const props = makeProps(item)
    const existing = prevByKey.get(key)
    if (existing !== undefined) {
      if (compare === undefined || !compare(existing.props, props)) {
        patchFn(existing.state, props)
        existing.props = props
      }
      next[i] = existing
      nextByKey.set(key, existing)
      if (!orderChanged && prev[i] !== existing) orderChanged = true
    } else {
      const mounted = Child(props)
      const inst: ListInstance = {
        key,
        dom: mounted.dom,
        state: mounted.state,
        props,
      }
      next[i] = inst
      nextByKey.set(key, inst)
      created = true
      orderChanged = true
    }
  }

  list.instances = next
  list.byKey = nextByKey

  const parent = list.parent
  const anchor = list.anchor

  // Remove instances whose keys no longer exist in the next set.
  if (prevLen > nextByKey.size || (prevLen > 0 && nextLen === 0)) {
    for (let i = 0; i < prevLen; i++) {
      const inst = prev[i]!
      if (!nextByKey.has(inst.key)) parent.removeChild(inst.dom)
    }
  }

  // Fast path: same instances in same order and no creations. DOM is
  // already correct -- skip the reconcile walk entirely.
  if (!orderChanged && !created) return

  // Backward walk: for each next instance (right-to-left), if its DOM
  // nextSibling isn't what we expect, move it into place. Newly created
  // nodes are unattached so their nextSibling is null, which triggers
  // insertBefore correctly.
  let expectedNext: Node = anchor
  for (let i = nextLen - 1; i >= 0; i--) {
    const inst = next[i]!
    if (inst.dom.nextSibling !== expectedNext) {
      parent.insertBefore(inst.dom, expectedNext)
    }
    expectedNext = inst.dom
  }
}
