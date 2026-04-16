/**
 * Suspense + lazy() support.
 *
 * Suspense is a component that shows fallback UI while any descendant
 * lazy component is loading. Uses a global suspend handler stack (same
 * pattern as ErrorBoundary's error handler stack) that
 * mountComponent/patchComponent push/pop around child rendering.
 *
 * When a lazy component's module is not yet loaded, renderComponent
 * catches the thrown Promise and propagates it to the nearest Suspense
 * boundary via the suspend handler stack.
 *
 * lazy() wraps a dynamic import and returns a component function.
 * On first render (before the import resolves), it throws a Promise.
 * Once resolved, it delegates to the loaded component.
 */

import type { ComponentFn } from "./vnode"
import type { VNode } from "./vnode"

// --- Suspend handler stack ---

const suspendHandlers: Array<(promise: Promise<unknown>) => void> = []

export function pushSuspendHandler(handler: (promise: Promise<unknown>) => void): void {
  suspendHandlers.push(handler)
}

export function popSuspendHandler(): void {
  suspendHandlers.pop()
}

/**
 * Called from renderComponent when a component throws a thenable.
 * Propagates the promise to the nearest Suspense boundary.
 * Returns true if a boundary handled it.
 */
export function propagateSuspend(promise: Promise<unknown>): boolean {
  if (suspendHandlers.length > 0) {
    suspendHandlers[suspendHandlers.length - 1]!(promise)
    return true
  }
  return false
}

/**
 * Check whether a value is a thenable (Promise-like).
 */
export function isThenable(value: unknown): value is Promise<unknown> {
  return (
    value !== null &&
    typeof value === "object" &&
    typeof (value as Record<string, unknown>)["then"] === "function"
  )
}

/**
 * Check whether a component function is tagged as a Suspense boundary.
 */
export function isSuspenseFn(type: ComponentFn): boolean {
  return "_suspense" in type
}

// --- lazy() ---

interface LazyState<T> {
  status: "pending" | "resolved" | "rejected"
  result: T | null
  error: unknown
  promise: Promise<void> | null
}

/**
 * Wrap a dynamic import into a component that integrates with Suspense.
 *
 * The loader function should return a Promise that resolves to a module
 * with a `default` export (the component function).
 *
 * @param loader - A function returning a dynamic import, e.g. `() => import("./MyComp")`
 * @returns A component function that renders the loaded component
 */
export function lazy(
  loader: () => Promise<{ default: ComponentFn }>,
): ComponentFn & { displayName: string } {
  const state: LazyState<ComponentFn> = {
    status: "pending",
    result: null,
    error: null,
    promise: null,
  }

  const LazyComponent = (props: Record<string, unknown>): VNode => {
    if (state.status === "resolved") {
      return state.result!(props)
    }
    if (state.status === "rejected") {
      throw state.error
    }
    // Start loading if not already
    if (state.promise === null) {
      state.promise = loader().then(
        (mod) => {
          state.status = "resolved"
          state.result = mod.default
        },
        (err) => {
          state.status = "rejected"
          state.error = err
        },
      )
    }
    // Throw the promise so renderComponent can catch it and propagate to Suspense
    throw state.promise
  }

  LazyComponent.displayName = "Lazy"
  return LazyComponent
}
