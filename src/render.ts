/**
 * Top-level render API.
 *
 * Handles initial mount vs subsequent patches automatically.
 * Tracks which VNode tree is currently rendered in each container.
 */

import { patch } from "./diff"
import { __DEV__ } from "./dev"
import { __devtools_notifyRender, __devtools_setRootTrees } from "./devtools-hook"
import { mountRoot } from "./mount"
import { unmount } from "./unmount"
import type { VNode } from "./vnode"

const rootTrees = new WeakMap<Element, VNode>()

// Share rootTrees with the devtools hook so it can walk the tree
if (__DEV__) {
  __devtools_setRootTrees(rootTrees)
}

/**
 * Render a VNode tree into a container element.
 *
 * On first call for a given container, mounts the tree.
 * On subsequent calls, patches the existing tree to match the new one.
 * Pass null to unmount the current tree.
 *
 * @param vnode - The VNode tree to render, or null to unmount
 * @param container - The DOM element to render into
 */
export function render(vnode: VNode | null, container: Element): void {
  const existing = rootTrees.get(container)

  if (vnode === null) {
    // Unmount
    if (existing !== undefined) {
      unmount(existing, container)
      rootTrees.delete(container)
    }
    return
  }

  if (existing !== undefined) {
    // Patch
    patch(existing, vnode, container)
    rootTrees.set(container, vnode)
  } else {
    // Initial mount
    mountRoot(vnode, container)
    rootTrees.set(container, vnode)
  }

  if (__DEV__) {
    __devtools_notifyRender(container)
  }
}
