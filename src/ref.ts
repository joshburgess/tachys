/**
 * Ref handling — callback refs and object refs ({ current }).
 *
 * React 19 semantics: a callback ref may return a cleanup function. The
 * cleanup runs when the ref is replaced or when the element unmounts, and
 * replaces the usual `ref(null)` call on teardown.
 */

export interface RefObject<T = Element | Text | null> {
  current: T
}

export type RefCleanup = () => void
export type RefCallback = (el: Element | Text | null) => void | RefCleanup
export type Ref = RefCallback | RefObject

/**
 * Tracks cleanup functions returned by callback refs, keyed by their DOM node.
 * Only populated when a callback ref actually returns a cleanup (rare), so
 * the WeakMap stays empty in the common case.
 */
const refCleanups = new WeakMap<Element | Text, RefCleanup>()

/**
 * Create a ref object.
 */
export function createRef<T = Element | Text | null>(): RefObject<T | null> {
  return { current: null }
}

/**
 * Attach a ref to a DOM node (after mount). If the callback returns a
 * cleanup function, store it for the eventual clearRef call.
 */
export function setRef(ref: unknown, dom: Element | Text): void {
  if (typeof ref === "function") {
    const result = (ref as RefCallback)(dom)
    if (typeof result === "function") {
      refCleanups.set(dom, result as RefCleanup)
    }
  } else if (ref !== null && typeof ref === "object" && "current" in ref) {
    ;(ref as RefObject).current = dom
  }
}

/**
 * Detach a ref. When a callback ref previously returned a cleanup function,
 * invoke that cleanup instead of calling `ref(null)` -- per React 19.
 *
 * `dom` is required for callback refs so the cleanup can be looked up.
 */
export function clearRef(ref: unknown, dom?: Element | Text): void {
  if (typeof ref === "function") {
    if (dom !== undefined) {
      const cleanup = refCleanups.get(dom)
      if (cleanup !== undefined) {
        refCleanups.delete(dom)
        cleanup()
        return
      }
    }
    ;(ref as RefCallback)(null)
  } else if (ref !== null && typeof ref === "object" && "current" in ref) {
    ;(ref as RefObject).current = null
  }
}
