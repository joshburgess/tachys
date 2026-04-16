/**
 * Batched async update scheduler.
 *
 * Uses queueMicrotask to batch multiple setState calls into a single re-render pass.
 * Maintains a deduplicated queue of components that need re-rendering.
 */

import type { ComponentInstance } from "./component"

let updateQueue: ComponentInstance[] = []
let isFlushing = false
let isFlushScheduled = false

/**
 * Schedule a component for re-rendering.
 * Multiple calls with the same component are deduplicated.
 *
 * @param instance - The component instance to re-render
 */
export function scheduleUpdate(instance: ComponentInstance): void {
  // Deduplicate — don't queue the same component twice
  if (instance._queued) return
  instance._queued = true

  updateQueue.push(instance)

  if (!isFlushScheduled) {
    isFlushScheduled = true
    queueMicrotask(flushUpdates)
  }
}

/**
 * Flush all pending updates synchronously.
 * Exposed for testing — normally updates are flushed via microtask.
 */
export function flushUpdates(): void {
  if (isFlushing) return
  isFlushing = true
  isFlushScheduled = false

  // Process the queue — components may schedule more updates during rendering,
  // so we loop until the queue is empty
  while (updateQueue.length > 0) {
    const queue = updateQueue
    updateQueue = []

    for (let i = 0; i < queue.length; i++) {
      const instance = queue[i]!
      instance._queued = false
      instance._rerender()
    }
  }

  isFlushing = false
}
