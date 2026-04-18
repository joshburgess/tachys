/**
 * Late-binding bridge to break the circular dependency between
 * component.ts, diff.ts, and mount.ts.
 *
 * component.ts needs to call patch() from diff.ts and mountInternal()
 * from mount.ts. But diff.ts imports patchComponent from component.ts,
 * and mount.ts imports mountComponent from component.ts -- creating a
 * cycle that Rollup warns about.
 *
 * This module holds function references that diff.ts and mount.ts
 * register at module init time. component.ts imports from here instead
 * of directly from diff.ts/mount.ts, breaking the cycle.
 *
 * The functions are always registered before any component code runs
 * because diff.ts and mount.ts are loaded as part of the module graph
 * before any rendering can happen.
 */

import type { VNode } from "./vnode"

type PatchFn = (oldVNode: VNode, newVNode: VNode, parentDom: Element) => void
type MountFn = (vnode: VNode, parentDom: Element, isSvg: boolean) => void
type UnmountFn = (vnode: VNode, parentDom: Element) => void
// biome-ignore lint/suspicious/noExplicitAny: ComponentInstance type lives in component.ts; bridge stays type-agnostic to avoid cycle.
type RerenderFn = (instance: any) => void

let _patch: PatchFn
let _mount: MountFn
let _unmount: UnmountFn
let _rerender: RerenderFn

/** Called by diff.ts at module init to register the patch function. */
export function registerPatch(fn: PatchFn): void {
  _patch = fn
}

/** Called by mount.ts at module init to register the mountInternal function. */
export function registerMount(fn: MountFn): void {
  _mount = fn
}

/** Called by unmount.ts at module init to register the unmount function. */
export function registerUnmount(fn: UnmountFn): void {
  _unmount = fn
}

/** Called by component.ts at module init to register the rerender function. */
export function registerRerender(fn: RerenderFn): void {
  _rerender = fn
}

/** Patch two VNodes. Used by component.ts for re-rendering. */
export function bridgePatch(oldVNode: VNode, newVNode: VNode, parentDom: Element): void {
  _patch(oldVNode, newVNode, parentDom)
}

/** Mount a VNode. Used by component.ts for mounting fallbacks. */
export function bridgeMount(vnode: VNode, parentDom: Element, isSvg: boolean): void {
  _mount(vnode, parentDom, isSvg)
}

/** Unmount a VNode. Used by component.ts for unmounting rendered trees. */
export function bridgeUnmount(vnode: VNode, parentDom: Element): void {
  _unmount(vnode, parentDom)
}

/**
 * Re-render a component instance. Called by scheduler.ts when flushing lane
 * queues -- avoids per-instance `_rerender` closure allocation at mount time.
 *
 * Honours a `_rerender` callback on the instance when present, so tests can
 * still pass a spy/mock via the standard ComponentInstance literal.
 */
// biome-ignore lint/suspicious/noExplicitAny: scheduler only has opaque instance handles here.
export function bridgeRerender(instance: any): void {
  const override = instance._rerender as (() => void) | undefined
  if (override !== undefined) {
    override()
  } else {
    _rerender(instance)
  }
}
