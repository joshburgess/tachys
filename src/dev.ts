/**
 * Development-mode warnings.
 *
 * All warnings are guarded by `__DEV__` (true when process.env.NODE_ENV
 * is not "production"). Consumer bundlers (Vite, webpack, esbuild, Rollup)
 * replace `process.env.NODE_ENV` at build time, allowing dead-code
 * elimination to strip the entire module in production builds.
 *
 * Warnings are deduplicated by message to avoid flooding the console
 * during rapid re-renders.
 */

declare const process: { env: { NODE_ENV?: string } } | undefined

export const __DEV__: boolean =
  typeof process !== "undefined" && process.env.NODE_ENV !== "production"

const warnedMessages = new Set<string>()

/**
 * Emit a console warning in development mode. Each unique message is
 * only printed once per session to avoid noise during re-renders.
 */
export function warnOnce(message: string): void {
  if (!warnedMessages.has(message)) {
    warnedMessages.add(message)
    console.warn(`[Phasm] ${message}`)
  }
}

/**
 * Emit a console warning in development mode. Unlike warnOnce, this
 * prints every time it is called (useful for per-instance warnings).
 */
export function warn(message: string): void {
  console.warn(`[Phasm] ${message}`)
}

/**
 * Get a human-readable name for a component function.
 *
 * Checks (in order): displayName, function.name, fallback "Anonymous".
 * Works with memo, forwardRef, and plain component functions.
 */
export function getComponentName(type: ComponentFnLike): string {
  if (type === null || type === undefined) return "Anonymous"
  if (typeof type === "string") return type
  if (typeof type !== "function") return "Anonymous"
  if ("displayName" in type && typeof type.displayName === "string" && type.displayName !== "") {
    return type.displayName
  }
  // _inner is set by memo() to point to the wrapped component
  if ("_inner" in type) {
    return getComponentName(type._inner as ComponentFnLike)
  }
  if (type.name !== "") {
    return type.name
  }
  return "Anonymous"
}

/**
 * Minimal type for component-like values accepted by getComponentName.
 */
type ComponentFnLike = ((...args: never[]) => unknown) | string | null | undefined

/**
 * Reset the deduplication set. Exposed for testing.
 */
export function resetWarnings(): void {
  warnedMessages.clear()
}
