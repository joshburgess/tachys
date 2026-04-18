/**
 * VNode object pooling / arena allocator.
 *
 * Maintains a free list of VNode objects. When creating a VNode, pop from the
 * pool if available. When unmounting, reset properties and push back.
 *
 * Pool size is capped to prevent unbounded memory growth.
 * All properties are reset to their initial types to maintain hidden class consistency.
 */

import { R } from "./render-state"
import type { ChildFlag, VNodeFlag } from "./flags"
import type { VNodeType } from "./vnode"
import { VNode } from "./vnode"

const MAX_POOL_SIZE = 10000
const pool: VNode[] = []

/**
 * Acquire a VNode from the pool or create a new one.
 *
 * @returns A VNode with all properties set
 */
export function acquireVNode(
  flags: VNodeFlag,
  type: VNodeType,
  key: string | number | null,
  props: Record<string, unknown> | null,
  children: VNode[] | VNode | string | null,
  childFlags: ChildFlag,
  className: string | null,
): VNode {
  const pooled = pool.pop()
  if (pooled !== undefined) {
    pooled.flags = (flags | 0) as VNodeFlag
    pooled.type = type
    pooled.key = key
    pooled.props = props
    pooled.children = children
    pooled.dom = null
    pooled.childFlags = (childFlags | 0) as ChildFlag
    pooled.parentDom = null
    pooled.className = className
    pooled.instance = null
    return pooled
  }
  return new VNode(flags, type, key, props, children, childFlags, className)
}

/**
 * Release a VNode back to the pool.
 * Resets all properties to their initial types for hidden class stability.
 *
 * During Transition-lane rendering (isCollecting), releases are skipped
 * entirely. Abandoned Transitions restore VNode state from closures that
 * reference the old VNodes; if those VNodes were pooled and reused, the
 * restored tree would point to corrupted objects. Skipping the release
 * lets the old VNodes be garbage collected normally on commit (when they
 * are no longer referenced) or remain intact on abandonment.
 *
 * @param vnode - The VNode to release
 */
export function releaseVNode(vnode: VNode): void {
  if (R.collecting) return
  if (pool.length >= MAX_POOL_SIZE) return

  // Null out reference-holding properties to prevent memory leaks.
  // Non-reference properties (flags, childFlags) and key/className (primitives)
  // don't need clearing -- acquireVNode will overwrite them.
  vnode.type = null
  vnode.props = null
  vnode.children = null
  vnode.dom = null
  vnode.parentDom = null
  vnode.instance = null

  pool.push(vnode)
}

/**
 * Get the current pool size (for testing/diagnostics).
 */
export function getPoolSize(): number {
  return pool.length
}

/**
 * Clear the pool (for testing).
 */
export function clearPool(): void {
  pool.length = 0
}
