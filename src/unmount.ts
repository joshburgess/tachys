/**
 * Teardown and cleanup — removes DOM nodes and clears VNode references.
 *
 * Separate functions per VNode type keep call sites monomorphic.
 */

import { getComponentInstance, unmountComponent as unmountComp } from "./component"
import { cleanupEvents } from "./events"
import { ChildFlags, VNodeFlags } from "./flags"
import { releaseVNode } from "./pool"
import { registerUnmount } from "./reconcile-bridge"
import { clearRef } from "./ref"
import type { VNode } from "./vnode"

/**
 * Unmount a VNode tree and remove its DOM node from the parent.
 *
 * @param vnode - The VNode to unmount
 * @param parentDom - The parent DOM element to remove from
 */
export function unmount(vnode: VNode, parentDom: Element): void {
  const flags = vnode.flags

  if ((flags & VNodeFlags.Element) !== 0) {
    unmountElement(vnode, parentDom)
  } else if ((flags & VNodeFlags.Text) !== 0) {
    // Inlined text unmount -- avoids function call overhead on leaf nodes
    if (vnode.dom !== null) {
      parentDom.removeChild(vnode.dom)
    }
    releaseVNode(vnode)
  } else if ((flags & VNodeFlags.Component) !== 0) {
    unmountComp(vnode, parentDom)
  } else if ((flags & VNodeFlags.Fragment) !== 0) {
    unmountFragment(vnode, parentDom)
  }
}

// Register with the bridge so component.ts can call unmount without a direct import.
registerUnmount(unmount)

/**
 * Remove a VNode's DOM node from its parent without recursing into children.
 * Used during diffing when replacing one node with another.
 */
export function removeVNodeDOM(vnode: VNode, parentDom: Element): void {
  const dom = vnode.dom
  if (dom !== null) {
    parentDom.removeChild(dom)
  }
}

function unmountElement(vnode: VNode, parentDom: Element): void {
  const dom = vnode.dom

  // Clear ref (guard behind props null check)
  const props = vnode.props
  if (props !== null && props["ref"] !== undefined) {
    clearRef(props["ref"])
  }

  // Clean up delegated event handlers -- skip if no __phasm (avoids function call for
  // elements that never had events, which is the common case for <td>, <a>, etc.)
  if (dom !== null && (dom as Element).__phasm != null) {
    cleanupEvents(dom as Element)
  }

  // Recursively unmount children (without removing from DOM -- parent removal handles it)
  unmountChildren(vnode)

  // Remove from parent DOM
  if (dom !== null) {
    parentDom.removeChild(dom)
  }

  // Release to pool (resets all properties)
  releaseVNode(vnode)
}

function unmountFragment(vnode: VNode, parentDom: Element): void {
  const childFlags = vnode.childFlags

  if (childFlags === ChildFlags.HasSingleChild) {
    unmount(vnode.children as VNode, parentDom)
  } else if (
    childFlags === ChildFlags.HasKeyedChildren ||
    childFlags === ChildFlags.HasNonKeyedChildren
  ) {
    const children = vnode.children as VNode[]
    for (let i = 0; i < children.length; i++) {
      unmount(children[i]!, parentDom)
    }
  } else if (vnode.dom !== null) {
    // Text or empty fragment placeholder
    parentDom.removeChild(vnode.dom)
  }

  releaseVNode(vnode)
}

/**
 * Recursively unmount children without removing them from the DOM.
 * Used when the parent element itself is being removed.
 */
export function unmountChildren(vnode: VNode): void {
  const childFlags = vnode.childFlags

  if (childFlags === ChildFlags.NoChildren || childFlags === ChildFlags.HasTextChildren) {
    return
  }

  if (childFlags === ChildFlags.HasSingleChild) {
    clearVNodeTree(vnode.children as VNode)
  } else {
    const children = vnode.children as VNode[]
    for (let i = 0; i < children.length; i++) {
      clearVNodeTree(children[i]!)
    }
  }
}

/**
 * Clear DOM references from a VNode tree without touching the actual DOM.
 * The DOM nodes will be garbage collected when the parent is removed.
 */
function clearVNodeTree(vnode: VNode): void {
  const flags = vnode.flags

  if ((flags & VNodeFlags.Element) !== 0) {
    if (vnode.dom !== null && (vnode.dom as Element).__phasm != null) {
      cleanupEvents(vnode.dom as Element)
    }
    unmountChildren(vnode)
    releaseVNode(vnode)
  } else if ((flags & VNodeFlags.Text) !== 0) {
    releaseVNode(vnode)
  } else if ((flags & VNodeFlags.Component) !== 0) {
    // Run effect cleanups for the component
    const instance = getComponentInstance(vnode)
    if (instance !== undefined) {
      for (let i = 0; i < instance._effects.length; i++) {
        const effect = instance._effects[i]!
        if (effect.cleanup !== null) {
          effect.cleanup()
        }
      }
    }
    const rendered = vnode.children as VNode | null
    if (rendered !== null) {
      clearVNodeTree(rendered)
    }
    releaseVNode(vnode)
  } else if ((flags & VNodeFlags.Fragment) !== 0) {
    const childFlags = vnode.childFlags
    if (childFlags === ChildFlags.HasSingleChild) {
      clearVNodeTree(vnode.children as VNode)
    } else if (
      childFlags === ChildFlags.HasKeyedChildren ||
      childFlags === ChildFlags.HasNonKeyedChildren
    ) {
      const children = vnode.children as VNode[]
      for (let i = 0; i < children.length; i++) {
        clearVNodeTree(children[i]!)
      }
    }
    releaseVNode(vnode)
  }
}
