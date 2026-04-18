/**
 * Compiled component runtime.
 *
 * Compiled components skip the VDOM tree entirely. A compiled component's
 * function is called ONCE per instance to clone a pre-built DOM template
 * (via `cloneNode`) and wire up dynamic slots. Updates go through a
 * per-component `patch` function that diffs slot values against cached
 * state and writes only what changed. No per-render VNode allocations,
 * no recursion into children.
 *
 * This mirrors what Inferno's `createVNode` + `$HasKeyedChildren` hints
 * and SolidJS's JSX compiler produce at build time.
 *
 * Day-1 validation: components are hand-written. A Babel plugin will
 * generate this shape automatically in a later milestone.
 */

import { ComponentMeta } from "./flags"

/**
 * A compiled component's mount result. `dom` is the root element that gets
 * appended to the parent; `state` carries cached slot values and direct
 * node references for the patch function.
 */
export interface CompiledMount {
  dom: Element
  state: Record<string, unknown>
}

/**
 * Shape of a compiled component function. Called once per instance on
 * mount to build DOM + state. The `patch` method is invoked on prop
 * changes to diff slots.
 */
export interface CompiledComponent {
  (props: Record<string, unknown>): CompiledMount
  patch(state: Record<string, unknown>, props: Record<string, unknown>): void
  _meta: number
  _compare?: (
    prev: Record<string, unknown>,
    next: Record<string, unknown>,
  ) => boolean
}

/**
 * Parse an HTML string once, return a template element that can be
 * cloned cheaply on subsequent calls.
 */
export function _template(html: string): Element {
  const tpl = document.createElement("template")
  tpl.innerHTML = html
  return tpl.content.firstElementChild as Element
}

/**
 * Mark a function as a compiled component and attach its patch method.
 */
export function markCompiled(
  mount: (props: Record<string, unknown>) => CompiledMount,
  patch: (state: Record<string, unknown>, props: Record<string, unknown>) => void,
  compare?: (prev: Record<string, unknown>, next: Record<string, unknown>) => boolean,
): CompiledComponent {
  const fn = mount as CompiledComponent
  fn.patch = patch
  fn._meta = ComponentMeta.Compiled
  if (compare !== undefined) fn._compare = compare
  return fn
}
