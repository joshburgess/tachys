/**
 * React/ReactDOM compatibility layer.
 *
 * Provides a React-compatible API surface so that bundler aliases like
 *   { "react": "tachys/compat", "react-dom": "tachys/compat" }
 * allow existing React component libraries to work with Tachys.
 *
 * Covers the functional React API. Class components (Component,
 * PureComponent) are not supported -- a warning is thrown if they
 * are used.
 */

import { useState, useReducer, useCallback, startTransition } from "./component"
import { getActiveLane, Lane, flushUpdates } from "./scheduler"

// --- react ---

export { h as createElement, createTextVNode } from "./jsx"
export { VNode } from "./vnode"
export type { VNode as ReactElement } from "./vnode"
export type { ComponentFn as FunctionComponent, ComponentFn as FC } from "./vnode"
export { VNodeFlags, ChildFlags } from "./flags"
export { createRef } from "./ref"
export type { Ref, RefCallback, RefObject } from "./ref"
export { createContext, useContext } from "./context"
export type { Context } from "./context"
export { memo } from "./memo"
export type { MemoComponentFn } from "./memo"
export { forwardRef } from "./forward-ref"
export {
  ErrorBoundary,
  Suspense,
  startTransition,
  use,
  useCallback,
  useDebugValue,
  useDeferredValue,
  useEffect,
  useId,
  useImperativeHandle,
  useInsertionEffect,
  useLayoutEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
  useSyncExternalStore,
  useTransition,
} from "./component"
export type { EffectCleanup } from "./component"
export { lazy } from "./suspense"
export { __DEV__ } from "./dev"

// --- react-dom ---

export { createRoot, hydrateRoot, render } from "./render"
export type { Root } from "./render"
export { createPortal } from "./portal"
export { flushUpdates as flushSync } from "./scheduler"
export { unmount } from "./unmount"
export { mount } from "./mount"
export { patch } from "./diff"

// --- compat utilities ---

export { Children, cloneElement, isValidElement } from "./compat-util"

// --- Fragment sentinel ---

/**
 * Fragment type. In Tachys, fragments use `null` as the type.
 * This matches React's Fragment export for JSX compatibility.
 */
export const Fragment = null

// --- Stubs for class component detection ---

/**
 * Stub base class. Tachys does not support class components.
 * This export exists so that `instanceof Component` checks in
 * third-party libraries don't crash. Attempting to use it as an
 * actual class component will throw.
 */
export class Component {
  constructor() {
    throw new Error(
      "Tachys does not support class components. Use function components with hooks instead.",
    )
  }
}

export class PureComponent extends Component {}

// --- StrictMode ---

/**
 * No-op StrictMode component. In React, StrictMode enables additional
 * development warnings and double-invokes render functions. Tachys does
 * not implement double-invocation but exports this so that libraries
 * using <StrictMode> don't break.
 */
export function StrictMode(props: Record<string, unknown>): import("./vnode").VNode {
  return props["children"] as import("./vnode").VNode
}

// --- Profiler ---

/**
 * No-op Profiler component. In React, Profiler measures rendering
 * performance. Tachys exports this as a passthrough so that code
 * using <Profiler> doesn't break.
 */
export function Profiler(props: Record<string, unknown>): import("./vnode").VNode {
  return props["children"] as import("./vnode").VNode
}

// --- act ---

/**
 * Testing utility. Wraps a callback that triggers state updates and
 * flushes all pending work synchronously before returning.
 *
 * Compatible with React Testing Library's act() usage:
 *   await act(() => { button.click() })
 *   await act(async () => { await fetchData() })
 */
export async function act(callback: () => void | Promise<void>): Promise<void> {
  const result = callback()
  flushUpdates()
  // If the callback returned a promise, await it and flush again
  if (result !== undefined && result !== null && typeof (result as Promise<void>).then === "function") {
    await result
    flushUpdates()
  }
}

// --- React 19 form APIs ---

/**
 * useOptimistic provides optimistic UI updates. Returns the current
 * optimistic state and a function to apply optimistic updates.
 *
 * When updateFn is called, the state immediately reflects the optimistic
 * value. The passthrough (initial state) is the "confirmed" value from
 * the server or parent.
 *
 * @param passthrough - The actual/confirmed state value
 * @param updateFn - Optional reducer: (currentState, optimisticValue) => newState
 * @returns [optimisticState, addOptimistic]
 */
export function useOptimistic<T, A = T>(
  passthrough: T,
  updateFn?: (currentState: T, optimisticValue: A) => T,
): [T, (action: A) => void] {
  const [optimistic, setOptimistic] = useState<{ value: T; active: boolean }>({
    value: passthrough,
    active: false,
  })

  // During a Transition-lane render, revert to the passthrough (confirmed) value.
  // Optimistic state is only visible on urgent (Sync/Default) renders.
  const activeLane = getActiveLane()
  const inTransition = activeLane === Lane.Transition
  const current = optimistic.active && !inTransition ? optimistic.value : passthrough

  const addOptimistic = useCallback((action: A) => {
    const base = optimistic.active ? optimistic.value : passthrough
    const newValue = updateFn !== undefined ? updateFn(base, action) : (action as unknown as T)
    setOptimistic({ value: newValue, active: true })
  }, [optimistic, passthrough, updateFn])

  return [current, addOptimistic]
}

/**
 * useActionState manages form action state with a reducer pattern.
 * Returns the current state, a dispatch function, and a pending flag.
 *
 * @param action - Async reducer: (prevState, formData) => Promise<newState>
 * @param initialState - Initial state value
 * @param permalink - Optional permalink (unused in client-only mode)
 * @returns [state, dispatch, isPending]
 */
export function useActionState<S, P>(
  action: (prevState: S, payload: P) => S | Promise<S>,
  initialState: S,
  _permalink?: string,
): [S, (payload: P) => void, boolean] {
  const [state, setState] = useState(initialState)
  const [isPending, setIsPending] = useState(false)

  const dispatch = useCallback((payload: P) => {
    // Set isPending=true at urgent priority so it's visible immediately,
    // then resolve the action result inside a Transition so the state
    // update renders at lower priority (matching useTransition semantics).
    setIsPending(true)
    const result = action(state, payload)
    if (result !== null && typeof result === "object" && typeof (result as Promise<S>).then === "function") {
      ;(result as Promise<S>).then(
        (newState) => {
          startTransition(() => {
            setState(newState as S)
            setIsPending(false)
          })
        },
        () => {
          startTransition(() => {
            setIsPending(false)
          })
        },
      )
    } else {
      startTransition(() => {
        setState(result as S)
        setIsPending(false)
      })
    }
  }, [action, state])

  return [state, dispatch, isPending]
}

/**
 * useFormStatus returns the status of the parent form action.
 *
 * Since Tachys does not have a built-in form action runtime, this
 * always returns a "not pending" status. Libraries that check for
 * useFormStatus will get a stable, non-pending response.
 */
export function useFormStatus(): {
  pending: boolean
  data: FormData | null
  method: string | null
  action: string | null
} {
  return {
    pending: false,
    data: null,
    method: null,
    action: null,
  }
}

// --- version ---

export const version = "0.0.1"
