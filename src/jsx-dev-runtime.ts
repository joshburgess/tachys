/**
 * JSX dev runtime for Tachys.
 *
 * In development mode, bundlers like Vite resolve `jsx-dev-runtime` instead of
 * `jsx-runtime`. The dev transform calls `jsxDEV` for ALL elements (both single
 * and multi-child), using the `isStaticChildren` flag to distinguish them.
 * We inspect whether children is an array and delegate to `jsx` or `jsxs`.
 */

import { jsx, jsxs, Fragment } from "./jsx-runtime"
import type { VNode, VNodeType } from "./vnode"

export { Fragment }
export type { JSX } from "./jsx-types"

export function jsxDEV(
  type: VNodeType,
  props: Record<string, unknown>,
  key?: string | number,
  _isStaticChildren?: boolean,
  _source?: unknown,
  _self?: unknown,
): VNode {
  const children = props["children"]
  if (Array.isArray(children)) {
    return jsxs(type, props, key)
  }
  return jsx(type, props, key)
}
