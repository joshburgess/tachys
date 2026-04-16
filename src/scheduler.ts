/**
 * Priority-based scheduler with time slicing and lane-aware rendering.
 *
 * Updates are assigned to lanes (priority levels). Higher-priority work
 * interrupts lower-priority work. Time slicing yields to the browser
 * between work units (~5ms budget per slice) using MessageChannel.
 *
 * Lanes (highest to lowest priority):
 *   Sync       - User input, must finish synchronously (no yielding)
 *   Default    - Normal state updates, time-sliced
 *   Transition - Deferred work (startTransition), can be interrupted
 *
 * Components use a per-lane bitmask (_queuedLanes) so a single component
 * can be queued in multiple lanes simultaneously. This is essential for
 * transitions: a component may have a Default-lane update (isPending=true)
 * and a Transition-lane update (the actual deferred work) pending at the
 * same time.
 *
 * When the auto-scheduler processes work, it defers Transition-lane work
 * to a separate frame when there was also urgent (Sync/Default) work in
 * the same flush. This creates a paint boundary so the urgent render is
 * visible before the transition render begins.
 *
 * flushUpdates() drains all lanes synchronously (for testing).
 */

import type { ComponentInstance } from "./component"

// --- Lanes ---

export const Lane = {
  Sync: 0,
  Default: 1,
  Transition: 2,
} as const

export type Lane = (typeof Lane)[keyof typeof Lane]

// --- State ---

/** Per-lane queues. Index corresponds to Lane value. */
const laneQueues: ComponentInstance[][] = [[], [], []]

let isFlushing = false
let isScheduled = false

/** Sentinel value: no lane is active (scheduler idle). */
const IDLE_LANE = -1 as const

/** The lane currently being processed (or IDLE_LANE if idle). */
let activeLane: Lane | typeof IDLE_LANE = IDLE_LANE

/** Timestamp when the current time slice started. */
let sliceStart = 0

/** Time budget per slice in ms. ~5ms keeps us under one frame at 60fps. */
const SLICE_BUDGET = 5

/** Current transition lane context. Set by startTransition. */
let currentLane: Lane = Lane.Default

// --- MessageChannel for yielding ---

let scheduleCallback: (fn: () => void) => void
let isMessageChannelAvailable = false

// Use MessageChannel for yielding if available (browser), otherwise microtask (SSR/tests)
if (typeof MessageChannel !== "undefined") {
  const channel = new MessageChannel()
  let pendingCallback: (() => void) | null = null

  channel.port1.onmessage = () => {
    if (pendingCallback !== null) {
      const fn = pendingCallback
      pendingCallback = null
      fn()
    }
  }

  scheduleCallback = (fn: () => void) => {
    pendingCallback = fn
    channel.port2.postMessage(null)
  }
  isMessageChannelAvailable = true
} else {
  scheduleCallback = (fn: () => void) => {
    queueMicrotask(fn)
  }
}

// --- Public API ---

/**
 * Schedule a component for re-rendering at a given priority.
 *
 * Uses a per-lane bitmask so the same component can be queued in multiple
 * lanes simultaneously (e.g. Default + Transition for useTransition).
 *
 * @param instance - The component instance to re-render
 * @param lane - Priority lane (defaults to currentLane)
 */
export function scheduleUpdate(instance: ComponentInstance, lane?: Lane): void {
  const targetLane = lane ?? currentLane
  const laneBit = 1 << targetLane

  // Already queued in this lane -- skip
  if (instance._queuedLanes & laneBit) return
  instance._queuedLanes |= laneBit

  laneQueues[targetLane]!.push(instance)

  if (!isScheduled) {
    isScheduled = true
    if (targetLane === Lane.Sync) {
      // Sync lane: flush immediately via microtask (no yielding)
      queueMicrotask(autoFlush)
    } else {
      // Default/Transition: use MessageChannel for time slicing
      scheduleCallback(autoFlush)
    }
  }
}

/**
 * Set the current lane context. Used by startTransition.
 */
export function setCurrentLane(lane: Lane): void {
  currentLane = lane
}

/**
 * Get the current lane context.
 */
export function getCurrentLane(): Lane {
  return currentLane
}

/**
 * Get the lane currently being processed (-1 if idle).
 */
export function getActiveLane(): Lane | -1 {
  return activeLane
}

/**
 * Check if the current time slice has expired.
 * Returns true if we should yield to the browser.
 */
export function shouldYield(): boolean {
  if (activeLane === Lane.Sync) return false
  return performance.now() - sliceStart > SLICE_BUDGET
}

// --- Auto-flush (from scheduler) ---

/**
 * Automatic flush triggered by the scheduler. Processes Sync and Default
 * lanes, then defers Transition lane to a separate frame (paint boundary)
 * if urgent work was also processed. If only Transition work exists, it
 * processes immediately.
 */
function autoFlush(): void {
  if (isFlushing) return
  isFlushing = true
  isScheduled = false

  let processedUrgent = false

  // Process Sync and Default lanes
  for (let lane = Lane.Sync; lane <= Lane.Default; lane++) {
    const queue = laneQueues[lane]!
    if (queue.length === 0) continue

    processedUrgent = true
    activeLane = lane
    sliceStart = performance.now()

    while (queue.length > 0) {
      // Check for higher-priority work
      if (lane > Lane.Sync && hasHigherPriorityWork(lane)) {
        for (let hp = Lane.Sync; hp < lane; hp++) {
          processQueue(laneQueues[hp]!, hp)
        }
        sliceStart = performance.now()
      }

      const instance = queue.shift()!
      instance._queuedLanes &= ~(1 << lane)
      instance._rerender()

      // Time slice yielding
      if (lane !== Lane.Sync && shouldYield() && queue.length > 0) {
        activeLane = IDLE_LANE
        isFlushing = false
        isScheduled = true
        scheduleCallback(autoFlush)
        return
      }
    }
  }

  // Transition lane
  const transitionQueue = laneQueues[Lane.Transition]!
  if (transitionQueue.length > 0) {
    if (processedUrgent && isMessageChannelAvailable) {
      // Defer to next frame so the urgent renders paint first
      activeLane = IDLE_LANE
      isFlushing = false
      if (!isScheduled) {
        isScheduled = true
        scheduleCallback(autoFlush)
      }
      return
    }

    // No urgent work was processed (or no MessageChannel) -- run Transition now
    activeLane = Lane.Transition
    sliceStart = performance.now()

    while (transitionQueue.length > 0) {
      // Check for higher-priority work that arrived
      if (hasHigherPriorityWork(Lane.Transition)) {
        for (let hp = Lane.Sync; hp < Lane.Transition; hp++) {
          processQueue(laneQueues[hp]!, hp)
        }
        sliceStart = performance.now()
      }

      const instance = transitionQueue.shift()!
      instance._queuedLanes &= ~(1 << Lane.Transition)
      instance._rerender()

      if (shouldYield() && transitionQueue.length > 0) {
        activeLane = IDLE_LANE
        isFlushing = false
        isScheduled = true
        scheduleCallback(autoFlush)
        return
      }
    }
  }

  activeLane = IDLE_LANE
  isFlushing = false
}

// --- Manual flush (for testing) ---

/**
 * Flush all pending updates synchronously.
 * Processes all lanes in priority order without deferring Transition work.
 *
 * Exposed for testing -- normally updates are flushed via the auto-scheduler.
 */
export function flushUpdates(): void {
  if (isFlushing) return
  isFlushing = true
  isScheduled = false

  processAllLanes()

  isFlushing = false
}

function processAllLanes(): void {
  for (let lane = Lane.Sync; lane <= Lane.Transition; lane++) {
    const queue = laneQueues[lane]!

    if (queue.length === 0) continue

    activeLane = lane
    sliceStart = performance.now()

    while (queue.length > 0) {
      // Check for higher-priority work that arrived during this lane
      if (lane > Lane.Sync && hasHigherPriorityWork(lane)) {
        for (let hp = Lane.Sync; hp < lane; hp++) {
          processQueue(laneQueues[hp]!, hp)
        }
        sliceStart = performance.now()
      }

      const instance = queue.shift()!
      instance._queuedLanes &= ~(1 << lane)
      instance._rerender()

      // Check if we should yield (not for Sync lane)
      if (lane !== Lane.Sync && shouldYield() && queue.length > 0) {
        // Yield and reschedule
        activeLane = IDLE_LANE
        isFlushing = false
        isScheduled = true
        scheduleCallback(flushUpdates)
        return
      }
    }
  }

  activeLane = IDLE_LANE
}

function processQueue(queue: ComponentInstance[], lane: Lane): void {
  const prevActiveLane = activeLane
  activeLane = lane
  sliceStart = performance.now()

  while (queue.length > 0) {
    const instance = queue.shift()!
    instance._queuedLanes &= ~(1 << lane)
    instance._rerender()
  }

  activeLane = prevActiveLane
}

function hasHigherPriorityWork(currentLane: Lane): boolean {
  for (let i = 0; i < currentLane; i++) {
    if (laneQueues[i]!.length > 0) return true
  }
  return false
}

/**
 * Flush only the Sync lane. Used internally when we need synchronous
 * resolution of high-priority work without touching other lanes.
 */
export function flushSyncWork(): void {
  const queue = laneQueues[Lane.Sync]!
  if (queue.length === 0) return

  const prevFlushing = isFlushing
  isFlushing = true
  processQueue(queue, Lane.Sync)
  isFlushing = prevFlushing
}
