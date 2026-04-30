/**
 * Scheduler shim — sync build.
 *
 * Drop-in replacement for `scheduler-shim.ts` that strips out lanes,
 * transitions, time-slicing, and the work-loop. Hot-path code in
 * component.ts / diff.ts / effects.ts imports the same surface, so no
 * edits are needed there. The concurrent infrastructure modules
 * (scheduler.ts, work-loop.ts) are not imported and tree-shake out of
 * the bundle entirely.
 *
 * Semantic differences vs concurrent:
 *   - All updates are Sync. There is no Default or Transition lane,
 *     no time slicing, and `shouldYield()` is constant false.
 *   - `R.collecting` and `R.pending` are constant false; the JIT
 *     can eliminate every `if (R.collecting)` branch in diff.ts.
 *   - `setState` either flushes immediately (no batch in scope) or
 *     enqueues into a minimal batch queue drained by `_batched(...)`.
 *     Event-handler batching is preserved so N setState calls in one
 *     onClick still produce one render.
 *   - `runAfterPaint` falls back to `queueMicrotask`. Without the
 *     scheduler's MessageChannel, this runs at the same point in the
 *     task as Promise continuations rather than after paint, but for
 *     useEffect / passive-effect timing the ordering is identical
 *     within a single sync flush.
 *   - `signalTransitionSuspended` is a no-op. Suspense itself lives
 *     in the concurrent build.
 */

import { bridgeRerender } from "./reconcile-bridge"
import type { ComponentInstance } from "./component"

// --- Lanes (kept as constants so the type/shape matches concurrent) ---

export const Lane = { Sync: 0, Default: 1, Transition: 2 } as const
export type Lane = (typeof Lane)[keyof typeof Lane]

export const LANE_TRANSITION = 2

// --- Render-phase state (frozen; reads are JIT-inlined as constants) ---

export const R = {
  collecting: false as const,
  pending: false as const,
  activeLane: 0 as const,
}

// --- Lane context (no-op; sync is always Sync) ---

export function getCurrentLane(): Lane {
  return Lane.Sync
}
export function setCurrentLane(_lane: Lane): void {
  // no-op
}

// --- Yielding (sync never yields) ---

export function shouldYield(): boolean {
  return false
}

// --- Suspense / transitions (no-op; concurrent-only) ---

export function signalTransitionSuspended(_promise: Promise<unknown>): void {
  // no-op: there is no Transition lane to abandon.
}

// --- After-paint hook (microtask fallback) ---

export function runAfterPaint(cb: () => void): void {
  queueMicrotask(cb)
}

// --- Work-loop stubs (sync has no resumable mid-render state) ---

export function appendAfterWork(fn: () => void): void {
  // Concurrent appends to a deferred queue drained at slice boundary.
  // Sync renders in one shot, so the work runs immediately.
  fn()
}
export function savePendingWork(_resume: () => void): void {
  // no-op: sync never yields mid-render, so there is nothing to resume.
}

// --- Scheduling ---
//
// setState calls scheduleUpdate. In concurrent this enqueues into a
// lane queue and posts a microtask or MessageChannel task. In sync we
// either rerender immediately or, when inside `_batched(...)`, queue
// for the batch-exit drain so N setState calls in one event handler
// still coalesce into one render.

let batchDepth = 0
const batchQueue: ComponentInstance[] = []

export function scheduleUpdate(
  instance: ComponentInstance,
  _lane?: Lane,
): void {
  if (batchDepth > 0) {
    if (instance._queuedLanes & 1) return
    instance._queuedLanes |= 1
    batchQueue.push(instance)
    return
  }
  bridgeRerender(instance)
}

function drainBatch(): void {
  while (batchQueue.length > 0) {
    const instance = batchQueue.shift()!
    instance._queuedLanes &= ~1
    bridgeRerender(instance)
  }
}

export function batchedUpdates<T>(fn: () => T): T {
  batchDepth++
  try {
    return fn()
  } finally {
    batchDepth--
    if (batchDepth === 0 && batchQueue.length > 0) drainBatch()
  }
}

export const _batched: <T>(fn: () => T) => T = batchedUpdates

// --- Public flush helpers (concurrent-only in real build; here they
// reduce to "drain whatever batch is open and return"). ---

export function flushUpdates(): void {
  if (batchQueue.length > 0) drainBatch()
}

export function flushSyncWork(): void {
  if (batchQueue.length > 0) drainBatch()
}

export function hasPendingWork(): boolean {
  return batchQueue.length > 0
}
