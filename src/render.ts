/**
 * Top-level render API.
 *
 * Handles initial mount vs subsequent patches automatically.
 * Tracks which VNode tree is currently rendered in each container.
 *
 * Also provides React 18 root APIs (createRoot, hydrateRoot) for compat.
 */

import { __DEV__ } from "./dev"
import { __devtools_notifyRender, __devtools_setRootTrees } from "./devtools-hook"
import { patch } from "./diff"
import { mountRoot } from "./mount"
import { rootTrees } from "./root-trees"
import { unmount } from "./unmount"
import type { VNode } from "./vnode"

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

// --- React 18 Root API ---

export interface Root {
  render(children: VNode): void
  unmount(): void
}

/**
 * Create a React 18-style root for concurrent-mode rendering.
 *
 * Usage:
 *   const root = createRoot(document.getElementById("app")!)
 *   root.render(h(App, null))
 *   root.unmount()
 *
 * @param container - The DOM element to render into
 * @returns A Root object with render() and unmount() methods
 */
export function createRoot(container: Element): Root {
  return {
    render(children: VNode): void {
      render(children, container)
    },
    unmount(): void {
      render(null!, container)
    },
  }
}
