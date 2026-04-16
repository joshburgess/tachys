/**
 * useAdapter -- create an imperative push/event pair.
 *
 * Returns a stable [push, event] tuple where:
 * - `push(value)` sends a value to all current subscribers
 * - `event` is a subscribable Aeon Event stream
 *
 * The pair is created once and stable across re-renders.
 * This is the primary way to bridge imperative UI events
 * (button clicks, form inputs) into the Aeon reactive world.
 */

import type { Event } from "aeon-types"
import { createAdapter } from "aeon-core"
import { useMemo } from "phasm"

/**
 * Create a stable push/event adapter pair.
 *
 * @returns [push, event] where push sends values into the event stream
 *
 * @example
 * ```tsx
 * function Counter() {
 *   const [pushClick, clicks] = useAdapter<void>()
 *   const [count, setCount] = useState(0)
 *
 *   useEvent(clicks, () => setCount(c => c + 1))
 *
 *   return <button onClick={() => pushClick()}>Count: {count}</button>
 * }
 * ```
 */
export function useAdapter<A>(): [push: (value: A) => void, event: Event<A, never>] {
  return useMemo(() => createAdapter<A>(), [])
}
