/**
 * JSX factory function.
 *
 * Determines flags and childFlags at creation time so the differ
 * never has to normalize children.
 *
 * className is extracted from props into a top-level VNode field
 * so mount/patch can apply it via direct dom.className write.
 *
 * normalizeChildren uses tiered fast paths to avoid intermediate
 * array allocations:
 *   - Single child: no array allocation at all
 *   - Multi-child, all clean VNodes: reuse the rest-param array directly
 *   - Multi-child with primitives: allocate vnodes[] only
 *   - Contains nulls/nested arrays: full flatten path
 */

import { __DEV__, warn } from "./dev"
import type { ChildFlag, VNodeFlag } from "./flags"
import { ChildFlags, VNodeFlags } from "./flags"
import type { JSX } from "./jsx-types"
import { acquireVNode } from "./pool"
import type { VNode, VNodeType } from "./vnode"
import type { ComponentFn } from "./vnode"

// Reusable result slots to avoid allocating { normalizedChildren, childFlags }
// on every h() call. Safe because h() is synchronous and non-reentrant.
let _ncChildren: VNode[] | VNode | string | null = null
let _ncChildFlags: ChildFlag = ChildFlags.NoChildren

type ChildArg = VNode | string | number | null | undefined | ChildArg[]

/**
 * Create a virtual DOM node. Used as the JSX pragma (`h`).
 *
 * Overloaded for per-element type checking: `h("input", { type: "text" })`
 * verifies that `type` is a valid prop for `<input>`. Components and
 * fragments use unchecked props (component prop types are erased at this level).
 *
 * @param type - Tag name, component function, or null for fragments
 * @param props - Element properties/attributes, or null
 * @param children - Child VNodes, strings, or numbers (rest params)
 * @returns A new VNode instance
 */
export function h<K extends keyof JSX.IntrinsicElements>(
  type: K,
  props: JSX.IntrinsicElements[K] | null,
  ...children: ChildArg[]
): VNode
export function h(
  type: ComponentFn,
  props: Record<string, unknown> | null,
  ...children: ChildArg[]
): VNode
export function h(type: null, props: null, ...children: ChildArg[]): VNode
export function h(
  type: VNodeType,
  props: Record<string, unknown> | null,
  ...children: ChildArg[]
): VNode {
  let flags: VNodeFlag
  if (type === null) {
    flags = VNodeFlags.Fragment
  } else if (typeof type === "function") {
    flags = VNodeFlags.Component
  } else {
    flags =
      type === "svg" ? ((VNodeFlags.Element | VNodeFlags.Svg) as VNodeFlag) : VNodeFlags.Element
  }

  let key: string | number | null = null
  let className: string | null = null

  if (props !== null) {
    // Read key/className once into locals (avoids double property lookup)
    const rawKey = props["key"]
    const rawCn = props["className"]
    const hasKey = rawKey !== undefined && rawKey !== null
    const hasCn = rawCn !== undefined && rawCn !== null

    if (hasKey) {
      key = rawKey as string | number
    }
    if (hasCn) {
      className = rawCn as string
    }

    if (hasKey || hasCn) {
      // Rebuild props without key/className via for...in (no spread allocation)
      let clean: Record<string, unknown> | null = null
      for (const p in props) {
        if (p !== "key" && p !== "className") {
          if (clean === null) clean = {}
          clean[p] = props[p]
        }
      }
      props = clean
    }
  }

  normalizeChildren(children)

  return acquireVNode(flags, type, key, props, _ncChildren, _ncChildFlags, className)
}

/**
 * Create a text VNode.
 */
export function createTextVNode(text: string): VNode {
  return acquireVNode(VNodeFlags.Text, null, null, null, text, ChildFlags.NoChildren, null)
}

/**
 * Normalize children into the module-level result slots (_ncChildren, _ncChildFlags).
 *
 * Uses tiered fast paths to minimize allocations:
 * 1. Empty: no allocation
 * 2. Single child: no array allocation (check raw[0] directly)
 * 3. Multi-child, all VNodes, no nulls/arrays: reuse rest-param array
 * 4. Multi-child with primitives: one vnodes[] allocation
 * 5. Contains nulls/nested arrays, or sole child is an array: full flatten path
 */
function normalizeChildren(raw: ChildArg[]): void {
  const len = raw.length

  if (len === 0) {
    _ncChildren = null
    _ncChildFlags = ChildFlags.NoChildren
    return
  }

  // Fast path: single child -- no intermediate array needed
  if (len === 1) {
    const only = raw[0]
    if (only === null || only === undefined) {
      _ncChildren = null
      _ncChildFlags = ChildFlags.NoChildren
      return
    }
    if (typeof only === "string" || typeof only === "number") {
      _ncChildren = String(only)
      _ncChildFlags = ChildFlags.HasTextChildren
      return
    }
    // h(tag, props, items.map(...)) -- single array child, flatten it
    if (Array.isArray(only)) {
      normalizeSlow(raw)
      return
    }
    _ncChildren = only as VNode
    _ncChildFlags = ChildFlags.HasSingleChild
    return
  }

  // Multi-child: scan to classify contents in a single pass
  let needsFlatten = false
  let hasPrimitives = false
  let hasKeys = false
  let hasNoKeys = false

  for (let i = 0; i < len; i++) {
    const item = raw[i]
    // VNode fast path first: typeof object + not null covers ~90% of children.
    // This reduces per-item checks from 5 to 2 for the common case.
    if (typeof item === "object" && item !== null) {
      if (Array.isArray(item)) {
        needsFlatten = true
        break
      }
      if ((item as VNode).key !== null) {
        hasKeys = true
      } else {
        hasNoKeys = true
      }
    } else if (typeof item === "string" || typeof item === "number") {
      hasPrimitives = true
      hasNoKeys = true
    } else {
      // null or undefined
      needsFlatten = true
      break
    }
  }

  if (needsFlatten) {
    // Slow path: contains nulls, undefined, or nested arrays -- must flatten
    normalizeSlow(raw)
    return
  }

  const childFlags =
    hasKeys && !hasNoKeys ? ChildFlags.HasKeyedChildren : ChildFlags.HasNonKeyedChildren

  if (!hasPrimitives) {
    // Fast path: all items are VNodes -- reuse the rest-param array directly
    // (no intermediate array allocation at all)
    if (__DEV__ && hasKeys) checkDuplicateKeys(raw as VNode[])
    _ncChildren = raw as VNode[]
    _ncChildFlags = childFlags
    return
  }

  // Has primitives mixed with VNodes -- need to convert primitives to text VNodes
  const vnodes: VNode[] = new Array(len)
  for (let i = 0; i < len; i++) {
    const child = raw[i]!
    if (typeof child === "string" || typeof child === "number") {
      vnodes[i] = createTextVNode(String(child))
    } else {
      vnodes[i] = child as VNode
    }
  }
  if (__DEV__ && hasKeys) checkDuplicateKeys(vnodes)
  _ncChildren = vnodes
  _ncChildFlags = childFlags
}

/**
 * Slow normalization path: flatten nested arrays and filter nulls/undefined.
 * Only called when the fast scan detects nulls, undefined, or nested arrays.
 */
function normalizeSlow(raw: ChildArg[]): void {
  const flat: Array<VNode | string | number> = []
  flattenInto(raw, flat)

  if (flat.length === 0) {
    _ncChildren = null
    _ncChildFlags = ChildFlags.NoChildren
    return
  }

  if (flat.length === 1) {
    const only = flat[0]!
    if (typeof only === "string" || typeof only === "number") {
      _ncChildren = String(only)
      _ncChildFlags = ChildFlags.HasTextChildren
    } else {
      _ncChildren = only as VNode
      _ncChildFlags = ChildFlags.HasSingleChild
    }
    return
  }

  const vnodes: VNode[] = []
  let hasKeys = false
  let hasNoKeys = false

  for (let i = 0; i < flat.length; i++) {
    const child = flat[i]!
    if (typeof child === "string" || typeof child === "number") {
      vnodes.push(createTextVNode(String(child)))
      hasNoKeys = true
    } else {
      vnodes.push(child)
      if (child.key !== null) {
        hasKeys = true
      } else {
        hasNoKeys = true
      }
    }
  }

  if (__DEV__ && hasKeys) checkDuplicateKeys(vnodes)
  _ncChildren = vnodes
  _ncChildFlags =
    hasKeys && !hasNoKeys ? ChildFlags.HasKeyedChildren : ChildFlags.HasNonKeyedChildren
}

/**
 * Warn when keyed children contain duplicate keys.
 * Only called in development mode.
 */
function checkDuplicateKeys(children: VNode[]): void {
  const seen = new Set<string | number>()
  for (let i = 0; i < children.length; i++) {
    const key = children[i]!.key
    if (key !== null) {
      if (seen.has(key)) {
        warn(
          `Duplicate key "${String(key)}" found in children. Keys must be unique among siblings. This may cause incorrect updates.`,
        )
        return // One warning per list is enough
      }
      seen.add(key)
    }
  }
}

function flattenInto(arr: ChildArg[], out: Array<VNode | string | number>): void {
  for (let i = 0; i < arr.length; i++) {
    const item = arr[i]
    if (item === null || item === undefined) continue
    if (Array.isArray(item)) {
      flattenInto(item, out)
    } else {
      out.push(item)
    }
  }
}
