/**
 * Shared root-tree map.
 *
 * Tracks the latest VNode rendered into each root container. Lives in its
 * own module so `render.ts` (createRoot/render) and `hydrate-root.ts`
 * (hydrateRoot) can read/write the same map without one importing the
 * other, which keeps `tachys/hydrate` tree-shakeable as a separate entry.
 */

import type { VNode } from "./vnode"

export const rootTrees = new WeakMap<Element, VNode>()
