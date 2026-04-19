/**
 * Component lifecycle management.
 *
 * Functional components with hooks-like state (useState, useEffect).
 * Uses a module-level "current component context" set during render
 * for hook registration.
 */

import type { Context, ProviderFunction } from "./context"
import { __DEV__, getComponentName, warn } from "./dev"
import {
  type ErrorBoundaryFn,
  popErrorHandler,
  propagateRenderError,
  pushErrorHandler,
} from "./error-boundary"
import {
  domAppendChild,
  domRemoveChild,
  pushDeferredEffect,
  pushTransitionRestorer,
} from "./effects"
import { ChildFlags, ComponentMeta, VNodeFlags } from "./flags"
import type { MemoComponentFn } from "./memo"
import {
  bridgeMount as mountInternal,
  bridgePatch as patchVNode,
  bridgeUnmount as unmount,
  registerRerender,
} from "./reconcile-bridge"
import { acquireVNode, releaseVNode } from "./pool"
import type { PortalFn } from "./portal"
import type { CompiledComponent } from "./compiled"
import type { RefObject } from "./ref"
import {
  getCurrentLane,
  Lane,
  runAfterPaint,
  scheduleUpdate,
  setCurrentLane,
  signalTransitionSuspended,
} from "./scheduler"
import {
  isThenable,
  popSuspendHandler,
  propagateSuspend,
  pushSuspendHandler,
} from "./suspense"
import type { ComponentFn } from "./vnode"
import { VNode } from "./vnode"
import { R } from "./render-state"
import { appendAfterWork } from "./work-loop"

// --- Component instance ---

/**
 * Internal component instance — tracks hooks state between renders.
 */
export interface ComponentInstance {
  /** The component function */
  _type: ComponentFn
  /** Current props */
  _props: Record<string, unknown>
  /** The VNode that represents this component in the tree */
  _vnode: VNode
  /** The currently rendered output VNode */
  _rendered: VNode | null
  /** The parent DOM element */
  _parentDom: Element
  /** Bitmask of lanes this instance is queued in (1 << lane) */
  _queuedLanes: number
  /** Hook state slots (useState values) */
  _hooks: HookState[]
  /** Effect entries */
  _effects: EffectEntry[]
  /** Whether this is the initial mount */
  _mounted: boolean
  /**
   * Optional per-instance re-render callback. Production mounts do NOT set
   * this -- the scheduler calls the bridge-registered `rerenderComponent`
   * directly, which avoids the closure allocation (10k rows ≈ 10k fewer
   * closures at mount). Tests may set it to intercept scheduler dispatch.
   */
  _rerender?: () => void
  /** Contexts used by this component (set by useContext) */
  _contexts: ContextDep[] | null
  /** Expected hook count (set on first render, checked on re-renders in dev) */
  _hookCount: number
  /** True while this instance is queued in the pending passive effects list. */
  _passiveQueued: boolean
}

interface HookState {
  value: unknown
  /** Pending state updates tagged with the lane they were scheduled at. */
  pendingUpdates: StateUpdate[] | null
  /**
   * Cached setter for useState/useReducer. Allocated on first render and
   * reused on subsequent renders so the hook's identity is stable and we
   * avoid GC pressure from re-allocating closures each render.
   */
  setter: ((v: unknown) => void) | null
}

/**
 * A pending state update. Discriminated on `kind`:
 *   - "value": a direct replacement value
 *   - "fn": a function (prev) => next (functional useState or useReducer)
 */
type StateUpdate = StateUpdateValue | StateUpdateFn

interface StateUpdateValue {
  kind: "value"
  value: unknown
  lane: Lane
}

interface StateUpdateFn {
  kind: "fn"
  fn: (prev: unknown) => unknown
  lane: Lane
}

interface ContextDep {
  context: Context<unknown>
  value: unknown
}

/** Return type of an effect callback: either nothing or a cleanup function. */
export type EffectCleanup = (() => void) | undefined

interface EffectEntry {
  callback: () => EffectCleanup
  deps: readonly unknown[] | null
  cleanup: (() => void) | null
  pendingRun: boolean
  /**
   * True for useLayoutEffect/useInsertionEffect, false for useEffect. Layout
   * effects fire synchronously before passive effects, matching React's
   * "layout before passive" ordering within a commit.
   */
  isLayout: boolean
}

// --- Current component context (set during render) ---

let currentInstance: ComponentInstance | null = null
let hookIndex = 0
let effectIndex = 0
let stateIndex = 0

/** Apply a single state update to a value. */
function applyUpdate(value: unknown, update: StateUpdate): unknown {
  return update.kind === "fn" ? update.fn(value) : update.value
}

/**
 * Peek at a hook's fully-resolved value without mutating it.
 * Applies all pending updates (regardless of lane) to compute the final value.
 * Used for bail-out checks in setters.
 */
function peekHookState<T>(hook: HookState): T {
  const pending = hook.pendingUpdates
  if (pending === null || pending.length === 0) return hook.value as T

  let value: unknown = hook.value
  for (let i = 0; i < pending.length; i++) {
    value = applyUpdate(value, pending[i]!)
  }
  return value as T
}

/**
 * Resolve a hook's current value by applying pending updates up to the active
 * render lane. Updates at higher lane numbers (lower priority) than the active
 * lane are left pending for a future render pass.
 *
 * When no active lane (idle / first mount), all updates are applied.
 */
function resolveHookState<T>(hook: HookState): T {
  const pending = hook.pendingUpdates
  if (pending === null || pending.length === 0) return hook.value as T

  const lane = R.activeLane
  let value: unknown = hook.value
  let kept: StateUpdate[] | null = null

  for (let i = 0; i < pending.length; i++) {
    const update = pending[i]!
    // Apply updates at or above the current render priority.
    // Lane numbers: lower = higher priority. Idle (-1) means apply all.
    if (lane === -1 || update.lane <= lane) {
      value = applyUpdate(value, update)
    } else {
      // Keep this update for a lower-priority render pass
      if (kept === null) kept = []
      kept.push(update)
    }
  }

  // Commit the resolved value and retain deferred updates
  hook.value = value
  hook.pendingUpdates = kept
  return value as T
}

/**
 * Get the ComponentInstance for a component VNode.
 *
 * The instance is stored directly on the VNode (via the `instance` field)
 * rather than in a WeakMap -- the hot memo-bail path walks ~1000 component
 * vnodes per render in the krausest bench, and two WeakMap ops per bail
 * (get + set) dominated script time. Direct field access is a single
 * hidden-class load; GC is unaffected because releaseVNode() clears the
 * field when the vnode returns to the pool.
 */
export function getComponentInstance(vnode: VNode): ComponentInstance | undefined {
  return (vnode.instance as ComponentInstance | null) ?? undefined
}

// Register rerenderComponent with the bridge so scheduler.ts/hydrate.ts can
// re-enter without each ComponentInstance allocating a closure at mount time.
// `rerenderComponent` is a hoisted function declaration, so this call sees it.
registerRerender(rerenderComponent as (instance: unknown) => void)

// Shared frozen empty arrays used as the initial _hooks / _effects sentinels.
// A component that never calls a hook never allocates a real array -- the
// sentinel's length is 0, reads short-circuit, and the first push site lifts
// the instance onto a per-instance array before mutating. Freezing guarantees
// that any accidental direct `.push` onto the sentinel is caught loudly
// rather than silently corrupting every other instance.
const EMPTY_HOOKS: HookState[] = Object.freeze([] as HookState[]) as HookState[]
const EMPTY_EFFECTS: EffectEntry[] = Object.freeze([] as EffectEntry[]) as EffectEntry[]

/**
 * Mount a functional component — called by mount.ts.
 * Creates a ComponentInstance and renders for the first time.
 */
export function mountComponent(vnode: VNode, parentDom: Element, isSvg: boolean): void {
  const type = vnode.type as ComponentFn
  // Fast path: no JSX children → reuse vnode.props directly (no spread allocation).
  // buildComponentProps only needs to run when children must be spliced in.
  const props =
    vnode.children === null
      ? vnode.props !== null
        ? vnode.props
        : EMPTY_PROPS
      : buildComponentProps(vnode)

  const instance: ComponentInstance = {
    _type: type,
    _props: props,
    _vnode: vnode,
    _rendered: null,
    _parentDom: parentDom,
    _queuedLanes: 0,
    _hooks: EMPTY_HOOKS,
    _effects: EMPTY_EFFECTS,
    _mounted: false,
    _contexts: null,
    _hookCount: -1,
    _passiveQueued: false,
  }

  vnode.instance = instance

  // Consolidated tag lookup: plain components (>>99% of mounts) have no _meta,
  // so this collapses four "_xxx in type" prototype-chain lookups to a single
  // property read that returns 0 and bypasses all four branches.
  const meta = ((type as Partial<{ _meta: number }>)._meta ?? 0) | 0

  // Compiled components skip the VDOM entirely: call the component's mount
  // fn, append its pre-built DOM directly, no hooks / no child recursion.
  if ((meta & ComponentMeta.Compiled) !== 0) {
    const compiled = (type as unknown as CompiledComponent)(props)
    instance._rendered = compiled as unknown as VNode
    domAppendChild(parentDom, compiled.dom)
    vnode.dom = compiled.dom
    vnode.parentDom = parentDom
    return
  }

  // Check if this is a Context Provider
  const providerCtx =
    (meta & ComponentMeta.Provider) !== 0 ? (type as ProviderFunction<unknown>)._context : null
  if (providerCtx !== null) providerCtx._stack.push(props["value"])

  // Check if this is a Portal
  const portalTarget =
    (meta & ComponentMeta.Portal) !== 0 ? (type as PortalFn)._portalContainer : undefined

  // Render the component
  const rendered = renderComponent(instance, props)
  instance._rendered = rendered
  vnode.children = rendered
  vnode.parentDom = parentDom

  // Error boundary: push handler after render (hooks exist) but before mounting children
  const isEB = (meta & ComponentMeta.ErrorBoundary) !== 0
  let caughtError: unknown
  if (isEB) {
    pushErrorHandler((err: unknown) => {
      caughtError = err
    })
  }

  // Suspense boundary: push handler before mounting children
  const isSuspense = (meta & ComponentMeta.Suspense) !== 0
  let suspendedPromise: Promise<unknown> | undefined
  if (isSuspense) {
    pushSuspendHandler((promise: Promise<unknown>) => {
      suspendedPromise = promise
    })
  }

  const mountParent = portalTarget ?? parentDom
  if (portalTarget !== undefined) {
    // Portal: mount children into the portal container, leave a placeholder
    mountInternal(rendered, portalTarget, isSvg)
    const placeholder = document.createTextNode("")
    domAppendChild(parentDom, placeholder)
    vnode.dom = placeholder
  } else {
    mountInternal(rendered, parentDom, isSvg)
    vnode.dom = rendered.dom
  }

  if (isSuspense) {
    popSuspendHandler()
    if (suspendedPromise !== undefined) {
      // A descendant suspended -- show fallback and re-render when resolved.
      // Set hook[0] (loading state) to true.
      instance._hooks[0]!.value = true
      const fallback = renderComponent(instance, props)
      detachRenderedDOM(rendered, mountParent)
      instance._rendered = fallback
      vnode.children = fallback
      mountInternal(fallback, mountParent, isSvg)
      vnode.dom = portalTarget !== undefined ? vnode.dom : fallback.dom

      // When the promise resolves, clear loading state and re-render.
      // On rejection, also re-render so the lazy component throws a real
      // error that propagates to the nearest ErrorBoundary.
      suspendedPromise.then(
        () => {
          instance._hooks[0]!.value = false
          scheduleUpdate(instance)
        },
        () => {
          instance._hooks[0]!.value = false
          scheduleUpdate(instance)
        },
      )
    }
  }

  if (isEB) {
    popErrorHandler()
    if (caughtError !== undefined) {
      // Error caught during child mount -- set error state and re-render synchronously.
      // Use detachRenderedDOM (not unmount) to preserve VNode data for reset.
      instance._hooks[0]!.value = caughtError
      const fallback = renderComponent(instance, props)
      detachRenderedDOM(rendered, mountParent)
      instance._rendered = fallback
      vnode.children = fallback
      mountInternal(fallback, mountParent, isSvg)
      vnode.dom = portalTarget !== undefined ? vnode.dom : fallback.dom
    }
  }

  instance._mounted = true

  // Run effects after mount
  runEffects(instance)

  if (providerCtx !== null) providerCtx._stack.pop()
}

/**
 * Hydration-aware component mount. Creates the component instance and
 * renders it, but instead of creating new DOM elements, returns the
 * rendered VNode so the caller (hydrate.ts) can walk existing DOM.
 *
 * After the caller hydrates the rendered tree, it must call
 * `finalizeHydratedComponent` to run effects and mark the instance
 * as mounted.
 */
export function hydrateComponentInstance(
  vnode: VNode,
  parentDom: Element,
): { rendered: VNode; instance: ComponentInstance } {
  const type = vnode.type as ComponentFn
  const props = buildComponentProps(vnode)

  const instance: ComponentInstance = {
    _type: type,
    _props: props,
    _vnode: vnode,
    _rendered: null,
    _parentDom: parentDom,
    _queuedLanes: 0,
    _hooks: EMPTY_HOOKS,
    _effects: EMPTY_EFFECTS,
    _mounted: false,
    _contexts: null,
    _hookCount: -1,
    _passiveQueued: false,
  }

  vnode.instance = instance

  // Check if this is a Context Provider
  const hydrateMeta = ((type as Partial<{ _meta: number }>)._meta ?? 0) | 0
  const providerCtx =
    (hydrateMeta & ComponentMeta.Provider) !== 0
      ? (type as ProviderFunction<unknown>)._context
      : null
  if (providerCtx !== null) providerCtx._stack.push(props["value"])

  const rendered = renderComponent(instance, props)
  instance._rendered = rendered
  vnode.children = rendered
  vnode.parentDom = parentDom

  if (providerCtx !== null) providerCtx._stack.pop()

  return { rendered, instance }
}

/**
 * Finalize a hydrated component: set the dom reference, mark as mounted,
 * and run effects.
 */
export function finalizeHydratedComponent(
  vnode: VNode,
  instance: ComponentInstance,
  rendered: VNode,
): void {
  vnode.dom = rendered.dom
  instance._mounted = true
  runEffects(instance)
}

/**
 * Hydration-aware Suspense boundary mount. Creates the Suspense component
 * instance and renders it (calling the Suspense function, which returns
 * the children VNode). The caller (hydrate.ts) is responsible for
 * walking the returned VNode against existing DOM and handling thrown
 * promises from lazy child components.
 */
export function hydrateSuspenseInstance(
  vnode: VNode,
  parentDom: Element,
): { rendered: VNode; instance: ComponentInstance } {
  const type = vnode.type as ComponentFn
  const props = buildComponentProps(vnode)

  const instance: ComponentInstance = {
    _type: type,
    _props: props,
    _vnode: vnode,
    _rendered: null,
    _parentDom: parentDom,
    _queuedLanes: 0,
    _hooks: EMPTY_HOOKS,
    _effects: EMPTY_EFFECTS,
    _mounted: false,
    _contexts: null,
    _hookCount: -1,
    _passiveQueued: false,
  }

  vnode.instance = instance

  const suspenseMeta = ((type as Partial<{ _meta: number }>)._meta ?? 0) | 0
  const providerCtx =
    (suspenseMeta & ComponentMeta.Provider) !== 0
      ? (type as ProviderFunction<unknown>)._context
      : null
  if (providerCtx !== null) providerCtx._stack.push(props["value"])

  const rendered = renderComponent(instance, props)
  instance._rendered = rendered
  vnode.children = rendered
  vnode.parentDom = parentDom

  if (providerCtx !== null) providerCtx._stack.pop()

  return { rendered, instance }
}

/**
 * Finalize a hydrated Suspense component: set the dom reference, mark as
 * mounted, and run effects.
 */
export function finalizeSuspenseComponent(
  vnode: VNode,
  instance: ComponentInstance,
  rendered: VNode,
): void {
  vnode.dom = rendered.dom
  instance._mounted = true
  runEffects(instance)
}

/**
 * Switch a hydrated Suspense boundary to its fallback state.
 * Used when a child throws a promise during hydration.
 */
export function switchSuspenseToFallback(
  vnode: VNode,
  instance: ComponentInstance,
): VNode {
  instance._hooks[0]!.value = true
  const fallback = renderComponent(instance, instance._props)
  instance._rendered = fallback
  vnode.children = fallback
  return fallback
}

/**
 * Patch a functional component — called by diff.ts.
 * Re-renders with new props and patches the output.
 */
export function patchComponent(oldVNode: VNode, newVNode: VNode, parentDom: Element): void {
  const oldInstance = oldVNode.instance as ComponentInstance | null
  if (oldInstance === null) {
    // Fallback: mount fresh if no instance found
    mountComponent(newVNode, parentDom, false)
    return
  }

  // Fast path: when neither old nor new vnode carries JSX children, we can skip
  // the buildComponentProps allocation entirely. buildComponentProps exists
  // purely to splice vnode.children into the props object; with no children,
  // we can compare old instance props directly against the fresh vnode props
  // and reuse the vnode's props object as-is for rendering.
  const hasChildren = newVNode.children !== null || oldVNode.children !== null
  const newProps = hasChildren
    ? buildComponentProps(newVNode)
    : newVNode.props !== null
      ? newVNode.props
      : EMPTY_PROPS

  // shouldUpdate — prop equality (custom or shallow) + context check.
  // Inlined: direct _compare read + null-check on _contexts avoids two
  // function calls per bail on the hot memo-reuse path.
  const memoCompare = (oldInstance._type as MemoComponentFn)._compare
  const propsEqual =
    memoCompare != null
      ? memoCompare(oldInstance._props, newProps)
      : shallowEqual(oldInstance._props, newProps)
  if (
    propsEqual &&
    oldInstance._queuedLanes === 0 &&
    (oldInstance._contexts === null || !contextValuesChanged(oldInstance))
  ) {
    // Props unchanged — skip re-render, carry forward references
    newVNode.children = oldInstance._rendered
    newVNode.dom = oldVNode.dom
    newVNode.parentDom = parentDom
    newVNode.instance = oldInstance
    oldInstance._vnode = newVNode
    return
  }

  // Save state for Transition abandonment (restore if render is discarded)
  if (R.collecting) savePatchRestorer(oldInstance, oldVNode)

  oldInstance._props = newProps
  oldInstance._vnode = newVNode
  oldInstance._parentDom = parentDom
  newVNode.instance = oldInstance

  // Consolidated tag lookup: see mountComponent for rationale.
  const newType = newVNode.type as ComponentFn
  const meta = ((newType as Partial<{ _meta: number }>)._meta ?? 0) | 0

  // Compiled components: props differed, dispatch slot-diff patch.
  if ((meta & ComponentMeta.Compiled) !== 0) {
    const compiled = oldInstance._rendered as unknown as { dom: Element; state: Record<string, unknown> }
    ;(newType as unknown as CompiledComponent).patch(compiled.state, newProps)
    newVNode.dom = compiled.dom
    newVNode.children = compiled as unknown as VNode
    return
  }

  // Check if this is a Context Provider
  const providerCtx =
    (meta & ComponentMeta.Provider) !== 0 ? (newType as ProviderFunction<unknown>)._context : null
  if (providerCtx !== null) providerCtx._stack.push(newProps["value"])

  const oldRendered = oldInstance._rendered!
  const newRendered = renderComponent(oldInstance, newProps)
  oldInstance._rendered = newRendered

  newVNode.children = newRendered
  newVNode.parentDom = parentDom

  // Check if this is a Portal
  const portalTarget =
    (meta & ComponentMeta.Portal) !== 0 ? (newType as PortalFn)._portalContainer : undefined
  const patchParent = portalTarget ?? parentDom

  // Error boundary: push handler before patching children
  const isEB = (meta & ComponentMeta.ErrorBoundary) !== 0
  let caughtError: unknown
  if (isEB) {
    pushErrorHandler((err: unknown) => {
      caughtError = err
    })
  }

  // Suspense boundary: push error handler to capture child errors, then
  // push suspend handler for thrown promises.
  const isSuspense = (meta & ComponentMeta.Suspense) !== 0
  let suspendedPromise: Promise<unknown> | undefined
  if (isSuspense) {
    pushSuspendHandler((promise: Promise<unknown>) => {
      suspendedPromise = promise
    })
  }

  patchVNode(oldRendered, newRendered, patchParent)

  // If a descendant yielded mid-children-diff (Transition only), defer all
  // post-patch work (dom ref, suspense/EB handling, effects, provider cleanup).
  if (R.pending) {
    deferPatchComponentPostWork(
      oldInstance, oldVNode, newVNode, newRendered, newProps,
      patchParent, portalTarget, providerCtx, isSuspense, isEB,
      suspendedPromise,
    )
    return
  }

  newVNode.dom = portalTarget !== undefined ? oldVNode.dom : newRendered.dom

  if (isSuspense) {
    popSuspendHandler()
    if (suspendedPromise !== undefined) {
      if (R.collecting) {
        // Transition-lane suspension (two-phase commit active): keep old
        // UI visible. The scheduler will abandon this Transition (discard
        // effects, restore VNode state). Re-schedule at Transition
        // priority when data resolves.
        signalTransitionSuspended(suspendedPromise)
      } else {
        // Sync/Default lane: show the fallback immediately
        oldInstance._hooks[0]!.value = true
        const fallback = renderComponent(oldInstance, newProps)
        detachRenderedDOM(newRendered, patchParent)
        oldInstance._rendered = fallback
        newVNode.children = fallback
        mountInternal(fallback, patchParent, false)
        newVNode.dom = portalTarget !== undefined ? oldVNode.dom : fallback.dom

        suspendedPromise.then(
          () => {
            oldInstance._hooks[0]!.value = false
            scheduleUpdate(oldInstance)
          },
          () => {
            oldInstance._hooks[0]!.value = false
            scheduleUpdate(oldInstance)
          },
        )
      }
    }
  }

  if (isEB) {
    popErrorHandler()
    if (caughtError !== undefined) {
      // Error caught during child patch -- set error state and re-render synchronously.
      // Use detachRenderedDOM (not unmount) to preserve VNode data for reset.
      oldInstance._hooks[0]!.value = caughtError
      const fallback = renderComponent(oldInstance, newProps)
      detachRenderedDOM(newRendered, patchParent)
      oldInstance._rendered = fallback
      newVNode.children = fallback
      mountInternal(fallback, patchParent, false)
      newVNode.dom = portalTarget !== undefined ? oldVNode.dom : fallback.dom
    }
  }

  // Run effects after patch
  runEffects(oldInstance)

  if (providerCtx !== null) providerCtx._stack.pop()
}

/**
 * Unmount a component — called by unmount.ts.
 * Runs effect cleanups and removes the instance.
 */
export function unmountComponent(vnode: VNode, parentDom: Element): void {
  const instance = vnode.instance as ComponentInstance | null

  // Check if this is a Portal or Compiled component
  const unmountType = vnode.type as ComponentFn
  const unmountMeta = ((unmountType as Partial<{ _meta: number }>)._meta ?? 0) | 0

  // Compiled components: no effects, no child tree to unmount. Just remove
  // the root DOM. GC handles the closure-held state object.
  if ((unmountMeta & ComponentMeta.Compiled) !== 0) {
    if (vnode.dom !== null) domRemoveChild(parentDom, vnode.dom)
    vnode.instance = null
    releaseVNode(vnode)
    return
  }

  if (instance !== null) {
    // Run all effect cleanups. Also clear pendingRun so any queued
    // passive drain skips this instance (prevents a callback from
    // running after its cleanup has already fired during unmount).
    for (let i = 0; i < instance._effects.length; i++) {
      const effect = instance._effects[i]!
      if (effect.cleanup !== null) {
        effect.cleanup()
        effect.cleanup = null
      }
      effect.pendingRun = false
    }
    vnode.instance = null
  }

  const portalTarget =
    (unmountMeta & ComponentMeta.Portal) !== 0
      ? (unmountType as PortalFn)._portalContainer
      : undefined

  const rendered = vnode.children as VNode | null
  if (rendered !== null) {
    unmount(rendered, portalTarget ?? parentDom)
  }

  // Portal: remove the placeholder from the original tree
  if (portalTarget !== undefined && vnode.dom !== null) {
    domRemoveChild(parentDom, vnode.dom)
  }

  releaseVNode(vnode)
}

// --- Hooks ---

/**
 * Hook: declare a state variable in a functional component.
 *
 * @param initial - The initial state value
 * @returns A tuple of [currentValue, setter]
 */
export function useState<T>(initial: T): readonly [T, (newVal: T | ((prev: T) => T)) => void] {
  const instance = currentInstance
  if (instance === null) {
    throw new Error(
      "useState must be called inside a component render. " +
        "Make sure you are not calling hooks outside of a component function.",
    )
  }

  hookIndex++
  const idx = stateIndex++

  // Initialize on first render (call lazy initializer if it's a function)
  if (idx >= instance._hooks.length) {
    const initialValue = typeof initial === "function" ? (initial as () => T)() : initial
    if (instance._hooks === EMPTY_HOOKS) instance._hooks = []
    instance._hooks.push({ value: initialValue, pendingUpdates: null, setter: null })
  }

  const hook = instance._hooks[idx]!

  // Apply pending updates up to the current render lane
  const value = resolveHookState<T>(hook)

  // Cache the setter on the hook. React does the same: the setter closes
  // over the hook/instance and its identity never needs to change across
  // renders, so reallocating every render is wasted work and GC pressure.
  let setter = hook.setter
  if (setter === null) {
    setter = (newVal: unknown): void => {
      const targetLane = getCurrentLane()
      const h = instance._hooks[idx]!

      if (h.pendingUpdates === null) h.pendingUpdates = []

      if (typeof newVal === "function") {
        h.pendingUpdates.push({
          kind: "fn",
          fn: newVal as (prev: unknown) => unknown,
          lane: targetLane,
        })
      } else {
        const current = peekHookState(h)
        if (newVal === current) {
          if (h.pendingUpdates.length === 0) h.pendingUpdates = null
          return
        }
        h.pendingUpdates.push({ kind: "value", value: newVal, lane: targetLane })
      }

      scheduleUpdate(instance, targetLane)
    }
    hook.setter = setter
  }

  return [value, setter as (v: T | ((prev: T) => T)) => void]
}

/**
 * Hook: declare a state variable with a reducer function.
 *
 * @param reducer - A pure function (state, action) => newState
 * @param initialState - The initial state value
 * @returns A tuple of [currentState, dispatch]
 */
export function useReducer<S, A>(
  reducer: (state: S, action: A) => S,
  initialState: S,
): readonly [S, (action: A) => void] {
  const instance = currentInstance
  if (instance === null) {
    throw new Error(
      "useReducer must be called inside a component render. " +
        "Make sure you are not calling hooks outside of a component function.",
    )
  }

  hookIndex++
  const idx = stateIndex++

  if (idx >= instance._hooks.length) {
    if (instance._hooks === EMPTY_HOOKS) instance._hooks = []
    instance._hooks.push({ value: initialState, pendingUpdates: null, setter: null })
  }

  const hook = instance._hooks[idx]!

  // Apply pending updates up to the current render lane
  const value = resolveHookState<S>(hook)

  const dispatch = (action: A): void => {
    const targetLane = getCurrentLane()
    const h = instance._hooks[idx]!

    // Eagerly compute to bail out if the value doesn't change
    const current = peekHookState<S>(h)
    const nextVal = reducer(current, action)
    if (nextVal === current) return

    // Queue a reducer-style update (fn form)
    if (h.pendingUpdates === null) h.pendingUpdates = []
    h.pendingUpdates.push({
      kind: "fn",
      fn: (prev) => reducer(prev as S, action),
      lane: targetLane,
    })

    scheduleUpdate(instance, targetLane)
  }

  return [value, dispatch]
}

function registerEffect(
  callback: () => EffectCleanup,
  deps: readonly unknown[] | undefined,
  isLayout: boolean,
  hookName: string,
): void {
  const instance = currentInstance
  if (instance === null) {
    throw new Error(
      `${hookName} must be called inside a component render. ` +
        "Make sure you are not calling hooks outside of a component function.",
    )
  }

  hookIndex++
  const effectIdx = effectIndex++

  const resolvedDeps = deps !== undefined ? deps : null

  if (effectIdx >= instance._effects.length) {
    // First render -- create effect entry, schedule to run
    if (instance._effects === EMPTY_EFFECTS) instance._effects = []
    instance._effects.push({
      callback,
      deps: resolvedDeps,
      cleanup: null,
      pendingRun: true,
      isLayout,
    })
  } else {
    const effect = instance._effects[effectIdx]!
    // Check if deps changed
    if (resolvedDeps !== null && effect.deps !== null && depsEqual(resolvedDeps, effect.deps)) {
      // Deps unchanged -- skip
      effect.pendingRun = false
    } else {
      // Deps changed -- schedule re-run
      effect.callback = callback
      effect.deps = resolvedDeps
      effect.pendingRun = true
    }
  }
}

/**
 * Hook: register a side effect that runs after DOM commit.
 *
 * Passive effect: fires after all layout effects in the same commit.
 *
 * @param callback - The effect function (may return a cleanup function)
 * @param deps - Dependency array (undefined = run every render, [] = run once)
 */
export function useEffect(callback: () => EffectCleanup, deps?: readonly unknown[]): void {
  registerEffect(callback, deps, false, "useEffect")
}

/**
 * Hook: register a synchronous side effect that runs before browser paint.
 *
 * Layout effects run synchronously after DOM commit and before any passive
 * effects (useEffect), matching React's ordering. Use for DOM measurements
 * or imperative mutations that must happen before paint.
 *
 * @param callback - The effect function (may return a cleanup function)
 * @param deps - Dependency array (undefined = run every render, [] = run once)
 */
export function useLayoutEffect(
  callback: () => EffectCleanup,
  deps?: readonly unknown[],
): void {
  registerEffect(callback, deps, true, "useLayoutEffect")
}

/**
 * Hook: register an effect that fires before any DOM mutations.
 *
 * In React, useInsertionEffect runs before useLayoutEffect and is intended
 * for CSS-in-JS libraries to inject <style> rules. Tachys treats this as
 * a layout effect -- it runs synchronously before useEffect, which is
 * sufficient for the CSS-in-JS case where ordering vs. useEffect is what
 * matters.
 *
 * Exported for React API compatibility -- CSS-in-JS libraries like
 * styled-components and Emotion call this hook.
 *
 * @param callback - The effect function (may return a cleanup function)
 * @param deps - Dependency array (undefined = run every render, [] = run once)
 */
export function useInsertionEffect(
  callback: () => EffectCleanup,
  deps?: readonly unknown[],
): void {
  registerEffect(callback, deps, true, "useInsertionEffect")
}

/**
 * Hook: memoize a computed value, recomputing only when deps change.
 *
 * @param factory - Function that computes the value
 * @param deps - Dependency array
 * @returns The memoized value
 */
export function useMemo<T>(factory: () => T, deps: readonly unknown[]): T {
  const instance = currentInstance
  if (instance === null) {
    throw new Error(
      "useMemo must be called inside a component render. " +
        "Make sure you are not calling hooks outside of a component function.",
    )
  }

  hookIndex++
  const idx = stateIndex++

  if (idx >= instance._hooks.length) {
    // First render — compute and store
    const value = factory()
    if (instance._hooks === EMPTY_HOOKS) instance._hooks = []
    instance._hooks.push({ value: [value, deps], pendingUpdates: null, setter: null })
    return value
  }

  const hook = instance._hooks[idx]!
  const [prevValue, prevDeps] = hook.value as [T, unknown[]]

  if (depsEqual(deps, prevDeps)) {
    return prevValue
  }

  // Deps changed — recompute
  const value = factory()
  hook.value = [value, deps]
  return value
}

/**
 * Hook: memoize a callback function, returning the same reference when deps are unchanged.
 *
 * @param callback - The callback function to memoize
 * @param deps - Dependency array
 * @returns The memoized callback
 */
export function useCallback<T extends (...args: never[]) => unknown>(
  callback: T,
  deps: readonly unknown[],
): T {
  return useMemo(() => callback, deps)
}

/**
 * Hook: create a mutable ref object that persists across renders.
 *
 * @param initial - The initial value for ref.current
 * @returns A stable { current } object
 */
export function useRef<T>(initial: T): RefObject<T> {
  const instance = currentInstance
  if (instance === null) {
    throw new Error(
      "useRef must be called inside a component render. " +
        "Make sure you are not calling hooks outside of a component function.",
    )
  }

  hookIndex++
  const idx = stateIndex++

  if (idx >= instance._hooks.length) {
    const ref = { current: initial }
    if (instance._hooks === EMPTY_HOOKS) instance._hooks = []
    instance._hooks.push({ value: ref, pendingUpdates: null, setter: null })
    return ref
  }

  return instance._hooks[idx]!.value as { current: T }
}

/**
 * Hook: subscribe to an external store and return its current snapshot.
 *
 * Follows the React useSyncExternalStore API. The subscribe function
 * receives a callback that should be called whenever the store changes.
 * It must return an unsubscribe function. getSnapshot returns the
 * current store value -- it must be referentially stable when the
 * underlying data has not changed (return the same reference).
 *
 * Tearing prevention: on every render, the current snapshot is compared
 * against getSnapshot(). If they differ (store changed between renders),
 * the hook updates immediately and schedules at Sync priority so all
 * components in the tree see a consistent store value. Store change
 * notifications also schedule at Sync priority for the same reason.
 *
 * @param subscribe - Function to subscribe to the store: (onStoreChange) => unsubscribe
 * @param getSnapshot - Function that returns the current store value
 * @param getServerSnapshot - Optional function for SSR (returns server-side snapshot)
 * @returns The current snapshot value
 */
export function useSyncExternalStore<T>(
  subscribe: (onStoreChange: () => void) => () => void,
  getSnapshot: () => T,
  getServerSnapshot?: () => T,
): T {
  const instance = currentInstance
  if (instance === null) {
    throw new Error(
      "useSyncExternalStore must be called inside a component render. " +
        "Make sure you are not calling hooks outside of a component function.",
    )
  }

  hookIndex++
  const idx = stateIndex++

  // Initialize snapshot on first render
  if (idx >= instance._hooks.length) {
    if (instance._hooks === EMPTY_HOOKS) instance._hooks = []
    instance._hooks.push({ value: getSnapshot(), pendingUpdates: null, setter: null })
  }

  const hook = instance._hooks[idx]!

  // Tearing check: compare stored snapshot against current store state.
  // If the store changed between renders (e.g. during a Transition-lane
  // render), update the snapshot immediately so this component sees the
  // latest value. This prevents "tearing" where different components in
  // the same tree see different store states.
  const freshSnapshot = getSnapshot()
  if (freshSnapshot !== hook.value) {
    hook.value = freshSnapshot
    // Schedule at Sync priority to ensure all subscribers re-render
    // with the same snapshot before the frame ends.
    scheduleUpdate(instance, Lane.Sync)
  }

  const snapshot = hook.value as T

  // Use an effect to subscribe/unsubscribe. The effect cleanup handles
  // unsubscription. On each subscribe call, we immediately sync the
  // snapshot in case it changed between render and effect.
  useEffect(() => {
    const unsubscribe = subscribe(() => {
      const next = getSnapshot()
      if (next !== instance._hooks[idx]!.value) {
        instance._hooks[idx]!.value = next
        // Schedule at Sync priority for tearing prevention: all
        // subscribers must re-render atomically with the same value.
        scheduleUpdate(instance, Lane.Sync)
      }
    })
    // Sync immediately in case store changed between render and subscribe
    const current = getSnapshot()
    if (current !== instance._hooks[idx]!.value) {
      instance._hooks[idx]!.value = current
      scheduleUpdate(instance, Lane.Sync)
    }
    return unsubscribe
  }, [subscribe, getSnapshot])

  return snapshot
}

// --- useId ---

/**
 * Global counter for generating unique IDs. Increments monotonically.
 * Reset via resetIdCounter() at the start of SSR or hydration to keep
 * server and client IDs in sync.
 */
let idCounter = 0

/**
 * Reset the useId counter. Called at the start of renderToString() and
 * hydrate() so that server-generated IDs match client-generated IDs.
 */
export function resetIdCounter(): void {
  idCounter = 0
}

/**
 * Hook: generate a unique ID that is stable across server and client.
 *
 * Returns a string like ":b0:", ":b1:", etc. The prefix "b" (for brevity)
 * avoids collision with user-defined IDs. The colons ensure no numeric
 * prefix that could conflict with CSS selectors.
 *
 * @returns A unique, stable ID string
 */
export function useId(): string {
  const instance = currentInstance
  if (instance === null) {
    throw new Error(
      "useId must be called inside a component render. " +
        "Make sure you are not calling hooks outside of a component function.",
    )
  }

  hookIndex++
  const idx = stateIndex++

  if (idx >= instance._hooks.length) {
    if (instance._hooks === EMPTY_HOOKS) instance._hooks = []
    instance._hooks.push({ value: `:b${idCounter++}:`, pendingUpdates: null, setter: null })
  }

  return instance._hooks[idx]!.value as string
}

// --- useImperativeHandle ---

/**
 * Hook: customize the instance value that is exposed to parent components
 * when using forwardRef. Instead of exposing the DOM node directly,
 * useImperativeHandle lets you expose a custom object.
 *
 * @param ref - The ref object or callback forwarded from the parent
 * @param createHandle - Factory function returning the value to expose
 * @param deps - Dependency array (recomputes handle when deps change)
 */
export function useImperativeHandle<T>(
  ref: RefObject<T> | ((instance: T) => void) | null | undefined,
  createHandle: () => T,
  deps?: readonly unknown[],
): void {
  const instance = currentInstance
  if (instance === null) {
    throw new Error(
      "useImperativeHandle must be called inside a component render. " +
        "Make sure you are not calling hooks outside of a component function.",
    )
  }

  const effectDeps = deps !== undefined ? [ref, ...deps] : [ref]

  useLayoutEffect(() => {
    if (ref === null || ref === undefined) return

    const handle = createHandle()

    if (typeof ref === "function") {
      ref(handle)
      return () => ref(null as unknown as T)
    }
    ;(ref as RefObject<T>).current = handle
    return () => {
      ;(ref as RefObject<T>).current = null as unknown as T
    }
  }, effectDeps)
}

// --- useDebugValue ---

/**
 * Hook: display a label for custom hooks in dev tools.
 *
 * This is a no-op in Tachys. It exists purely for React API compatibility
 * so that custom hooks can call useDebugValue without errors.
 *
 * @param _value - The debug value to display (ignored)
 * @param _format - Optional formatter function (ignored)
 */
export function useDebugValue<T>(_value: T, _format?: (value: T) => unknown): void {
  // Intentional no-op. Dev tools integration may use this in the future.
}

// --- use() ---

/**
 * Tagged Promise interface. The use() hook attaches status/value/reason
 * properties directly to Promise objects so that already-resolved Promises
 * can be read synchronously without waiting for microtask callbacks.
 */
interface UsablePromise<T> extends Promise<T> {
  status?: "pending" | "fulfilled" | "rejected"
  value?: T
  reason?: unknown
}

function trackPromise<T>(promise: UsablePromise<T>): void {
  if (promise.status !== undefined) return // Already tracked

  promise.status = "pending"
  promise.then(
    (value) => {
      promise.status = "fulfilled"
      promise.value = value
    },
    (error) => {
      promise.status = "rejected"
      promise.reason = error
    },
  )
}

/**
 * Check if a value is a Context object.
 */
function isContext(value: unknown): value is Context<unknown> {
  // Context is itself a function (React 19), so we match both objects and
  // functions carrying the internal Context fields.
  if (value === null) return false
  const t = typeof value
  if (t !== "object" && t !== "function") return false
  return (
    "_defaultValue" in (value as Record<string, unknown>) &&
    "_stack" in (value as Record<string, unknown>)
  )
}

/**
 * React 19's use() hook for reading Promises and Context.
 *
 * Unlike other hooks, use() can be called inside conditionals and loops.
 * It does not consume a hook slot.
 *
 * When called with a Promise:
 * - If resolved, returns the resolved value
 * - If pending, throws the Promise (triggers Suspense boundary)
 * - If rejected, throws the rejection error
 *
 * When called with a Context:
 * - Returns the current context value (same as useContext)
 *
 * @param usable - A Promise or Context to read from
 * @returns The resolved value or context value
 */
export function use<T>(usable: Promise<T> | Context<T>): T {
  if (isContext(usable)) {
    const ctx = usable as Context<T>
    const value = ctx._stack.length > 0 ? ctx._stack[ctx._stack.length - 1]! : ctx._defaultValue
    registerContextDep(ctx as Context<unknown>, value)
    return value
  }

  // Treat as a Promise/thenable
  const promise = usable as UsablePromise<T>
  trackPromise(promise)

  if (promise.status === "fulfilled") {
    return promise.value as T
  }

  if (promise.status === "rejected") {
    throw promise.reason
  }

  // Pending: throw the Promise to trigger Suspense
  throw promise
}

// --- startTransition / useTransition ---

/**
 * Mark state updates inside the callback as a "transition" -- a non-urgent
 * update that can be interrupted by higher-priority work.
 *
 * Sets the scheduler's current lane to Transition for the duration of the
 * callback. Any state updates triggered inside will be scheduled at
 * Transition priority, allowing Sync and Default work to interrupt them.
 *
 * @param callback - Function containing state updates to mark as transitions
 */
export function startTransition(callback: () => void): void {
  const prevLane = getCurrentLane()
  setCurrentLane(Lane.Transition)
  try {
    callback()
  } finally {
    setCurrentLane(prevLane)
  }
}

/**
 * Hook: returns a [isPending, startTransition] tuple for managing transitions.
 *
 * When the returned startTransition is called:
 *   1. isPending becomes true (rendered at Default priority)
 *   2. The callback's state updates are scheduled at Transition priority
 *   3. isPending becomes false when the Transition render completes
 *
 * Because the scheduler defers Transition work to a separate frame after
 * urgent work, the isPending=true render paints before the transition
 * begins, giving the user immediate visual feedback.
 *
 * @returns A tuple of [isPending, startTransition]
 */
export function useTransition(): readonly [boolean, (callback: () => void) => void] {
  const instance = currentInstance
  if (instance === null) {
    throw new Error(
      "useTransition must be called inside a component render. " +
        "Make sure you are not calling hooks outside of a component function.",
    )
  }

  // isPending lives in state so it triggers re-renders.
  // setIsPending(true) is called at Default lane (urgent).
  // setIsPending(false) is called at Transition lane (deferred).
  // Because state updates are lane-tagged, the Default-lane render sees
  // isPending=true and the Transition-lane render sees isPending=false.
  const [isPending, setIsPending] = useState(false)

  const wrappedStartTransition = useCallback((callback: () => void) => {
    // Queue isPending=true at Default (urgent) priority
    setIsPending(true)

    // Queue the callback's updates + isPending=false at Transition priority
    startTransition(() => {
      setIsPending(false)
      callback()
    })
  }, [])

  return [isPending, wrappedStartTransition]
}

// --- useDeferredValue ---

/**
 * Hook: defer a value to allow more urgent updates to render first.
 *
 * On the urgent (Default-lane) render, returns the previous value so
 * the component can paint immediately with stale data. Then schedules
 * a Transition-lane re-render that returns the new value.
 *
 * @param value - The value to defer
 * @returns The deferred value (lags behind during transitions)
 */
export function useDeferredValue<T>(value: T, initialValue?: T): T {
  const instance = currentInstance
  if (instance === null) {
    throw new Error(
      "useDeferredValue must be called inside a component render. " +
        "Make sure you are not calling hooks outside of a component function.",
    )
  }

  // When initialValue is provided, the first mount returns initialValue
  // instead of value, then a Transition update catches up to value.
  const initial = arguments.length >= 2 ? initialValue as T : value
  const [deferredValue, setDeferredValue] = useState(initial)

  // Schedule the catch-up update in an effect (runs after paint, not during render)
  useEffect(() => {
    startTransition(() => {
      setDeferredValue(value)
    })
    return undefined
  }, [value])

  return deferredValue
}

/**
 * Register a context dependency on the currently rendering component.
 * Called by useContext to enable context-aware shouldUpdate checks.
 */
export function registerContextDep(context: Context<unknown>, value: unknown): void {
  if (currentInstance === null) return

  if (currentInstance._contexts === null) {
    currentInstance._contexts = []
  }

  // Check if already registered (avoid duplicates across re-renders)
  for (let i = 0; i < currentInstance._contexts.length; i++) {
    if (currentInstance._contexts[i]!.context === context) {
      currentInstance._contexts[i]!.value = value
      return
    }
  }

  currentInstance._contexts.push({ context, value })
}

// --- Server-side rendering support ---

/**
 * Render a component function for SSR. Sets up the hook context so that
 * hooks (useState, useMemo, useRef, etc.) work during server rendering.
 * Effects are created but never executed. The returned VNode is not
 * mounted into any DOM.
 *
 * @param type - The component function
 * @param props - Props to pass to the component
 * @returns The rendered VNode tree
 */
export function renderComponentSSR(type: ComponentFn, props: Record<string, unknown>): VNode {
  const instance: ComponentInstance = {
    _type: type,
    _props: props,
    _vnode: null!,
    _rendered: null,
    _parentDom: null!,
    _queuedLanes: 0,
    _hooks: EMPTY_HOOKS,
    _effects: EMPTY_EFFECTS,
    _mounted: false,
    _contexts: null,
    _hookCount: -1,
    _passiveQueued: false,
  }

  currentInstance = instance
  hookIndex = 0
  effectIndex = 0
  stateIndex = 0

  try {
    const rendered = type(props)
    currentInstance = null
    return rendered
  } catch (err) {
    currentInstance = null
    throw err
  }
}

/**
 * Build props from a VNode for component rendering (exposed for SSR).
 */
export function buildProps(vnode: VNode): Record<string, unknown> {
  return buildComponentProps(vnode)
}

// --- Internal helpers ---

function contextValuesChanged(instance: ComponentInstance): boolean {
  if (instance._contexts === null) return false
  for (let i = 0; i < instance._contexts.length; i++) {
    const dep = instance._contexts[i]!
    const ctx = dep.context
    const currentValue =
      ctx._stack.length > 0 ? ctx._stack[ctx._stack.length - 1] : ctx._defaultValue
    if (currentValue !== dep.value) return true
  }
  return false
}

function renderComponent(instance: ComponentInstance, props: Record<string, unknown>): VNode {
  currentInstance = instance
  hookIndex = 0
  effectIndex = 0
  stateIndex = 0

  try {
    const rendered = instance._type(props)

    if (__DEV__) {
      if (instance._hookCount === -1) {
        // First render: record hook count
        instance._hookCount = hookIndex
      } else if (hookIndex !== instance._hookCount) {
        warn(
          `Component "${getComponentName(instance._type)}" rendered with a different number of hooks than the previous render (${hookIndex} vs ${instance._hookCount}). Hooks must be called in the same order on every render. Do not call hooks inside conditions, loops, or nested functions.`,
        )
      }
    }

    currentInstance = null
    return rendered
  } catch (err) {
    // Always clear the current instance to avoid corrupting state
    currentInstance = null

    // Thrown thenables (Promises) are suspend signals from lazy() components.
    // Propagate to the nearest Suspense boundary.
    if (isThenable(err)) {
      if (propagateSuspend(err)) {
        return new VNode(VNodeFlags.Text, null, null, null, "", ChildFlags.NoChildren, null)
      }
      // No Suspense boundary -- throw so the developer sees the error
      throw err
    }

    // Propagate to the nearest error boundary (if any)
    if (propagateRenderError(err)) {
      return new VNode(VNodeFlags.Text, null, null, null, "", ChildFlags.NoChildren, null)
    }

    // Call onError prop if provided
    if (props["onError"] !== undefined) {
      ;(props["onError"] as (err: unknown) => void)(err)
    }

    // Return an empty placeholder so the tree remains consistent
    return new VNode(VNodeFlags.Text, null, null, null, "", ChildFlags.NoChildren, null)
  }
}

/**
 * Snapshot patchComponent state for Transition abandonment. Extracted
 * from the main patch path so it stays out of the Sync/Default hot
 * loop -- only called when R.collecting is true.
 */
function savePatchRestorer(oldInstance: ComponentInstance, oldVNode: VNode): void {
  const savedProps = oldInstance._props
  const savedVNode = oldInstance._vnode
  const savedParentDom = oldInstance._parentDom
  const savedRendered = oldInstance._rendered
  const savedDom = oldVNode.dom
  const hooks = oldInstance._hooks
  const savedHooks: Array<{ value: unknown; pending: StateUpdate[] | null }> = []
  for (let i = 0; i < hooks.length; i++) {
    const hk = hooks[i]!
    savedHooks.push({
      value: hk.value,
      pending: hk.pendingUpdates === null ? null : hk.pendingUpdates.slice(),
    })
  }
  pushTransitionRestorer(() => {
    oldInstance._props = savedProps
    oldInstance._vnode = savedVNode
    oldInstance._parentDom = savedParentDom
    oldInstance._rendered = savedRendered
    savedVNode.dom = savedDom
    savedVNode.instance = oldInstance
    for (let i = 0; i < savedHooks.length; i++) {
      hooks[i]!.value = savedHooks[i]!.value
      hooks[i]!.pendingUpdates = savedHooks[i]!.pending
    }
  })
}

/**
 * Snapshot rerenderComponent state for Transition abandonment. Extracted
 * from the main rerender path -- only called when R.collecting is true.
 */
function saveRerenderRestorer(instance: ComponentInstance, oldRendered: VNode): void {
  const savedRendered = oldRendered
  const savedVnodeChildren = instance._vnode.children
  const savedVnodeDom = instance._vnode.dom
  const hooks = instance._hooks
  const savedHooks: Array<{ value: unknown; pending: StateUpdate[] | null }> = []
  for (let i = 0; i < hooks.length; i++) {
    const h = hooks[i]!
    savedHooks.push({
      value: h.value,
      pending: h.pendingUpdates === null ? null : h.pendingUpdates.slice(),
    })
  }
  pushTransitionRestorer(() => {
    instance._rendered = savedRendered
    instance._vnode.children = savedVnodeChildren
    instance._vnode.dom = savedVnodeDom
    for (let i = 0; i < savedHooks.length; i++) {
      hooks[i]!.value = savedHooks[i]!.value
      hooks[i]!.pendingUpdates = savedHooks[i]!.pending
    }
  })
}

/**
 * rerenderComponent variant. Kept separate so each caller's closure
 * captures only the locals it actually needs.
 */
function deferRerenderComponentPostWork(
  instance: ComponentInstance,
  newRendered: VNode,
  patchParent: Element,
  portalTarget: Element | undefined,
  providerCtx: { _stack: unknown[] } | null,
  isSuspense: boolean,
  isEB: boolean,
  suspendedPromise: Promise<unknown> | undefined,
): void {
  appendAfterWork(() => {
    if (portalTarget === undefined) {
      instance._vnode.dom = newRendered.dom
    }
    if (isSuspense) {
      popSuspendHandler()
      if (suspendedPromise !== undefined) {
        if (R.collecting) {
          signalTransitionSuspended(suspendedPromise)
        } else {
          instance._hooks[0]!.value = true
          const fallback = renderComponent(instance, instance._props)
          detachRenderedDOM(newRendered, patchParent)
          instance._rendered = fallback
          instance._vnode.children = fallback
          mountInternal(fallback, patchParent, false)
          if (portalTarget === undefined) {
            instance._vnode.dom = fallback.dom
          }
          suspendedPromise.then(
            () => {
              instance._hooks[0]!.value = false
              scheduleUpdate(instance)
            },
            () => {
              instance._hooks[0]!.value = false
              scheduleUpdate(instance)
            },
          )
        }
      }
    }
    if (isEB) popErrorHandler()
    runEffects(instance)
    if (providerCtx !== null) providerCtx._stack.pop()
  })
}

/**
 * Defer post-patch work (dom ref, suspense/EB handling, effects, provider
 * cleanup) to run after the mid-render continuation completes. Extracted
 * out of patchComponent so the Sync/Default path stays small.
 */
function deferPatchComponentPostWork(
  oldInstance: ComponentInstance,
  oldVNode: VNode,
  newVNode: VNode,
  newRendered: VNode,
  newProps: Record<string, unknown>,
  patchParent: Element,
  portalTarget: Element | undefined,
  providerCtx: { _stack: unknown[] } | null,
  isSuspense: boolean,
  isEB: boolean,
  suspendedPromise: Promise<unknown> | undefined,
): void {
  appendAfterWork(() => {
    newVNode.dom = portalTarget !== undefined ? oldVNode.dom : newRendered.dom
    if (isSuspense) {
      popSuspendHandler()
      if (suspendedPromise !== undefined) {
        if (R.collecting) {
          signalTransitionSuspended(suspendedPromise)
        } else {
          oldInstance._hooks[0]!.value = true
          const fallback = renderComponent(oldInstance, newProps)
          detachRenderedDOM(newRendered, patchParent)
          oldInstance._rendered = fallback
          newVNode.children = fallback
          mountInternal(fallback, patchParent, false)
          newVNode.dom = portalTarget !== undefined ? oldVNode.dom : fallback.dom
          suspendedPromise.then(
            () => {
              oldInstance._hooks[0]!.value = false
              scheduleUpdate(oldInstance)
            },
            () => {
              oldInstance._hooks[0]!.value = false
              scheduleUpdate(oldInstance)
            },
          )
        }
      }
    }
    if (isEB) popErrorHandler()
    runEffects(oldInstance)
    if (providerCtx !== null) providerCtx._stack.pop()
  })
}

function rerenderComponent(instance: ComponentInstance): void {
  if (!instance._mounted) return

  const oldRendered = instance._rendered
  if (oldRendered === null) return

  // Save state for Transition abandonment
  if (R.collecting) saveRerenderRestorer(instance, oldRendered)

  const type = instance._type
  const meta = ((type as Partial<{ _meta: number }>)._meta ?? 0) | 0

  const providerCtx =
    (meta & ComponentMeta.Provider) !== 0 ? (type as ProviderFunction<unknown>)._context : null
  if (providerCtx !== null) providerCtx._stack.push(instance._props["value"])

  const portalTarget =
    (meta & ComponentMeta.Portal) !== 0 ? (type as PortalFn)._portalContainer : undefined

  const newRendered = renderComponent(instance, instance._props)
  instance._rendered = newRendered
  instance._vnode.children = newRendered

  const patchParent = portalTarget ?? instance._parentDom

  // Error boundary: push handler before patching children
  const isEB = (meta & ComponentMeta.ErrorBoundary) !== 0
  let caughtError: unknown
  if (isEB) {
    pushErrorHandler((err: unknown) => {
      caughtError = err
    })
  }

  // Suspense boundary: push handler before patching children
  const isSuspense = (meta & ComponentMeta.Suspense) !== 0
  let suspendedPromise: Promise<unknown> | undefined
  if (isSuspense) {
    pushSuspendHandler((promise: Promise<unknown>) => {
      suspendedPromise = promise
    })
  }

  patchVNode(oldRendered, newRendered, patchParent)

  // If a descendant yielded mid-children-diff (Transition only), defer all
  // post-patch work (dom ref, suspense/EB handling, effects, provider cleanup).
  if (R.pending) {
    deferRerenderComponentPostWork(
      instance, newRendered, patchParent, portalTarget,
      providerCtx, isSuspense, isEB, suspendedPromise,
    )
    return
  }

  if (portalTarget === undefined) {
    instance._vnode.dom = newRendered.dom
  }

  if (isSuspense) {
    popSuspendHandler()
    if (suspendedPromise !== undefined) {
      if (R.collecting) {
        // Transition-lane suspension (two-phase commit active): keep old
        // UI visible. The scheduler will abandon this Transition (discard
        // effects, restore VNode state). Re-schedule at Transition
        // priority when data resolves.
        signalTransitionSuspended(suspendedPromise)
      } else {
        // Sync/Default lane: show the fallback immediately
        instance._hooks[0]!.value = true
        const fallback = renderComponent(instance, instance._props)
        detachRenderedDOM(newRendered, patchParent)
        instance._rendered = fallback
        instance._vnode.children = fallback
        mountInternal(fallback, patchParent, false)
        if (portalTarget === undefined) {
          instance._vnode.dom = fallback.dom
        }

        suspendedPromise.then(
          () => {
            instance._hooks[0]!.value = false
            scheduleUpdate(instance)
          },
          () => {
            instance._hooks[0]!.value = false
            scheduleUpdate(instance)
          },
        )
      }
    }
  }

  if (isEB) {
    popErrorHandler()
    if (caughtError !== undefined) {
      instance._hooks[0]!.value = caughtError
      const fallback = renderComponent(instance, instance._props)
      detachRenderedDOM(newRendered, patchParent)
      instance._rendered = fallback
      instance._vnode.children = fallback
      mountInternal(fallback, patchParent, false)
      if (portalTarget === undefined) {
        instance._vnode.dom = fallback.dom
      }
    }
  }

  runEffects(instance)

  if (providerCtx !== null) providerCtx._stack.pop()
}

/**
 * Remove the DOM nodes of a rendered VNode from the parent without releasing
 * VNode data to the pool. Used during error recovery so that the original
 * children VNode can be re-mounted on error reset.
 */
function detachRenderedDOM(vnode: VNode, parentDom: Element): void {
  if ((vnode.flags & VNodeFlags.Fragment) !== 0) {
    const cf = vnode.childFlags
    if (cf === ChildFlags.HasSingleChild) {
      detachRenderedDOM(vnode.children as VNode, parentDom)
    } else if (cf === ChildFlags.HasKeyedChildren || cf === ChildFlags.HasNonKeyedChildren) {
      const children = vnode.children as VNode[]
      for (let i = 0; i < children.length; i++) {
        detachRenderedDOM(children[i]!, parentDom)
      }
    } else if (vnode.dom !== null && vnode.dom.parentNode === parentDom) {
      domRemoveChild(parentDom, vnode.dom)
    }
  } else if (vnode.dom !== null && vnode.dom.parentNode === parentDom) {
    domRemoveChild(parentDom, vnode.dom)
  }
}

function runEffects(instance: ComponentInstance): void {
  // During Transition-lane rendering (effect collection active), defer
  // layout + passive scheduling to post-commit so callbacks see the
  // final committed DOM.
  if (R.collecting) {
    for (let i = 0; i < instance._effects.length; i++) {
      if (instance._effects[i]!.pendingRun) {
        pushDeferredEffect(() => runEffectsImmediate(instance))
        return
      }
    }
    return
  }
  runEffectsImmediate(instance)
}

function runEffectsImmediate(instance: ComponentInstance): void {
  // React's ordering: layout effects fire synchronously in this commit,
  // then passive effects run after the browser has a chance to paint.
  const effects = instance._effects
  let hasPassive = false
  for (let i = 0; i < effects.length; i++) {
    const effect = effects[i]!
    if (!effect.pendingRun) continue
    if (effect.isLayout) {
      effect.pendingRun = false
      if (effect.cleanup !== null) effect.cleanup()
      const result = effect.callback()
      effect.cleanup = typeof result === "function" ? result : null
    } else {
      hasPassive = true
    }
  }
  if (hasPassive) {
    enqueuePassiveInstance(instance)
  }
}

// --- Passive effect queue (post-paint) ---
//
// Passive effects (useEffect) run in a task scheduled after the current
// render commit. In a browser this means after the browser has a chance
// to paint, matching React's semantics. In tests (jsdom/SSR), flushUpdates()
// drains the queue synchronously at the end so callers observe the
// post-commit state deterministically.
//
// The queue holds ComponentInstance references directly to avoid the
// closure allocation pushDeferredEffect uses. Entries are deduplicated
// via a per-instance flag so repeated enqueues are cheap and idempotent.

const _pendingPassive: ComponentInstance[] = []
let _passiveScheduled = false

function enqueuePassiveInstance(instance: ComponentInstance): void {
  if (instance._passiveQueued) return
  instance._passiveQueued = true
  _pendingPassive.push(instance)
  if (_passiveScheduled) return
  _passiveScheduled = true
  runAfterPaint(drainPassiveEffects)
}

export function hasPendingPassiveEffects(): boolean {
  return _pendingPassive.length > 0
}

export function drainPassiveEffects(): void {
  _passiveScheduled = false
  if (_pendingPassive.length === 0) return
  // Snapshot and clear so passive callbacks scheduling new renders
  // (which may re-enqueue this or other instances) don't mutate the
  // array we're iterating.
  const queue = _pendingPassive.slice()
  _pendingPassive.length = 0
  for (let i = 0; i < queue.length; i++) {
    const instance = queue[i]!
    instance._passiveQueued = false
    runPassiveForInstance(instance)
  }
}

function runPassiveForInstance(instance: ComponentInstance): void {
  const effects = instance._effects
  for (let i = 0; i < effects.length; i++) {
    const effect = effects[i]!
    if (!effect.isLayout && effect.pendingRun) {
      effect.pendingRun = false
      if (effect.cleanup !== null) effect.cleanup()
      const result = effect.callback()
      effect.cleanup = typeof result === "function" ? result : null
    }
  }
}

// Sentinel props object used when a component has no props at all. Frozen to
// guard against accidental mutation and shared across all such components.
const EMPTY_PROPS: Record<string, unknown> = Object.freeze({}) as Record<string, unknown>

function buildComponentProps(vnode: VNode): Record<string, unknown> {
  const props = vnode.props !== null ? { ...vnode.props } : {}
  const children = vnode.children
  if (children !== null) {
    if (Array.isArray(children)) {
      // Wrap array children in a Fragment so components that return
      // props.children always return a single VNode
      props["children"] = acquireVNode(
        VNodeFlags.Fragment,
        null,
        null,
        null,
        children,
        vnode.childFlags,
        null,
      )
    } else {
      props["children"] = children
    }
  }
  return props
}

function shallowEqual(a: Record<string, unknown>, b: Record<string, unknown>): boolean {
  if (a === b) return true
  // for...in avoids the two Array allocations that Object.keys() creates on
  // each call. V8 caches for...in iteration for monomorphic prop-object
  // shapes, which is the common case here: JSX builds props via the same
  // literal every call site, so both sides have the same hidden class.
  let aCount = 0
  for (const key in a) {
    if (a[key] !== b[key]) return false
    aCount++
  }
  let bCount = 0
  for (const _key in b) bCount++
  return aCount === bCount
}

function depsEqual(a: readonly unknown[], b: readonly unknown[]): boolean {
  if (a.length !== b.length) return false
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false
  }
  return true
}

// --- ErrorBoundary component ---

/**
 * Error boundary component.
 *
 * Catches errors thrown during rendering of its descendants and displays
 * fallback UI. The `fallback` prop receives the caught error and a `reset`
 * function that clears the error state and re-renders the children.
 *
 * Usage:
 *   h(ErrorBoundary, {
 *     fallback: (error, reset) => h("div", null, "Something went wrong")
 *   }, h(RiskyComponent, null))
 *
 * Convention: the first hook slot (useState) holds the error value.
 * mountComponent/patchComponent/rerenderComponent detect the _errorBoundary
 * tag and push/pop error handlers around child mounting.
 */
export function ErrorBoundary(props: Record<string, unknown>): VNode {
  const [error, setError] = useState<unknown>(null)

  if (error !== null) {
    const fallback = props["fallback"] as ((error: unknown, reset: () => void) => VNode) | undefined
    if (typeof fallback === "function") {
      return fallback(error, () => setError(null))
    }
    return new VNode(VNodeFlags.Text, null, null, null, "", ChildFlags.NoChildren, null)
  }

  const children = props["children"]
  if (children == null) {
    return new VNode(VNodeFlags.Text, null, null, null, "", ChildFlags.NoChildren, null)
  }
  // Multiple children: wrap in a fragment
  if (Array.isArray(children)) {
    return new VNode(
      VNodeFlags.Fragment,
      null,
      null,
      null,
      children as VNode[],
      ChildFlags.HasNonKeyedChildren,
      null,
    )
  }
  return children as VNode
}
;(ErrorBoundary as unknown as ErrorBoundaryFn)._errorBoundary = true
;(ErrorBoundary as unknown as { _meta: number })._meta = ComponentMeta.ErrorBoundary

// --- Suspense component ---

/**
 * Suspense boundary component.
 *
 * Shows a fallback while any descendant lazy component is loading.
 * The `fallback` prop is a VNode to display during loading.
 *
 * Usage:
 *   h(Suspense, { fallback: h("div", null, "Loading...") },
 *     h(LazyComponent, null))
 *
 * Convention: the first hook slot (useState) holds the loading state (boolean).
 * mountComponent/patchComponent/rerenderComponent detect the _suspense tag
 * and push/pop suspend handlers around child mounting. When a lazy component
 * throws a Promise, the handler captures it, sets loading=true, renders
 * fallback, and schedules a re-render when the Promise resolves.
 */
interface SuspenseFn extends ComponentFn {
  _suspense: true
}

export function Suspense(props: Record<string, unknown>): VNode {
  const [loading] = useState(false)

  if (loading) {
    const fallback = props["fallback"] as VNode | undefined
    if (fallback != null) {
      return fallback
    }
    return new VNode(VNodeFlags.Text, null, null, null, "", ChildFlags.NoChildren, null)
  }

  const children = props["children"]
  if (children == null) {
    return new VNode(VNodeFlags.Text, null, null, null, "", ChildFlags.NoChildren, null)
  }
  if (Array.isArray(children)) {
    return new VNode(
      VNodeFlags.Fragment,
      null,
      null,
      null,
      children as VNode[],
      ChildFlags.HasNonKeyedChildren,
      null,
    )
  }
  return children as VNode
}
;(Suspense as unknown as SuspenseFn)._suspense = true
;(Suspense as unknown as { _meta: number })._meta = ComponentMeta.Suspense
