/**
 * Fine-grained reactive DOM bindings.
 *
 * These utilities create direct DOM subscriptions from Aeon Behaviors,
 * bypassing the vdom diff entirely. Instead of re-rendering a component
 * when a Behavior changes, the DOM node is updated directly.
 *
 * Two approaches:
 *
 * 1. `Reactive` component -- renders its Behavior child as text,
 *    updating the text node directly when the Behavior changes.
 *
 * 2. `bindProp` / `bindText` -- low-level functions that attach
 *    a Behavior subscription directly to a DOM node via refs.
 */

import { readBehavior } from "aeon-core"
import type { Behavior, Disposable, Scheduler } from "aeon-types"
import { type VNode, h, useEffect, useRef } from "tachys"
import { runEvent } from "./internal.js"
import { createScheduler } from "./scheduler.js"

// --- Reactive text component ---

/**
 * A component that renders a Behavior as text, updating the DOM node
 * directly when the Behavior changes. No vdom diff on update.
 *
 * @param props.value - A Behavior whose value is rendered as text
 * @param props.trigger - Event that signals when to re-read the Behavior
 * @param props.scheduler - Optional scheduler
 *
 * @example
 * ```tsx
 * import { Reactive } from "tachys-aeon"
 *
 * function Timer({ elapsed }: { elapsed: Behavior<number> }) {
 *   return <div>Time: <Reactive value={elapsed} trigger={ticks} /></div>
 * }
 * ```
 */
export function Reactive(props: Record<string, unknown>): VNode {
  const value = props["value"] as Behavior<unknown, never>
  const trigger = props["trigger"] as import("aeon-types").Event<unknown, never>
  const sched = (props["scheduler"] as Scheduler | undefined) ?? createScheduler()
  const spanRef = useRef<Element | null>(null)

  // Initial render: read the behavior value
  const initial = readBehavior(value, sched.currentTime())

  useEffect(() => {
    const el = spanRef.current
    if (el === null) return

    // Subscribe to the trigger event and update the DOM directly
    const disposable = runEvent(
      trigger,
      {
        event() {
          const v = readBehavior(value, sched.currentTime())
          el.textContent = String(v)
        },
        error() {},
        end() {},
      },
      sched,
    )

    return () => disposable.dispose()
  }, [])

  return h("span", { ref: spanRef }, String(initial))
}

// --- Low-level binding functions ---

/**
 * Bind a Behavior to a DOM element's text content. Returns a cleanup function.
 *
 * This is a low-level escape hatch for cases where you have direct
 * DOM access. Prefer `Reactive` or `useBehavior` in most cases.
 *
 * @param element - The DOM element to update
 * @param behavior - The Behavior to read
 * @param trigger - Event that signals when to re-read
 * @param scheduler - Optional scheduler
 * @returns Disposable that unsubscribes
 */
export function bindText<A>(
  element: Element,
  behavior: Behavior<A, never>,
  trigger: import("aeon-types").Event<unknown, never>,
  scheduler?: Scheduler,
): Disposable {
  const sched = scheduler ?? createScheduler()

  // Set initial value
  element.textContent = String(readBehavior(behavior, sched.currentTime()))

  return runEvent(
    trigger,
    {
      event() {
        element.textContent = String(readBehavior(behavior, sched.currentTime()))
      },
      error() {},
      end() {},
    },
    sched,
  )
}

/**
 * Bind a Behavior to a DOM element's attribute. Returns a cleanup function.
 *
 * @param element - The DOM element to update
 * @param attr - The attribute name (e.g., "class", "style", "value")
 * @param behavior - The Behavior to read
 * @param trigger - Event that signals when to re-read
 * @param scheduler - Optional scheduler
 * @returns Disposable that unsubscribes
 */
export function bindAttr<A>(
  element: Element,
  attr: string,
  behavior: Behavior<A, never>,
  trigger: import("aeon-types").Event<unknown, never>,
  scheduler?: Scheduler,
): Disposable {
  const sched = scheduler ?? createScheduler()

  const apply = (): void => {
    const v = readBehavior(behavior, sched.currentTime())
    if (attr === "className" || attr === "class") {
      ;(element as HTMLElement).className = String(v)
    } else if (attr === "value") {
      ;(element as HTMLInputElement).value = String(v)
    } else if (attr === "checked") {
      ;(element as HTMLInputElement).checked = Boolean(v)
    } else if (attr === "style" && typeof v === "object" && v !== null) {
      Object.assign((element as HTMLElement).style, v)
    } else if (v === null || v === undefined || v === false) {
      element.removeAttribute(attr)
    } else {
      element.setAttribute(attr, String(v))
    }
  }

  // Set initial value
  apply()

  return runEvent(
    trigger,
    {
      event() {
        apply()
      },
      error() {},
      end() {},
    },
    sched,
  )
}
