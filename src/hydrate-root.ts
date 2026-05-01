/**
 * `hydrateRoot` entry — public surface of the `tachys/hydrate` subpath.
 *
 * Lives in its own module so production apps that don't use SSR/hydration
 * pay zero bytes for the hydrate code path. The shared `rootTrees` map
 * is imported separately so `render`, `createRoot`, and `hydrateRoot` all
 * write to the same store without forcing them into one bundle.
 */

import { __DEV__ } from "./dev"
import { __devtools_notifyRender } from "./devtools-hook"
import { hydrate } from "./hydrate"
import { type Root, render } from "./render"
import { rootTrees } from "./root-trees"
import type { VNode } from "./vnode"

export type { Root } from "./render"

/**
 * Create a root and hydrate server-rendered content.
 *
 * Usage:
 *   const root = hydrateRoot(document.getElementById("app")!, h(App, null))
 *
 * @param container - The DOM element containing server-rendered HTML
 * @param initialChildren - The VNode tree matching the server-rendered content
 * @returns A Root object with render() and unmount() methods
 */
export function hydrateRoot(container: Element, initialChildren: VNode): Root {
  hydrate(initialChildren, container)
  rootTrees.set(container, initialChildren)

  if (__DEV__) {
    __devtools_notifyRender(container)
  }

  return {
    render(children: VNode): void {
      render(children, container)
    },
    unmount(): void {
      render(null!, container)
    },
  }
}
