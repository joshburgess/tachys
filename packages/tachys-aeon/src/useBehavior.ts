/**
 * useBehavior -- sample an Aeon Behavior during render.
 *
 * Returns the current value of the Behavior at the current scheduler time.
 *
 * When a `trigger` Event is provided, the component re-renders each time
 * the trigger fires. Without a trigger, the Behavior is sampled once per
 * render (re-sampled only when the parent re-renders or another hook
 * triggers an update).
 *
 * For the common case of an Event-driven Behavior, use `useStepper`
 * or `useAccum` which handle both Behavior creation and subscriptions.
 */

import type { Behavior, Event, Scheduler } from "aeon-types"
import { readBehavior } from "aeon-core"
import { useEffect, useReducer, useRef } from "tachys"
import { runEvent } from "./internal.js"
import { createScheduler } from "./scheduler.js"

/**
 * Sample a Behavior, optionally re-rendering on a trigger Event.
 *
 * @param behavior - The Behavior to sample
 * @param trigger - Optional Event that drives re-renders
 * @param scheduler - Optional scheduler (defaults to shared scheduler)
 * @returns The current value of the Behavior
 *
 * @example
 * ```tsx
 * // Static sampling
 * const pos = useBehavior(mousePosition)
 *
 * // Re-sample on every animation frame
 * const pos = useBehavior(mousePosition, animationFrames)
 * ```
 */
export function useBehavior<A>(
  behavior: Behavior<A, never>,
  trigger?: Event<unknown, never>,
  scheduler?: Scheduler,
): A {
  const sched = scheduler ?? createScheduler()
  const [, forceRender] = useReducer<number, void>((n) => n + 1, 0)
  const triggerRef = useRef(trigger)
  triggerRef.current = trigger

  useEffect(() => {
    const trig = triggerRef.current
    if (trig === undefined) return

    const disposable = runEvent(
      trig,
      {
        event() { forceRender() },
        error() {},
        end() {},
      },
      sched,
    )

    return () => disposable.dispose()
  }, [])

  return readBehavior(behavior, sched.currentTime())
}
