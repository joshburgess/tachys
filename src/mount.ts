/**
 * Initial mount logic -- turns a VNode tree into real DOM nodes.
 *
 * Each VNode type has a dedicated mount function to keep call sites
 * monomorphic for V8 IC optimization.
 *
 * className is applied as a direct property write (dom.className = ...)
 * from the VNode's top-level className field, bypassing the props loop.
 *
 * Children dispatch is inlined directly in mountElement to avoid extra
 * function call overhead on the hot path (~6000 calls per 1000 rows).
 */

import {
  drainPassiveEffects,
  hasPendingPassiveEffects,
  mountComponent as mountComp,
} from "./component"
import { pushAppend } from "./effects"
import { ChildFlags, VNodeFlags } from "./flags"
import { mountProps, setRootContainer } from "./patch"
import { registerMount } from "./reconcile-bridge"
import { setRef } from "./ref"
import { R } from "./render-state"
import type { DangerousInnerHTML, VNode } from "./vnode"

const SVG_NS = "http://www.w3.org/2000/svg"

/**
 * Mount a VNode tree into a parent DOM element.
 *
 * Public entry point -- sets root container for event delegation.
 */
export function mount(vnode: VNode, parentDom: Element, isSvg?: boolean): void {
  setRootContainer(parentDom)
  mountInternal(vnode, parentDom, isSvg ?? false)
  // Drain passive effects queued during mount so callers see a quiescent
  // state on return. Component-driven child mounts (via the bridge) go
  // through mountInternal directly and don't trigger this drain.
  if (hasPendingPassiveEffects()) drainPassiveEffects()
}

/**
 * Top-level mount entry point. Alias for mount() with no SVG context.
 */
export function mountRoot(vnode: VNode, parentDom: Element): void {
  setRootContainer(parentDom)
  mountInternal(vnode, parentDom, false)
  if (hasPendingPassiveEffects()) drainPassiveEffects()
}

/**
 * Internal mount dispatch. Uses boolean isSvg (not optional) to avoid
 * the ?? coercion on every recursive call.
 */
export function mountInternal(vnode: VNode, parentDom: Element, isSvg: boolean): void {
  const flags = vnode.flags

  if ((flags & VNodeFlags.Element) !== 0) {
    mountElement(vnode, parentDom, isSvg)
  } else if ((flags & VNodeFlags.Text) !== 0) {
    const dom = document.createTextNode(vnode.children as string)
    vnode.dom = dom
    vnode.parentDom = parentDom
    if (R.collecting) {
      pushAppend(parentDom, dom)
    } else {
      parentDom.appendChild(dom)
    }
  } else if ((flags & VNodeFlags.Component) !== 0) {
    mountComp(vnode, parentDom, isSvg)
  } else if ((flags & VNodeFlags.Fragment) !== 0) {
    mountFragment(vnode, parentDom, isSvg)
  }
}

// Register with the bridge so component.ts can call mountInternal without a direct import.
registerMount(mountInternal)

/**
 * Mount an element VNode.
 *
 * Children dispatch is inlined here (no mountChildren/mountArrayChildren calls)
 * to eliminate function call overhead on the creation hot path.
 *
 * Ordering: createElement -> className -> children (off-DOM) -> appendChild ->
 * remaining props -> ref.
 */
function mountElement(vnode: VNode, parentDom: Element, isSvg: boolean): void {
  const type = vnode.type as string

  // Propagate SVG context
  if ((vnode.flags & VNodeFlags.Svg) !== 0) {
    isSvg = true
  }

  // Create DOM element
  const dom = isSvg ? document.createElementNS(SVG_NS, type) : document.createElement(type)

  // className fast path -- direct property write, bypasses patchProp
  const cn = vnode.className
  if (cn !== null) {
    if (isSvg) {
      dom.setAttribute("class", cn)
    } else {
      ;(dom as HTMLElement).className = cn
    }
  }

  // foreignObject exits SVG context for its children
  // Short-circuit: skip string comparison when not in SVG (99% of cases)
  const childSvg = isSvg && type !== "foreignObject"

  vnode.dom = dom
  vnode.parentDom = parentDom

  // Inlined children dispatch -- ordered by frequency for branch prediction
  const childFlags = vnode.childFlags
  if (childFlags === ChildFlags.HasSingleChild) {
    mountInternal(vnode.children as VNode, dom, childSvg)
  } else if (childFlags === ChildFlags.HasTextChildren) {
    dom.textContent = vnode.children as string
  } else if (
    childFlags === ChildFlags.HasKeyedChildren ||
    childFlags === ChildFlags.HasNonKeyedChildren
  ) {
    const children = vnode.children as VNode[]
    for (let i = 0; i < children.length; i++) {
      mountInternal(children[i]!, dom, childSvg)
    }
  } else if (childFlags === ChildFlags.NoChildren) {
    // dangerouslySetInnerHTML: only checked when no children (rare path)
    const props = vnode.props
    if (props !== null && props["dangerouslySetInnerHTML"] !== undefined) {
      dom.innerHTML = (props["dangerouslySetInnerHTML"] as DangerousInnerHTML).__html
    }
  }

  // Append to parent (after children are mounted, batching DOM insertion)
  if (R.collecting) {
    pushAppend(parentDom, dom)
  } else {
    parentDom.appendChild(dom)
  }

  // Set remaining props (events, attributes, etc.)
  const props = vnode.props
  if (props !== null) {
    mountProps(dom, props, childSvg)

    // Set ref after DOM is in the tree
    if (props["ref"] !== undefined) {
      setRef(props["ref"], dom)
    }
  }
}

/**
 * Mount a fragment VNode -- mounts all children directly into the parent.
 */
function mountFragment(vnode: VNode, parentDom: Element, isSvg: boolean): void {
  vnode.parentDom = parentDom

  const childFlags = vnode.childFlags

  if (childFlags === ChildFlags.HasSingleChild) {
    const child = vnode.children as VNode
    mountInternal(child, parentDom, isSvg)
    vnode.dom = child.dom
  } else if (
    childFlags === ChildFlags.HasKeyedChildren ||
    childFlags === ChildFlags.HasNonKeyedChildren
  ) {
    const children = vnode.children as VNode[]
    for (let i = 0; i < children.length; i++) {
      mountInternal(children[i]!, parentDom, isSvg)
    }
    vnode.dom = children[0]!.dom
  } else if (childFlags === ChildFlags.HasTextChildren) {
    const dom = document.createTextNode(vnode.children as string)
    vnode.dom = dom
    if (R.collecting) {
      pushAppend(parentDom, dom)
    } else {
      parentDom.appendChild(dom)
    }
  } else {
    // Empty fragment -- use an empty text node as placeholder
    const dom = document.createTextNode("")
    vnode.dom = dom
    if (R.collecting) {
      pushAppend(parentDom, dom)
    } else {
      parentDom.appendChild(dom)
    }
  }
}
