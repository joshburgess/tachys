/**
 * Work-loop continuation state for mid-render yielding.
 *
 * During Transition-lane rendering, the diff algorithm may yield to
 * the browser mid-tree (after processing a child in a children loop).
 * When this happens, the current position in the loop and all
 * after-work callbacks (ref updates, effect runs, provider stack
 * cleanup, dom reference updates) are saved into a continuation.
 *
 * The scheduler resumes the continuation on the next time slice,
 * picking up exactly where the render left off. Effect collection
 * persists across yields (Phase 1/2), and the continuation chain
 * ensures post-render work runs in the correct order after all
 * children are processed.
 *
 * Only Transition-lane work can yield. Sync and Default lanes run
 * to completion without checking shouldYield().
 *
 * Continuation shape:
 *   _pending.resume  - Resumes the children loop from where it paused
 *   _pending.afterWork - LIFO stack of post-render callbacks. Each
 *     caller in the render stack appends its remaining work (ref
 *     updates, runEffects, provider cleanup) when it detects that a
 *     descendant yielded. These run in reverse order after the final
 *     resume completes (innermost work first).
 */

import { R } from "./render-state"

// --- State ---

/** The pending continuation, or null if no yield is active. */
let _pending: {
  /** Resume function -- continues the children loop. */
  resume: () => void
  /** Post-render work to run after all children are processed (LIFO). */
  afterWork: (() => void)[]
} | null = null

// --- API ---

/**
 * Whether there is a pending continuation from a mid-render yield.
 * Callers check this after invoking child-processing functions
 * (patchInner, patchNonKeyedChildren, etc.) to detect whether
 * a descendant yielded.
 */
export function hasPendingWork(): boolean {
  return _pending !== null
}

/**
 * Save a continuation. Called by children loops when shouldYield()
 * returns true mid-iteration.
 *
 * @param resume - Closure that resumes the loop from its current index
 */
export function savePendingWork(resume: () => void): void {
  _pending = { resume, afterWork: [] }
  R.pending = true
}

/**
 * Append a post-render callback to the continuation's afterWork stack.
 * Called by callers up the render stack (patchElement, patchFragment,
 * patchComponent, rerenderComponent) when they detect hasPendingWork().
 *
 * afterWork callbacks are pushed in stack order (outermost last) and
 * executed in LIFO order after the continuation fully completes.
 * This ensures innermost post-work (e.g., a deeply nested component's
 * runEffects) runs before outer post-work (e.g., a parent component's
 * provider stack cleanup).
 *
 * @param fn - Deferred post-render work (ref updates, runEffects, etc.)
 */
export function appendAfterWork(fn: () => void): void {
  _pending!.afterWork.push(fn)
}

/**
 * Resume the pending continuation and run all afterWork callbacks.
 * Called by the scheduler's Transition loop after each yield.
 *
 * The resume function may itself yield again (saving a new _pending),
 * in which case this function returns true to signal the scheduler
 * that another yield occurred and it should check shouldYield()
 * before continuing.
 *
 * When the resume completes without yielding, afterWork callbacks
 * from the just-completed continuation are executed, then any
 * afterWork from a newly saved continuation (from a subsequent
 * patchInner call) is also handled.
 *
 * @returns true if a new yield occurred during resume (caller should
 *          check shouldYield), false if the continuation fully completed
 */
export function resumePendingWork(): boolean {
  if (_pending === null) return false

  const cont = _pending
  _pending = null
  R.pending = false

  // Resume the children loop. This may:
  // 1. Complete normally (no new _pending)
  // 2. Yield again (new _pending saved by savePendingWork)
  cont.resume()

  // resume() may have called savePendingWork(), reassigning _pending.
  if (hasPendingWork()) {
    // A new yield occurred during resume. Prepend the old afterWork
    // items (they need to run after the new continuation completes).
    // Old items go before new items so LIFO order is preserved:
    // when eventually executed, new (inner) work runs first.
    if (cont.afterWork.length > 0) {
      _pending!.afterWork = cont.afterWork.concat(_pending!.afterWork)
    }
    return true
  }

  // Continuation completed -- run afterWork in LIFO order
  const afterWork = cont.afterWork
  for (let i = afterWork.length - 1; i >= 0; i--) {
    afterWork[i]!()
  }

  return false
}

/**
 * Discard the pending continuation without executing it.
 * Called when a Transition render is abandoned (e.g., superseded
 * by a newer Transition before the old one committed).
 */
export function discardPendingWork(): void {
  _pending = null
  R.pending = false
}
