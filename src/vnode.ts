/**
 * VNode class -- the core virtual DOM node representation.
 *
 * All properties are initialized in the constructor in a fixed order
 * to ensure V8 hidden class stability. The class has exactly 9 properties,
 * staying within V8's in-object property threshold.
 *
 * `className` is stored as a top-level field (extracted from props at
 * creation time) so mount/patch can apply it via direct property write
 * (`dom.className = ...`) without going through the props loop.
 */

export type VNodeType = string | ((props: Record<string, unknown>) => VNode) | null

/** Component function signature. */
export type ComponentFn = (props: Record<string, unknown>) => VNode

/** Props containing dangerouslySetInnerHTML. */
export interface DangerousInnerHTML {
  __html: string
}

/**
 * Virtual DOM node. Instantiated via the `h()` JSX factory, not directly.
 *
 * A single class is used for all node kinds (text, element, component, fragment)
 * with `flags` and `childFlags` as runtime discriminants. This preserves V8
 * hidden class stability across all VNode instances and enables object pooling.
 *
 * Use the type guard functions below to narrow the type at access sites.
 */
export class VNode {
  flags: VNodeFlag
  type: VNodeType
  key: string | number | null
  props: Record<string, unknown> | null
  children: VNode[] | VNode | string | null
  dom: Element | Text | null
  childFlags: ChildFlag
  parentDom: Element | null
  className: string | null

  constructor(
    flags: VNodeFlag,
    type: VNodeType,
    key: string | number | null,
    props: Record<string, unknown> | null,
    children: VNode[] | VNode | string | null,
    childFlags: ChildFlag,
    className: string | null,
  ) {
    this.flags = (flags | 0) as VNodeFlag
    this.type = type
    this.key = key
    this.props = props
    this.children = children
    this.dom = null
    this.childFlags = (childFlags | 0) as ChildFlag
    this.parentDom = null
    this.className = className
  }
}

// --- Type narrowing guards ---
// These provide type-safe access to VNode fields based on flags/childFlags.
// They are purely compile-time -- at runtime they're just the bitwise check
// that was already being performed.

import type { ChildFlag, VNodeFlag } from "./flags"
import { ChildFlags, VNodeFlags } from "./flags"

/** Narrow a VNode known to be a text node. */
export function isTextVNode(v: VNode): v is VNode & { type: null; children: string } {
  return (v.flags & VNodeFlags.Text) !== 0
}

/** Narrow a VNode known to be an element node. */
export function isElementVNode(v: VNode): v is VNode & { type: string; dom: Element | null } {
  return (v.flags & VNodeFlags.Element) !== 0
}

/** Narrow a VNode known to be a component node. */
export function isComponentVNode(v: VNode): v is VNode & { type: ComponentFn } {
  return (v.flags & VNodeFlags.Component) !== 0
}

/** Narrow a VNode known to be a fragment node. */
export function isFragmentVNode(v: VNode): v is VNode & { type: null } {
  return (v.flags & VNodeFlags.Fragment) !== 0
}

/** Narrow children when childFlags indicates a single VNode child. */
export function hasSingleChild(v: VNode): v is VNode & { children: VNode } {
  return v.childFlags === ChildFlags.HasSingleChild
}

/** Narrow children when childFlags indicates array children. */
export function hasArrayChildren(v: VNode): v is VNode & { children: VNode[] } {
  return (
    v.childFlags === ChildFlags.HasKeyedChildren || v.childFlags === ChildFlags.HasNonKeyedChildren
  )
}

/** Narrow children when childFlags indicates text children. */
export function hasTextChildren(v: VNode): v is VNode & { children: string } {
  return v.childFlags === ChildFlags.HasTextChildren
}
