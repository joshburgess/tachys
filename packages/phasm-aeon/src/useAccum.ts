/**
 * useAccum -- accumulate Event values with a reducer.
 *
 * Creates a Behavior that folds over Event values (via Aeon's `accumB`),
 * and re-renders the component each time a new value arrives.
 *
 * This is the FRP equivalent of useReducer: instead of dispatching
 * actions imperatively, the reducer is driven by an Event stream.
 */

import type { Event, Scheduler } from "aeon-types"
import { accumB, readBehavior } from "aeon-core"
import { useEffect, useMemo, useReducer } from "phasm"
import { runEvent } from "./internal.js"
import { createScheduler } from "./scheduler.js"

/**
 * Accumulate Event values into a folded state, re-rendering on each update.
 *
 * @param reducer - Fold function: (accumulator, eventValue) => newAccumulator
 * @param initial - Initial accumulator value
 * @param event - The Event stream to fold over
 * @param scheduler - Optional scheduler (defaults to shared scheduler)
 * @returns The current accumulated value
 *
 * @example
 * ```tsx
 * function Counter({ clicks }: { clicks: Event<void> }) {
 *   const count = useAccum((n, _) => n + 1, 0, clicks)
 *   return <div>Count: {count}</div>
 * }
 *
 * function TodoList({ actions }: { actions: Event<Action> }) {
 *   const todos = useAccum(todoReducer, [], actions)
 *   return <ul>{todos.map(t => <li key={t.id}>{t.text}</li>)}</ul>
 * }
 * ```
 */
export function useAccum<A, B>(
  reducer: (acc: B, value: A) => B,
  initial: B,
  event: Event<A, never>,
  scheduler?: Scheduler,
): B {
  const sched = scheduler ?? createScheduler()
  const [, forceRender] = useReducer<number, void>((n) => n + 1, 0)

  // Create the accumulating Behavior and its disposable once
  const [behavior, accumDisposable] = useMemo(
    () => accumB(reducer, initial, event, sched),
    [],
  )

  // Subscribe to the driving event to trigger re-renders
  useEffect(() => {
    const disposable = runEvent(
      event,
      {
        event() { forceRender() },
        error() {},
        end() {},
      },
      sched,
    )

    return () => {
      disposable.dispose()
      accumDisposable.dispose()
    }
  }, [])

  return readBehavior(behavior, sched.currentTime())
}
