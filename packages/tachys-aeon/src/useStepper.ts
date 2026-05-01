/**
 * useStepper -- hold the latest value from an Aeon Event.
 *
 * Creates a Behavior that tracks the latest event value (via Aeon's
 * `stepper`), and re-renders the component each time a new value arrives.
 *
 * This is the most common pattern for connecting Aeon Events to Tachys
 * components: it combines Behavior creation, Event subscription, and
 * component re-rendering into a single hook.
 */

import { readBehavior, stepper } from "aeon-core"
import type { Event, Scheduler } from "aeon-types"
import { useEffect, useMemo, useReducer } from "tachys"
import { runEvent } from "./internal.js"
import { createScheduler } from "./scheduler.js"

/**
 * Hold the latest value from an Event, re-rendering on each update.
 *
 * @param initial - Initial value before any event fires
 * @param event - The Event stream to track
 * @param scheduler - Optional scheduler (defaults to shared scheduler)
 * @returns The latest value (initial until first event)
 *
 * @example
 * ```tsx
 * function MouseTracker({ moves }: { moves: Event<{ x: number; y: number }> }) {
 *   const pos = useStepper({ x: 0, y: 0 }, moves)
 *   return <div>Mouse: {pos.x}, {pos.y}</div>
 * }
 * ```
 */
export function useStepper<A>(initial: A, event: Event<A, never>, scheduler?: Scheduler): A {
  const sched = scheduler ?? createScheduler()
  const [, forceRender] = useReducer<number, void>((n) => n + 1, 0)

  // Create the stepper Behavior and its disposable once
  const [behavior, stepperDisposable] = useMemo(() => stepper(initial, event, sched), [])

  // Subscribe to the driving event to trigger re-renders
  useEffect(() => {
    const disposable = runEvent(
      event,
      {
        event() {
          forceRender()
        },
        error() {},
        end() {},
      },
      sched,
    )

    return () => {
      disposable.dispose()
      stepperDisposable.dispose()
    }
  }, [])

  return readBehavior(behavior, sched.currentTime())
}
