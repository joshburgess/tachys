/**
 * Ref handling — callback refs and object refs ({ current }).
 */

export interface RefObject<T = Element | Text | null> {
  current: T
}

export type RefCallback = (el: Element | Text | null) => void
export type Ref = RefCallback | RefObject

/**
 * Create a ref object.
 */
export function createRef<T = Element | Text | null>(): RefObject<T | null> {
  return { current: null }
}

/**
 * Set a ref to a DOM node (after mount).
 */
export function setRef(ref: unknown, dom: Element | Text): void {
  if (typeof ref === "function") {
    ;(ref as RefCallback)(dom)
  } else if (ref !== null && typeof ref === "object" && "current" in ref) {
    ;(ref as RefObject).current = dom
  }
}

/**
 * Clear a ref (on unmount).
 */
export function clearRef(ref: unknown): void {
  if (typeof ref === "function") {
    ;(ref as RefCallback)(null)
  } else if (ref !== null && typeof ref === "object" && "current" in ref) {
    ;(ref as RefObject).current = null
  }
}
