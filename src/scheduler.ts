/**
 * Priority-based scheduler with time slicing, lane-aware rendering,
 * and two-phase commit for Transition work.
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
 * Two-phase commit (Transition lane only):
 *   Render phase  - Component functions run, VNode tree is diffed, but
 *                   structural DOM mutations (appendChild, insertBefore,
 *                   removeChild) are collected into an effect queue
 *                   instead of applied immediately.
 *   Commit phase  - All queued DOM effects are replayed atomically once
 *                   the entire Transition render completes.
 *
 * Sync and Default lanes use direct DOM mutation (zero overhead). The
 * effect queue is only active during Transition processing.
 *
 * When urgent work interrupts a Transition render, effect collection is
 * paused so the urgent work executes DOM operations directly. Collection
 * resumes when the Transition render continues.
 *
 * When the auto-scheduler processes work, it defers Transition-lane work
 * to a separate frame when there was also urgent (Sync/Default) work in
 * the same flush. This creates a paint boundary so the urgent render is
 * visible before the transition render begins.
 *
 * flushUpdates() drains all lanes synchronously (for testing).
 */

import type { ComponentInstance } from "./component"
import { drainPassiveEffects, hasPendingPassiveEffects } from "./component"
import {
  beginCollecting,
  clearTransitionRestorers,
  commitEffects,
  discardEffects,
  flushDeferredEffects,
  pauseCollecting,
  restoreTransitionState,
  resumeCollecting,
} from "./effects"
import { bridgeRerender } from "./reconcile-bridge"
import { LANE_IDLE, R } from "./render-state"
import { discardPendingWork, resumePendingWork } from "./work-loop"

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

/** The IDLE_LANE constant from render-state (re-exported for internal use). */
const IDLE_LANE = LANE_IDLE

/** Timestamp when the current time slice started. */
let sliceStart = 0

/** Time budget per slice in ms. ~5ms keeps us under one frame at 60fps. */
const SLICE_BUDGET = 5

/** Current transition lane context. Set by startTransition. */
let currentLane: Lane = Lane.Sync

/**
 * Depth of nested batchedUpdates scopes. While > 0, scheduleUpdate queues
 * components without posting a microtask/task; the batch scope flushes
 * synchronously when it exits. This collapses handler+render into one
 * FunctionCall (matches Inferno's linkEvent dispatch).
 */
let batchDepth = 0

/**
 * Transition generation counter. Incremented each time a Transition-lane
 * update is scheduled. Used to detect when a new Transition supersedes
 * an in-progress one (the generation advances while the old Transition
 * is yielded across frames).
 */
let _transitionGen = 0

/**
 * Generation snapshot taken when Transition processing begins. If
 * _transitionGen !== _transitionRenderGen when resuming after a yield,
 * the in-progress Transition has been superseded.
 */
let _transitionRenderGen = 0

/**
 * Instances processed during the current Transition batch. On
 * abandonment, these are re-queued so the new Transition re-renders them.
 */
const _processedInstances: ComponentInstance[] = []

/**
 * Whether the current Transition render was suspended by a Suspense
 * boundary. Set by signalTransitionSuspended() when a component throws
 * a thenable during Transition-lane processing. The scheduler checks
 * this after the Transition loop completes -- if true, the Transition
 * is abandoned (effects discarded, VNode state restored) instead of
 * committed, keeping the old committed UI visible.
 */
let _transitionSuspended = false

/**
 * The promise that suspended the current Transition. After abandonment,
 * the scheduler attaches a .then() to re-schedule the Transition queue
 * when the data resolves.
 */
let _suspendedPromise: Promise<unknown> | null = null

// --- MessageChannel for yielding ---

let scheduleCallback: (fn: () => void) => void
let scheduleAfterPaint: (fn: () => void) => void
let isMessageChannelAvailable = false

// Use MessageChannel for yielding if available (browser), otherwise microtask (SSR/tests)
if (typeof MessageChannel !== "undefined") {
  const channel = new MessageChannel()
  // FIFO queue of pending callbacks. A single slot would race: independent
  // schedule paths (autoFlush via scheduleCallback, drainPassiveEffects via
  // scheduleAfterPaint) can both fire before the first onmessage drains, and
  // a single-slot variable would silently drop the earlier callback. The
  // queue keeps each scheduled function distinct.
  const pendingCallbacks: Array<() => void> = []

  channel.port1.onmessage = () => {
    const fn = pendingCallbacks.shift()
    if (fn !== undefined) fn()
  }

  scheduleCallback = (fn: () => void) => {
    pendingCallbacks.push(fn)
    channel.port2.postMessage(null)
  }
  isMessageChannelAvailable = true

  // Schedule a callback guaranteed to run after the browser paints.
  // rAF fires right before paint; a MessageChannel posted from rAF
  // fires right after paint. This creates a true paint boundary so
  // urgent renders are visible before transition work begins.
  if (typeof requestAnimationFrame !== "undefined") {
    scheduleAfterPaint = (fn: () => void) => {
      requestAnimationFrame(() => {
        pendingCallbacks.push(fn)
        channel.port2.postMessage(null)
      })
    }
  } else {
    // No rAF (e.g. Node with MessageChannel polyfill) -- fall back
    scheduleAfterPaint = scheduleCallback
  }
} else {
  scheduleCallback = (fn: () => void) => {
    queueMicrotask(fn)
  }
  scheduleAfterPaint = scheduleCallback
}

/**
 * Schedule a callback to run after the browser has had a chance to paint.
 * Used by the component passive-effect queue so useEffect callbacks fire
 * after paint (matching React semantics). In non-browser environments
 * (SSR / tests without MessageChannel), falls through to a microtask.
 */
export function runAfterPaint(cb: () => void): void {
  scheduleAfterPaint(cb)
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

  // Track Transition generations for abandonment detection
  if (targetLane === Lane.Transition) _transitionGen++

  if (!isScheduled) {
    isScheduled = true
    // Inside a batched scope, the batch exit flushes synchronously. Skip
    // microtask/task dispatch so we stay in one EventDispatch FunctionCall.
    if (batchDepth > 0) return
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
 * Run a function with batched update semantics. setStates inside `fn`
 * enqueue without scheduling a separate microtask; at scope exit we
 * autoFlush synchronously. Nested calls increment a depth counter so
 * only the outermost scope triggers the flush.
 *
 * Used by the event delegation layer to eliminate the handler -> microtask
 * -> render boundary: click and render happen in one FunctionCall.
 */
export function batchedUpdates<T>(fn: () => T): T {
  batchDepth++
  try {
    return fn()
  } finally {
    batchDepth--
    if (batchDepth === 0 && isScheduled && !isFlushing) {
      // Sync-only fast path: event handlers rarely touch Default/Transition
      // lanes, so skip autoFlush's lane machinery, performance.now(),
      // hasHigherPriorityWork, and collection-state bookkeeping.
      if (
        laneQueues[Lane.Default]!.length === 0 &&
        laneQueues[Lane.Transition]!.length === 0 &&
        !R.collecting
      ) {
        flushSyncBatch()
      } else {
        autoFlush()
      }
    }
  }
}

/**
 * Compiled-component event-handler wrapper. Emitted by babel-plugin-tachys
 * around each `el.on<event> = ...` assignment so a setState inside the
 * handler hits the synchronous flushSyncBatch fast path instead of falling
 * into a queueMicrotask(autoFlush) boundary -- collapsing the click /
 * render trace into one FunctionCall, matching the delegated-event path.
 */
export const _batched: <T>(fn: () => T) => T = batchedUpdates

/**
 * Drain the Sync queue with no yield/slice/lane bookkeeping. Safe when
 * Default + Transition queues are empty and we're not inside a Transition
 * effect collection. Used by batchedUpdates for the common event-handler
 * path where all setStates land on Sync.
 */
function flushSyncBatch(): void {
  isFlushing = true
  isScheduled = false
  R.activeLane = Lane.Sync

  const queue = laneQueues[Lane.Sync]!
  while (queue.length > 0) {
    const instance = queue.shift()!
    instance._queuedLanes &= ~1
    bridgeRerender(instance)
  }

  R.activeLane = IDLE_LANE
  isFlushing = false
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
  return R.activeLane as Lane | -1
}

/**
 * Check if the current time slice has expired.
 * Returns true if we should yield to the browser.
 */
export function shouldYield(): boolean {
  if (R.activeLane === Lane.Sync) return false
  return performance.now() - sliceStart > SLICE_BUDGET
}

/**
 * Signal that the current Transition render has been suspended by a
 * Suspense boundary (a child threw a thenable). The scheduler will
 * abandon the Transition (discard effects, restore VNode state) instead
 * of committing, keeping the old committed UI visible.
 *
 * Called by the Suspense handler in component.ts when a thrown promise
 * is caught during Transition-lane processing.
 *
 * @param promise - The thenable that caused suspension. The scheduler
 *   attaches a .then() to re-schedule the Transition after it resolves.
 */
export function signalTransitionSuspended(promise: Promise<unknown>): void {
  _transitionSuspended = true
  _suspendedPromise = promise
}

// --- Auto-flush (from scheduler) ---

/**
 * Automatic flush triggered by the scheduler. Processes Sync and Default
 * lanes with direct DOM mutation, then processes Transition lane with
 * two-phase commit (render + commit).
 *
 * Transition-lane work is deferred to a separate frame when urgent work
 * was also processed (paint boundary). Effect collection persists across
 * yields so all Transition DOM mutations commit atomically.
 */
function autoFlush(): void {
  if (isFlushing) return

  // Sync-only fast path: when only the Sync queue has work and we're not
  // resuming a Transition render, skip the lane for-loop, performance.now()
  // call, and collection-state bookkeeping. Mirrors batchedUpdates' exit
  // path so a microtask-dispatched Sync flush stays as cheap as a batched
  // one.
  if (
    laneQueues[Lane.Default]!.length === 0 &&
    laneQueues[Lane.Transition]!.length === 0 &&
    !R.collecting
  ) {
    flushSyncBatch()
    return
  }

  isFlushing = true
  isScheduled = false

  let processedUrgent = false

  // If resuming from a yielded Transition render, pause effect collection
  // so Sync/Default work executes DOM operations directly.
  const resumingTransition = R.collecting
  if (resumingTransition) pauseCollecting()

  // Process Sync and Default lanes (always direct DOM mutation)
  for (let lane = Lane.Sync; lane <= Lane.Default; lane++) {
    const queue = laneQueues[lane]!
    if (queue.length === 0) continue

    processedUrgent = true
    R.activeLane = lane
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
      bridgeRerender(instance)

      // Time slice yielding
      if (lane !== Lane.Sync && shouldYield() && queue.length > 0) {
        R.activeLane = IDLE_LANE
        isFlushing = false
        isScheduled = true
        // Restore collection state if we paused it
        if (resumingTransition) resumeCollecting()
        scheduleCallback(autoFlush)
        return
      }
    }
  }

  // Restore collection state after urgent work
  if (resumingTransition) resumeCollecting()

  // Transition lane
  const transitionQueue = laneQueues[Lane.Transition]!
  if (transitionQueue.length > 0) {
    if (processedUrgent && isMessageChannelAvailable && !resumingTransition) {
      // Defer transition work until after the browser paints so the
      // urgent render is visible first. scheduleAfterPaint uses
      // rAF + MessageChannel to guarantee a true paint boundary.
      R.activeLane = IDLE_LANE
      isFlushing = false
      if (!isScheduled) {
        isScheduled = true
        scheduleAfterPaint(autoFlush)
      }
      return
    }

    // Detect superseded Transition: if we're resuming a yielded
    // Transition and new Transition work arrived since we started,
    // the old render is stale. Discard its effects and restart.
    if (resumingTransition && _transitionGen !== _transitionRenderGen) {
      abandonTransition()
      // Fall through to start fresh below
    }

    // Begin effect collection for Transition render phase (if not already
    // collecting from a resumed yield).
    if (!R.collecting) {
      beginCollecting()
      _transitionRenderGen = _transitionGen
      _processedInstances.length = 0
    }

    R.activeLane = Lane.Transition
    sliceStart = performance.now()

    while (transitionQueue.length > 0 || R.pending) {
      // Check for higher-priority work that arrived
      if (hasHigherPriorityWork(Lane.Transition)) {
        // Pause collection so urgent work executes DOM ops directly
        pauseCollecting()
        for (let hp = Lane.Sync; hp < Lane.Transition; hp++) {
          processQueue(laneQueues[hp]!, hp)
        }
        resumeCollecting()
        sliceStart = performance.now()
      }

      // Resume pending continuation from a previous mid-render yield
      if (R.pending) {
        // resumePendingWork returns true if a new yield occurred
        const yieldedAgain = resumePendingWork()
        if (yieldedAgain && shouldYield()) {
          R.activeLane = IDLE_LANE
          isFlushing = false
          isScheduled = true
          scheduleAfterPaint(autoFlush)
          return
        }
        continue
      }

      const instance = transitionQueue.shift()!
      instance._queuedLanes &= ~(1 << Lane.Transition)
      _processedInstances.push(instance)
      bridgeRerender(instance)

      // After rerender, a mid-render yield may have saved a continuation.
      // Process it before moving to the next component.
      while (R.pending) {
        const yieldedAgain = resumePendingWork()
        if (yieldedAgain && shouldYield()) {
          // Yield with continuation still pending -- it will be resumed
          // on the next time slice.
          R.activeLane = IDLE_LANE
          isFlushing = false
          isScheduled = true
          scheduleAfterPaint(autoFlush)
          return
        }
      }

      if (shouldYield() && transitionQueue.length > 0) {
        // Yield transition work -- keep effects queued (don't commit yet).
        // The effect queue persists across yields so all Transition DOM
        // mutations commit atomically when the full render completes.
        R.activeLane = IDLE_LANE
        isFlushing = false
        isScheduled = true
        scheduleAfterPaint(autoFlush)
        return
      }
    }

    // All Transition work complete. If a Suspense boundary suspended
    // during the render, abandon instead of committing -- the old
    // committed UI stays visible until the suspended data resolves.
    if (_transitionSuspended) {
      _transitionSuspended = false
      const promise = _suspendedPromise
      _suspendedPromise = null
      abandonTransition()
      // When the suspended data resolves, schedule a new autoFlush to
      // retry the Transition. The re-queued instances from abandonTransition
      // are already in the Transition queue.
      if (promise !== null) {
        const retryFlush = () => {
          if (!isScheduled) {
            isScheduled = true
            scheduleCallback(autoFlush)
          }
        }
        promise.then(retryFlush, retryFlush)
      }
    } else {
      // Commit DOM effects atomically, then run deferred component
      // effects (useEffect/useLayoutEffect).
      commitEffects()
      flushDeferredEffects()
      clearTransitionRestorers()
      _processedInstances.length = 0
    }
  } else if (R.collecting) {
    // Transition queue was drained externally -- commit residual effects.
    commitEffects()
    flushDeferredEffects()
    clearTransitionRestorers()
    _processedInstances.length = 0
  }

  R.activeLane = IDLE_LANE
  isFlushing = false
}

// --- Manual flush (for testing) ---

/**
 * Flush all pending updates synchronously.
 * Processes all lanes in priority order without deferring Transition work.
 * Does NOT use effect collection -- all DOM mutations are applied directly.
 *
 * Exposed for testing -- normally updates are flushed via the auto-scheduler.
 */
export function flushUpdates(): void {
  if (isFlushing) return

  // If effects were being collected (e.g., called from a test mid-transition),
  // commit them first to avoid stale queued effects, then run any deferred
  // component effects that were queued during the Transition render.
  if (R.collecting) {
    commitEffects()
    flushDeferredEffects()
  }

  isFlushing = true
  isScheduled = false

  processAllLanes()

  // Drain any passive (useEffect) callbacks that layout effects deferred.
  // In real browser use they'd fire in a post-paint MessageChannel task;
  // flushUpdates is the synchronous entry point tests rely on, so we
  // drain inline here and re-enter the lane loop if passives schedule
  // new work, so callers observe a quiescent state on return.
  while (hasPendingPassiveEffects() || laneWorkPending()) {
    while (hasPendingPassiveEffects()) {
      drainPassiveEffects()
    }
    if (laneWorkPending()) {
      processAllLanes()
    }
  }

  isFlushing = false
}

function laneWorkPending(): boolean {
  return (
    laneQueues[Lane.Sync]!.length > 0 ||
    laneQueues[Lane.Default]!.length > 0 ||
    laneQueues[Lane.Transition]!.length > 0 ||
    R.pending
  )
}

/**
 * True when there's no scheduled lane work, no pending in-flight render,
 * no queued passive (useEffect) callbacks, and no scheduled MessageChannel
 * frame waiting to drive more work. Tests use this to wait for the
 * auto-scheduler to truly settle instead of polling innerHTML.
 */
export function hasPendingWork(): boolean {
  return laneWorkPending() || hasPendingPassiveEffects() || isScheduled || isFlushing
}

function processAllLanes(): void {
  // Sync + Default lanes: no R.pending handling (only Transition renders yield).
  // Keeping these paths free of R.pending reads shrinks the hot-path bytecode
  // for flushUpdates-driven setState/dispatch benches.
  for (let lane = Lane.Sync; lane <= Lane.Default; lane++) {
    const queue = laneQueues[lane]!
    if (queue.length === 0) continue

    R.activeLane = lane
    sliceStart = performance.now()

    while (queue.length > 0) {
      if (lane > Lane.Sync && hasHigherPriorityWork(lane)) {
        for (let hp = Lane.Sync; hp < lane; hp++) {
          processQueue(laneQueues[hp]!, hp)
        }
        sliceStart = performance.now()
      }

      const instance = queue.shift()!
      instance._queuedLanes &= ~(1 << lane)
      bridgeRerender(instance)

      if (lane !== Lane.Sync && shouldYield() && queue.length > 0) {
        R.activeLane = IDLE_LANE
        isFlushing = false
        isScheduled = true
        scheduleCallback(flushUpdates)
        return
      }
    }
  }

  // Transition lane: handle mid-render continuations via R.pending.
  const transitionQueue = laneQueues[Lane.Transition]!
  if (transitionQueue.length === 0 && !R.pending) {
    R.activeLane = IDLE_LANE
    return
  }

  R.activeLane = Lane.Transition
  sliceStart = performance.now()

  while (transitionQueue.length > 0 || R.pending) {
    if (hasHigherPriorityWork(Lane.Transition)) {
      for (let hp = Lane.Sync; hp < Lane.Transition; hp++) {
        processQueue(laneQueues[hp]!, hp)
      }
      sliceStart = performance.now()
    }

    if (R.pending) {
      resumePendingWork()
      continue
    }

    const instance = transitionQueue.shift()!
    instance._queuedLanes &= ~(1 << Lane.Transition)
    bridgeRerender(instance)

    while (R.pending) {
      resumePendingWork()
    }

    if (shouldYield() && transitionQueue.length > 0) {
      R.activeLane = IDLE_LANE
      isFlushing = false
      isScheduled = true
      scheduleCallback(flushUpdates)
      return
    }
  }

  R.activeLane = IDLE_LANE
}

function processQueue(queue: ComponentInstance[], lane: Lane): void {
  const prevActiveLane = R.activeLane
  R.activeLane = lane
  sliceStart = performance.now()

  while (queue.length > 0) {
    const instance = queue.shift()!
    instance._queuedLanes &= ~(1 << lane)
    bridgeRerender(instance)
  }

  R.activeLane = prevActiveLane
}

function hasHigherPriorityWork(currentLane: Lane): boolean {
  for (let i = 0; i < currentLane; i++) {
    if (laneQueues[i]!.length > 0) return true
  }
  return false
}

/**
 * Abandon a superseded Transition render.
 *
 * Discards all collected DOM effects and pending continuations,
 * restores component VNode state to pre-render values (so the VNode
 * tree matches the live DOM), and re-queues all previously processed
 * instances for the Transition lane so the new render includes them.
 */
function abandonTransition(): void {
  restoreTransitionState()
  discardEffects()
  discardPendingWork()

  // Re-queue instances from the abandoned batch
  const transitionQueue = laneQueues[Lane.Transition]!
  for (let i = 0; i < _processedInstances.length; i++) {
    const inst = _processedInstances[i]!
    const laneBit = 1 << Lane.Transition
    if (!(inst._queuedLanes & laneBit)) {
      inst._queuedLanes |= laneBit
      transitionQueue.push(inst)
    }
  }
  _processedInstances.length = 0
}

/**
 * Flush only the Sync lane. Used internally when we need synchronous
 * resolution of high-priority work without touching other lanes.
 *
 * If called during Transition effect collection (e.g., a Sync update
 * triggered by a Transition render), pauses collection so the Sync
 * work executes DOM operations directly.
 */
export function flushSyncWork(): void {
  const queue = laneQueues[Lane.Sync]!
  if (queue.length === 0) return

  const prevFlushing = isFlushing
  const wasCollecting = R.collecting
  if (wasCollecting) pauseCollecting()

  isFlushing = true
  processQueue(queue, Lane.Sync)
  isFlushing = prevFlushing

  if (wasCollecting) resumeCollecting()
}
