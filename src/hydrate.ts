/**
 * Client-side hydration for Phasm.
 *
 * hydrate(vnode, container) walks server-rendered DOM and attaches
 * event listeners, component instances, and refs without re-creating
 * DOM elements. After hydration, the VNode tree is fully live and
 * subsequent updates use the normal patch/diff path.
 *
 * Usage:
 *   import { hydrate } from "phasm/server"
 *   hydrate(h(App, null), document.getElementById("app")!)
 */

import { finalizeHydratedComponent, hydrateComponentInstance, resetIdCounter } from "./component"
import { ChildFlags, VNodeFlags } from "./flags"
import { mountInternal } from "./mount"
import { mountProps, setRootContainer } from "./patch"
import { setRef } from "./ref"
import type { VNode } from "./vnode"

/**
 * Hydrate a server-rendered DOM tree with a VNode tree.
 *
 * Walks existing DOM nodes and matches them to the VNode tree,
 * attaching event listeners and creating component instances.
 * After hydration, the app is interactive and further updates
 * use the normal diff/patch path.
 *
 * @param vnode - The VNode tree (same tree used for renderToString)
 * @param container - The DOM element containing the server-rendered HTML
 */
export function hydrate(vnode: VNode, container: Element): void {
  resetIdCounter()
  setRootContainer(container)
  hydrateNode(vnode, container, container.firstChild)
}

/**
 * Hydrate a single VNode against an existing DOM node.
 * Returns the next sibling DOM node to process.
 */
function hydrateNode(
  vnode: VNode,
  parentDom: Element,
  domNode: ChildNode | null,
): ChildNode | null {
  const flags = vnode.flags

  if ((flags & VNodeFlags.Element) !== 0) {
    return hydrateElement(vnode, parentDom, domNode)
  }

  if ((flags & VNodeFlags.Text) !== 0) {
    return hydrateText(vnode, parentDom, domNode)
  }

  if ((flags & VNodeFlags.Component) !== 0) {
    return hydrateComponent(vnode, parentDom, domNode)
  }

  if ((flags & VNodeFlags.Fragment) !== 0) {
    return hydrateFragment(vnode, parentDom, domNode)
  }

  return domNode
}

function hydrateElement(
  vnode: VNode,
  parentDom: Element,
  domNode: ChildNode | null,
): ChildNode | null {
  if (domNode === null || domNode.nodeType !== 1) {
    // Mismatch: fall back to mount
    mountFallback(vnode, parentDom, domNode)
    return domNode
  }

  const dom = domNode as Element
  vnode.dom = dom
  vnode.parentDom = parentDom

  const isSvg = (vnode.flags & VNodeFlags.Svg) !== 0

  // Attach event listeners and other client-only props (skip attributes
  // that are already in the HTML). We only need events and refs.
  const props = vnode.props
  if (props !== null) {
    // Mount event handlers (they start with "on")
    for (const key in props) {
      if (key.charCodeAt(0) === 111 && key.charCodeAt(1) === 110) {
        // Event handler: attach via mountProps path
        mountProps(dom, { [key]: props[key] }, isSvg)
      }
    }

    // Attach ref
    if (props["ref"] !== undefined) {
      setRef(props["ref"], dom)
    }
  }

  // Hydrate children
  const childFlags = vnode.childFlags
  if (
    childFlags === ChildFlags.HasSingleChild ||
    childFlags === ChildFlags.HasKeyedChildren ||
    childFlags === ChildFlags.HasNonKeyedChildren
  ) {
    hydrateChildren(vnode, dom)
  }

  return domNode.nextSibling
}

function hydrateText(
  vnode: VNode,
  parentDom: Element,
  domNode: ChildNode | null,
): ChildNode | null {
  if (domNode === null || domNode.nodeType !== 3) {
    mountFallback(vnode, parentDom, domNode)
    return domNode
  }

  vnode.dom = domNode as Text
  vnode.parentDom = parentDom

  // Update text content if it doesn't match (shouldn't happen normally)
  if (domNode.textContent !== vnode.children) {
    domNode.textContent = vnode.children as string
  }

  return domNode.nextSibling
}

function hydrateComponent(
  vnode: VNode,
  parentDom: Element,
  domNode: ChildNode | null,
): ChildNode | null {
  // Hydration-aware component mount: create the instance and render the
  // component (setting up hooks), then walk existing DOM for the rendered
  // output instead of creating new elements.
  const { rendered, instance } = hydrateComponentInstance(vnode, parentDom)

  // Hydrate the rendered VNode tree against existing DOM
  const next = hydrateNode(rendered, parentDom, domNode)

  // Finalize: set dom reference, mark mounted, run effects
  finalizeHydratedComponent(vnode, instance, rendered)

  return next
}

function hydrateFragment(
  vnode: VNode,
  parentDom: Element,
  domNode: ChildNode | null,
): ChildNode | null {
  vnode.parentDom = parentDom

  const childFlags = vnode.childFlags

  if (childFlags === ChildFlags.HasSingleChild) {
    const child = vnode.children as VNode
    const next = hydrateNode(child, parentDom, domNode)
    vnode.dom = child.dom
    return next
  }

  if (childFlags === ChildFlags.HasKeyedChildren || childFlags === ChildFlags.HasNonKeyedChildren) {
    const children = vnode.children as VNode[]
    let cursor = domNode
    for (let i = 0; i < children.length; i++) {
      cursor = hydrateNode(children[i]!, parentDom, cursor)
    }
    vnode.dom = children[0]!.dom
    return cursor
  }

  if (childFlags === ChildFlags.HasTextChildren) {
    if (domNode !== null && domNode.nodeType === 3) {
      vnode.dom = domNode as Text
      return domNode.nextSibling
    }
  }

  // Empty fragment
  vnode.dom = domNode as Element | Text | null
  return domNode
}

function hydrateChildren(vnode: VNode, dom: Element): void {
  const childFlags = vnode.childFlags
  let cursor: ChildNode | null = dom.firstChild

  if (childFlags === ChildFlags.HasSingleChild) {
    hydrateNode(vnode.children as VNode, dom, cursor)
  } else if (
    childFlags === ChildFlags.HasKeyedChildren ||
    childFlags === ChildFlags.HasNonKeyedChildren
  ) {
    const children = vnode.children as VNode[]
    for (let i = 0; i < children.length; i++) {
      cursor = hydrateNode(children[i]!, dom, cursor)
    }
  }
}

/**
 * Fallback: when hydration encounters a mismatch, mount the VNode fresh.
 */
function mountFallback(vnode: VNode, parentDom: Element, before: ChildNode | null): void {
  mountInternal(vnode, parentDom, false)
  // Move the mounted node before the current position if needed
  if (before !== null && vnode.dom !== null) {
    parentDom.insertBefore(vnode.dom, before)
  }
}
