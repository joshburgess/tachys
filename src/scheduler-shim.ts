/**
 * Scheduler shim.
 *
 * The seam between Tachys's render path (component.ts, diff.ts, effects.ts)
 * and its concurrent infrastructure (scheduler.ts, render-state.ts,
 * work-loop.ts). Hot-path code imports the surface used by both sync and
 * concurrent builds from here; the concurrent build re-exports the real
 * implementations, while a future sync build replaces this file with
 * no-op / immediate-flush stubs and drops scheduler.ts + work-loop.ts
 * from the bundle entirely.
 *
 * Names mirror their source modules so the rewrite is mechanical and the
 * concurrent build has zero runtime cost (the re-exports are inlined by
 * the bundler).
 */

export { R, LANE_TRANSITION } from "./render-state"

export {
  _batched,
  batchedUpdates,
  flushSyncWork,
  flushUpdates,
  getCurrentLane,
  hasPendingWork,
  Lane,
  runAfterPaint,
  scheduleUpdate,
  setCurrentLane,
  shouldYield,
  signalTransitionSuspended,
} from "./scheduler"

export { appendAfterWork, savePendingWork } from "./work-loop"
