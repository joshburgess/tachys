/**
 * Shared mutable render-phase state.
 *
 * Hot-path code in diff.ts, mount.ts, unmount.ts, pool.ts, and component.ts
 * reads these flags on every operation. Exporting them as properties of a
 * single object eliminates cross-module function-call overhead: V8 optimizes
 * property reads on monomorphic objects into a single load instruction.
 *
 * Writes to these properties are infrequent (once per scheduler flush or
 * lane transition), while reads are per-VNode. This asymmetry makes the
 * "object property" pattern ideal -- cheap reads, writes don't matter.
 *
 * The previous approach used exported functions (isCollecting(),
 * getActiveLane(), hasPendingWork()) that each required a cross-module
 * function call per invocation. Even though V8 can sometimes inline
 * these, ESM live bindings and the module boundary make inlining
 * unreliable -- especially under the jsdom/happy-dom environments
 * used by Vitest where the JIT is less aggressive.
 */

// --- Lane constants (duplicated here to avoid circular deps) ---

/** Sync lane: highest priority, no yielding. */
export const LANE_SYNC = 0

/** Default lane: normal updates, time-sliced. */
export const LANE_DEFAULT = 1

/** Transition lane: deferred work, can be interrupted. */
export const LANE_TRANSITION = 2

/** Idle sentinel: no lane is active. */
export const LANE_IDLE = -1

// --- Shared state ---

/**
 * Render-phase state container. All properties are mutated by the
 * scheduler/effects system and read by the diff/mount/unmount hot paths.
 *
 * Using a plain object with typed properties ensures V8 assigns a
 * stable hidden class. All properties are initialized here and never
 * deleted, so the hidden class never transitions.
 */
export const R = {
  /**
   * Whether DOM operations should be queued (Transition lane active).
   * When false, DOM ops execute directly. When true, they are pushed
   * to the effect queue for later commit.
   */
  collecting: false,

  /**
   * The lane currently being processed. LANE_IDLE when the scheduler
   * is not processing work.
   */
  activeLane: LANE_IDLE as number,

  /**
   * Whether there is a pending continuation from a mid-render yield.
   * Only true during Transition-lane processing when a children diff
   * has been paused.
   */
  pending: false,
}
