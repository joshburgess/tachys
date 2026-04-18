/**
 * forwardRef wrapper for passing ref as a second argument.
 *
 * In Tachys, ref is already passed through props to components.
 * forwardRef provides React API compatibility by splitting ref out
 * of props and passing it as a separate argument to the render function.
 */

import type { Ref } from "./ref"
import type { ComponentFn } from "./vnode"
import type { VNode } from "./vnode"

/**
 * Internal interface for a forwardRef-wrapped component.
 */
export interface ForwardRefFn extends ComponentFn {
  _forwardRef: true
  _render: (props: Record<string, unknown>, ref: Ref | undefined) => VNode
}

/**
 * Wrap a component so it receives `ref` as a second argument instead
 * of inside `props`.
 *
 * @param render - A function `(props, ref) => VNode`
 * @returns A component function that extracts ref from props and
 *          passes it to render
 */
export function forwardRef(
  render: (props: Record<string, unknown>, ref: Ref | undefined) => VNode,
): ComponentFn {
  const forwarded = (props: Record<string, unknown>): VNode => {
    const ref = props["ref"] as Ref | undefined
    if (ref !== undefined) {
      // Strip ref from props (for...in avoids Object.keys allocation)
      const clean: Record<string, unknown> = {}
      for (const k in props) {
        if (k !== "ref") clean[k] = props[k]
      }
      return render(clean, ref)
    }
    return render(props, undefined)
  }
  ;(forwarded as unknown as ForwardRefFn)._forwardRef = true
  ;(forwarded as unknown as ForwardRefFn)._render = render
  return forwarded
}
