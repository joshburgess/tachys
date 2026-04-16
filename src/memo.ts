/**
 * Component memoization.
 *
 * Wraps a component function so that patchComponent can use a custom
 * comparison function to decide whether to skip re-render.
 *
 * Phasm already applies shallow prop equality by default, so memo()
 * without a custom comparator is effectively a no-op (provided for React
 * API compatibility). The primary value is supporting custom comparators
 * for fine-grained control over re-render skipping.
 */

import type { ComponentFn } from "./vnode"
import type { VNode } from "./vnode"

/**
 * Internal interface for a memo-wrapped component function.
 * The _compare and _inner fields are read by patchComponent.
 */
export interface MemoComponentFn {
  (props: Record<string, unknown>): VNode
  /** Custom comparison function, or null for default shallow equality */
  _compare: ((prev: Record<string, unknown>, next: Record<string, unknown>) => boolean) | null
  /** The original unwrapped component function */
  _inner: ComponentFn
}

/**
 * Memoize a component function.
 *
 * Returns a new component that skips re-rendering when its props have not
 * changed. By default, props are compared with shallow equality (which
 * Phasm already does for all components). Pass a custom `compare`
 * function for fine-grained control.
 *
 * Must be called at module level, not inside a render function, to ensure
 * a stable function reference across renders.
 *
 * @param component - The component function to memoize
 * @param compare - Optional comparison function. Returns true when props
 *                  are considered equal (re-render should be skipped).
 * @returns A memoized component function
 */
export function memo(
  component: ComponentFn,
  compare?: (prevProps: Record<string, unknown>, nextProps: Record<string, unknown>) => boolean,
): ComponentFn {
  const memoized = (props: Record<string, unknown>): VNode => component(props)
  ;(memoized as unknown as MemoComponentFn)._compare = compare ?? null
  ;(memoized as unknown as MemoComponentFn)._inner = component
  return memoized
}

/**
 * Extract the custom comparison function from a memo-wrapped component.
 * Returns undefined if the component is not memo-wrapped.
 */
export function getMemoCompare(
  type: ComponentFn,
): ((prev: Record<string, unknown>, next: Record<string, unknown>) => boolean) | undefined {
  return "_compare" in type ? ((type as MemoComponentFn)._compare ?? undefined) : undefined
}
