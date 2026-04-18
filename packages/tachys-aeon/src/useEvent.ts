/**
 * useEvent -- subscribe to an Aeon Event stream.
 *
 * Calls a handler function for each value emitted by the Event.
 * The subscription is automatically disposed when the component unmounts.
 *
 * Unlike useBehavior, this does NOT trigger re-renders by default.
 * The handler receives values and can call setState or other hooks
 * to trigger renders as needed.
 */

import type { Event, Scheduler } from "aeon-types"
import { useEffect, useRef } from "tachys"
import { runEvent } from "./internal.js"
import { createScheduler } from "./scheduler.js"

/**
 * Subscribe to an Aeon Event stream with automatic cleanup.
 *
 * @param event - The Event stream to subscribe to
 * @param handler - Callback invoked for each emitted value
 * @param scheduler - Optional scheduler (defaults to shared scheduler)
 *
 * @example
 * ```tsx
 * function Logger({ clicks }: { clicks: Event<MouseEvent> }) {
 *   const [count, setCount] = useState(0)
 *
 *   useEvent(clicks, () => {
 *     setCount(c => c + 1)
 *   })
 *
 *   return <div>Clicks: {count}</div>
 * }
 * ```
 */
export function useEvent<A>(
  event: Event<A, never>,
  handler: (value: A) => void,
  scheduler?: Scheduler,
): void {
  const sched = scheduler ?? createScheduler()
  const handlerRef = useRef(handler)
  handlerRef.current = handler

  const eventRef = useRef(event)
  eventRef.current = event

  useEffect(() => {
    const disposable = runEvent(
      eventRef.current!,
      {
        event(_time, value) {
          handlerRef.current!(value)
        },
        error() {},
        end() {},
      },
      sched,
    )

    return () => disposable.dispose()
  }, [])
}
