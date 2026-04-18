/**
 * React compatibility utilities.
 *
 * Provides cloneElement, Children, and isValidElement for
 * libraries that depend on the React API surface.
 */

import { ChildFlags, VNodeFlags } from "./flags"
import { createTextVNode, h } from "./jsx"
import { acquireVNode } from "./pool"
import type { VNodeType } from "./vnode"
import type { ComponentFn, VNode } from "./vnode"

// Untyped h() call to bypass overload restrictions in cloneElement
const hAny = h as (
  type: VNodeType,
  props: Record<string, unknown> | null,
  ...children: Array<VNode | string | number | null | undefined>
) => VNode

/**
 * Check whether a value is a valid Tachys element (VNode).
 */
export function isValidElement(value: unknown): value is VNode {
  return value !== null && typeof value === "object" && "flags" in value && "dom" in value
}

/**
 * Clone a VNode with optional overridden props and children.
 *
 * Follows React's cloneElement semantics:
 * - Original props are shallowly merged with new props
 * - key and ref from new props override the original
 * - If new children are provided, they replace the original children
 */
export function cloneElement(
  element: VNode,
  props?: Record<string, unknown> | null,
  ...children: Array<VNode | string | number | null | undefined>
): VNode {
  // Merge props, skipping key/className (handled separately)
  let mergedProps: Record<string, unknown> | null = null
  if (element.props !== null) {
    for (const k in element.props) {
      if (k !== "key" && k !== "className") {
        if (mergedProps === null) mergedProps = {}
        mergedProps[k] = element.props[k]
      }
    }
  }
  if (props !== null && props !== undefined) {
    for (const k in props) {
      if (k !== "key" && k !== "className") {
        if (mergedProps === null) mergedProps = {}
        mergedProps[k] = props[k]
      }
    }
  }

  // Key: new props override, otherwise keep original
  const key =
    props !== null && props !== undefined && "key" in props
      ? (props["key"] as string | number | null)
      : element.key

  // className: new props override, otherwise keep original
  const className =
    props !== null && props !== undefined && "className" in props
      ? (props["className"] as string | null)
      : element.className

  // Children: if provided, use them; otherwise keep original
  if (children.length > 0) {
    const hProps: Record<string, unknown> = mergedProps !== null ? { ...mergedProps } : {}
    if (key !== null) hProps["key"] = key
    if (className !== null) hProps["className"] = className
    return hAny(element.type, hProps, ...children)
  }

  // No new children -- preserve original children and childFlags
  return acquireVNode(
    element.flags,
    element.type,
    key,
    mergedProps,
    element.children,
    element.childFlags,
    className,
  )
}

/**
 * React.Children utilities.
 *
 * Operates on the children value from props, which may be:
 * - null/undefined (no children)
 * - a single VNode
 * - a string (text children)
 * - an array of VNodes
 */
export const Children = {
  /**
   * Map over children, calling fn for each child.
   * Null/undefined children are skipped.
   */
  map<T>(
    children: VNode | VNode[] | string | null | undefined,
    fn: (child: VNode, index: number) => T,
  ): T[] {
    if (children == null) return []
    if (typeof children === "string") {
      return [fn(createTextVNode(children), 0)]
    }
    if (Array.isArray(children)) {
      const result: T[] = []
      for (let i = 0; i < children.length; i++) {
        result.push(fn(children[i]!, i))
      }
      return result
    }
    return [fn(children, 0)]
  },

  /**
   * Iterate over children, calling fn for each child.
   */
  forEach(
    children: VNode | VNode[] | string | null | undefined,
    fn: (child: VNode, index: number) => void,
  ): void {
    if (children == null) return
    if (typeof children === "string") {
      fn(createTextVNode(children), 0)
      return
    }
    if (Array.isArray(children)) {
      for (let i = 0; i < children.length; i++) {
        fn(children[i]!, i)
      }
      return
    }
    fn(children, 0)
  },

  /**
   * Count the number of children.
   */
  count(children: VNode | VNode[] | string | null | undefined): number {
    if (children == null) return 0
    if (Array.isArray(children)) return children.length
    return 1
  },

  /**
   * Return the only child, or throw if there are zero or more than one.
   */
  only(children: VNode | VNode[] | string | null | undefined): VNode {
    if (children == null) {
      throw new Error("Children.only expected a single child but received none.")
    }
    if (typeof children === "string") {
      return createTextVNode(children)
    }
    if (Array.isArray(children)) {
      if (children.length !== 1) {
        throw new Error(`Children.only expected a single child but received ${children.length}.`)
      }
      return children[0]!
    }
    return children
  },

  /**
   * Flatten children into an array of VNodes.
   */
  toArray(children: VNode | VNode[] | string | null | undefined): VNode[] {
    if (children == null) return []
    if (typeof children === "string") return [createTextVNode(children)]
    if (Array.isArray(children)) return children.slice()
    return [children]
  },
}
