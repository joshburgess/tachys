/**
 * JSX automatic runtime for Tachys.
 *
 * Used by TypeScript/Babel's automatic JSX transform (jsx-runtime).
 * Supports both `jsx` (single child) and `jsxs` (multiple children).
 */

import { __DEV__, warn } from "./dev"
import type { ChildFlag, VNodeFlag } from "./flags"
import { ChildFlags, VNodeFlags } from "./flags"
import { acquireVNode } from "./pool"
import type { VNode, VNodeType } from "./vnode"

import { createTextVNode } from "./jsx"

export type { JSX } from "./jsx-types"

/**
 * Fragment sentinel for the automatic JSX transform.
 */
export const Fragment = null

/**
 * jsx() -- called by the automatic JSX transform for elements with 0 or 1 child.
 */
export function jsx(type: VNodeType, props: Record<string, unknown>, key?: string | number): VNode {
  let flags: VNodeFlag
  if (type === null) {
    flags = VNodeFlags.Fragment
  } else if (typeof type === "function") {
    flags = VNodeFlags.Component
  } else {
    flags =
      type === "svg" ? ((VNodeFlags.Element | VNodeFlags.Svg) as VNodeFlag) : VNodeFlags.Element
  }

  const resolvedKey = key !== undefined ? key : null

  // Extract children and className from props without object spread
  const rawChildren = props["children"]
  let className: string | null = null
  const cn = props["className"]
  if (cn !== undefined && cn !== null) {
    className = cn as string
  }

  // Build clean props without children/className (avoid spread allocation)
  let cleanProps: Record<string, unknown> | null = null
  for (const k in props) {
    if (k !== "children" && k !== "className") {
      if (cleanProps === null) cleanProps = {}
      cleanProps[k] = props[k]
    }
  }

  let normalizedChildren: VNode[] | VNode | string | null
  let childFlags: ChildFlag

  if (rawChildren === null || rawChildren === undefined || typeof rawChildren === "boolean") {
    normalizedChildren = null
    childFlags = ChildFlags.NoChildren
  } else if (typeof rawChildren === "string") {
    normalizedChildren = rawChildren
    childFlags = ChildFlags.HasTextChildren
  } else if (typeof rawChildren === "number") {
    normalizedChildren = String(rawChildren)
    childFlags = ChildFlags.HasTextChildren
  } else if (Array.isArray(rawChildren)) {
    // A single JSX expression `{array}` lands here via the one-child `jsx()`
    // overload. Normalize the array the same way `jsxs()` does so keyed
    // diffing still works.
    const raw = rawChildren as Array<VNode | string | number | null | undefined | boolean>
    if (raw.length === 0) {
      normalizedChildren = null
      childFlags = ChildFlags.NoChildren
    } else {
      const vnodes: VNode[] = []
      let hasKeys = false
      let hasNoKeys = false
      for (let i = 0; i < raw.length; i++) {
        const child = raw[i]
        if (child === null || child === undefined || typeof child === "boolean") {
          vnodes.push(createTextVNode(""))
          hasNoKeys = true
          continue
        }
        if (typeof child === "string" || typeof child === "number") {
          vnodes.push(createTextVNode(String(child)))
          hasNoKeys = true
        } else {
          vnodes.push(child as VNode)
          if ((child as VNode).key !== null) hasKeys = true
          else hasNoKeys = true
        }
      }
      normalizedChildren = vnodes
      childFlags =
        hasKeys && !hasNoKeys ? ChildFlags.HasKeyedChildren : ChildFlags.HasNonKeyedChildren
    }
  } else {
    normalizedChildren = rawChildren as VNode
    childFlags = ChildFlags.HasSingleChild
  }

  return acquireVNode(
    flags,
    type,
    resolvedKey,
    cleanProps,
    normalizedChildren,
    childFlags,
    className,
  )
}

/**
 * jsxs() -- called by the automatic JSX transform for elements with multiple children.
 * The children prop is already an array.
 */
export function jsxs(
  type: VNodeType,
  props: Record<string, unknown>,
  key?: string | number,
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

  const resolvedKey = key !== undefined ? key : null

  // Extract children and className from props without object spread
  const rawChildren = props["children"] as Array<VNode | string | number>
  let className: string | null = null
  const cn = props["className"]
  if (cn !== undefined && cn !== null) {
    className = cn as string
  }

  // Build clean props without children/className
  let cleanProps: Record<string, unknown> | null = null
  for (const k in props) {
    if (k !== "children" && k !== "className") {
      if (cleanProps === null) cleanProps = {}
      cleanProps[k] = props[k]
    }
  }

  let normalizedChildren: VNode[] | VNode | string | null
  let childFlags: ChildFlag

  if (!rawChildren || rawChildren.length === 0) {
    normalizedChildren = null
    childFlags = ChildFlags.NoChildren
  } else {
    const vnodes: VNode[] = []
    let hasKeys = false
    let hasNoKeys = false

    for (let i = 0; i < rawChildren.length; i++) {
      const child = rawChildren[i]
      // Replace falsy children with empty text placeholders to keep child count
      // stable across renders (JSX conditional expressions like {cond && <X/>})
      if (child === null || child === undefined || typeof child === "boolean") {
        vnodes.push(createTextVNode(""))
        hasNoKeys = true
        continue
      }
      if (typeof child === "string" || typeof child === "number") {
        vnodes.push(createTextVNode(String(child)))
        hasNoKeys = true
      } else {
        vnodes.push(child as VNode)
        if ((child as VNode).key !== null) {
          hasKeys = true
        } else {
          hasNoKeys = true
        }
      }
    }

    if (__DEV__ && hasKeys) {
      const seen = new Set<string | number>()
      for (let i = 0; i < vnodes.length; i++) {
        const k = vnodes[i]!.key
        if (k !== null) {
          if (seen.has(k)) {
            warn(
              `Duplicate key "${String(k)}" found in children. Keys must be unique among siblings. This may cause incorrect updates.`,
            )
            break
          }
          seen.add(k)
        }
      }
    }

    normalizedChildren = vnodes
    childFlags =
      hasKeys && !hasNoKeys ? ChildFlags.HasKeyedChildren : ChildFlags.HasNonKeyedChildren
  }

  return acquireVNode(
    flags,
    type,
    resolvedKey,
    cleanProps,
    normalizedChildren,
    childFlags,
    className,
  )
}
