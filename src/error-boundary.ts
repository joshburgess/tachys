/**
 * Error boundary support.
 *
 * ErrorBoundary is a component that catches errors thrown during rendering
 * of its descendants. When an error is caught, it re-renders synchronously
 * with fallback UI provided via the `fallback` prop.
 *
 * Uses a global handler stack (safe because rendering is synchronous and
 * single-threaded) that mountComponent/patchComponent push/pop around
 * child mounting. When renderComponent catches an error, it propagates
 * to the nearest error handler on the stack.
 */

import type { ComponentFn } from "./vnode"

/**
 * Component function tagged as an error boundary.
 */
export interface ErrorBoundaryFn extends ComponentFn {
  _errorBoundary: true
}

// --- Error handler stack ---

const errorHandlers: Array<(err: unknown) => void> = []

export function pushErrorHandler(handler: (err: unknown) => void): void {
  errorHandlers.push(handler)
}

export function popErrorHandler(): void {
  errorHandlers.pop()
}

/**
 * Called from renderComponent when a component throws.
 * Propagates the error to the nearest boundary.
 * Returns true if a boundary handled the error.
 */
export function propagateRenderError(err: unknown): boolean {
  if (errorHandlers.length > 0) {
    errorHandlers[errorHandlers.length - 1]!(err)
    return true
  }
  return false
}

/**
 * Check whether a component function is tagged as an error boundary.
 */
export function isErrorBoundaryFn(type: ComponentFn): boolean {
  return "_errorBoundary" in type
}
