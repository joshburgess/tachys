/**
 * DOM effect queue for two-phase concurrent rendering.
 *
 * During Transition lane processing, ALL DOM mutations -- structural
 * (appendChild, insertBefore, removeChild) and property (className,
 * attributes, textContent, style, events) -- are collected into an
 * effect queue instead of being applied immediately. After the render
 * phase completes, the commit phase replays all effects in order to
 * apply the mutations atomically.
 *
 * Sync and Default lane work bypasses the effect queue entirely -- the
 * boolean flag check (`_collecting`) is the only overhead, and it's
 * well-predicted by the branch predictor since it's false for 99% of
 * DOM operations.
 *
 * Effects are replayed in FIFO order (the same order they were recorded
 * during the DFS render traversal), which produces identical DOM state
 * to direct execution. This invariant is critical: the keyed diff
 * algorithm computes insertBefore reference nodes based on execution
 * order, so replaying in the same order preserves correctness.
 *
 * Property mutations use thunk effects (closures) to capture the
 * operation and its arguments. Closures are only allocated during
 * Transition lane work -- the Sync/Default path executes directly
 * with no allocation.
 *
 * The scheduler pauses collection when processing urgent (Sync/Default)
 * work that interrupts a Transition render, ensuring urgent DOM mutations
 * execute immediately while Transition mutations remain queued.
 */

import { R } from "./scheduler-shim"

// --- Effect tags (numeric for fast switch dispatch) ---

const APPEND = 0
const INSERT = 1
const REMOVE = 2
const THUNK = 3

// --- Effect types ---

interface AppendEffect {
  /** EffectTag.AppendChild */
  t: typeof APPEND
  /** Parent node */
  p: Node
  /** Child node */
  c: Node
}

interface InsertEffect {
  /** EffectTag.InsertBefore */
  t: typeof INSERT
  /** Parent node */
  p: Node
  /** Child node */
  c: Node
  /** Reference node */
  r: Node | null
}

interface RemoveEffect {
  /** EffectTag.RemoveChild */
  t: typeof REMOVE
  /** Parent node */
  p: Node
  /** Child node */
  c: Node
}

interface ThunkEffect {
  /** EffectTag.Thunk */
  t: typeof THUNK
  /** The deferred operation */
  f: () => void
}

type DOMEffect = AppendEffect | InsertEffect | RemoveEffect | ThunkEffect

// --- State ---

/** Whether DOM operations should be queued instead of executed. */
let _collecting = false

/** The effect queue. Cleared on commit or discard. */
const _effects: DOMEffect[] = []

/**
 * Deferred component effect callbacks. During Transition-lane rendering,
 * component effects (useEffect/useLayoutEffect) are queued here instead
 * of running immediately. After commitEffects() replays all DOM mutations,
 * the scheduler drains this queue so effect callbacks see the final
 * committed DOM state.
 *
 * Each entry is a closure that runs the component's pending effects.
 * Using closures avoids importing ComponentInstance (circular dep).
 */
const _deferredEffects: (() => void)[] = []

/**
 * Transition state restorers. Before each component render during
 * Transition, a closure is pushed that can restore the component's
 * VNode state (_rendered, _vnode.children, _vnode.dom) to its
 * pre-render values. On Transition abandonment, these are run in
 * reverse order so the VNode tree matches the live DOM.
 */
const _transitionRestorers: (() => void)[] = []

// --- Collection lifecycle ---

/**
 * Start collecting DOM effects instead of applying them directly.
 * Called by the scheduler before processing Transition lane work.
 */
export function beginCollecting(): void {
  _collecting = true
  R.collecting = true
  _effects.length = 0
  _deferredEffects.length = 0
  _transitionRestorers.length = 0
}

/**
 * Stop collecting and commit all queued effects.
 * Replays effects in FIFO order, producing identical DOM state to
 * direct execution. Called after all Transition lane work completes.
 */
export function commitEffects(): void {
  _collecting = false
  R.collecting = false
  const effects = _effects
  for (let i = 0; i < effects.length; i++) {
    const e = effects[i]!
    switch (e.t) {
      case APPEND:
        e.p.appendChild(e.c)
        break
      case INSERT:
        e.p.insertBefore(e.c, e.r)
        break
      case REMOVE:
        e.p.removeChild(e.c)
        break
      case THUNK:
        e.f()
        break
    }
  }
  _effects.length = 0
}

/**
 * Discard all queued effects without applying them.
 * Used when Transition work is abandoned (e.g., superseded by a new
 * Transition before the old one committed).
 */
export function discardEffects(): void {
  _collecting = false
  R.collecting = false
  _effects.length = 0
  _deferredEffects.length = 0
}

/**
 * Temporarily pause effect collection so urgent work can execute
 * DOM operations directly. Does NOT clear the queue.
 */
export function pauseCollecting(): void {
  _collecting = false
  R.collecting = false
}

/**
 * Resume effect collection after urgent work completes.
 * The existing queue is preserved.
 */
export function resumeCollecting(): void {
  _collecting = true
  R.collecting = true
}

/** Whether the effect queue is currently collecting. */
export function isCollecting(): boolean {
  return _collecting
}

/** Number of queued effects. Exposed for testing. */
export function pendingEffectCount(): number {
  return _effects.length
}

// --- DOM operation wrappers ---
//
// These replace direct DOM calls in mount.ts, diff.ts, and unmount.ts.
// When _collecting is false (Sync/Default lanes), they execute directly.
// When _collecting is true (Transition lane), they queue the operation.
//
// The boolean check is the only overhead on the non-collecting path.
// V8's branch predictor handles this efficiently since the branch is
// consistently not-taken during Sync/Default work.

/**
 * appendChild with optional effect collection.
 */
export function domAppendChild(parent: Node, child: Node): void {
  if (_collecting) {
    _effects.push({ t: APPEND, p: parent, c: child })
    return
  }
  parent.appendChild(child)
}

/**
 * insertBefore with optional effect collection.
 */
export function domInsertBefore(parent: Node, child: Node, ref: Node | null): void {
  if (_collecting) {
    _effects.push({ t: INSERT, p: parent, c: child, r: ref })
    return
  }
  parent.insertBefore(child, ref)
}

/**
 * removeChild with optional effect collection.
 */
export function domRemoveChild(parent: Node, child: Node): void {
  if (_collecting) {
    _effects.push({ t: REMOVE, p: parent, c: child })
    return
  }
  parent.removeChild(child)
}

// --- Typed-effect enqueue helpers (assume collecting == true) ---
//
// Exposed so callers can branch on R.collecting inline and skip the
// function call + redundant check on the hot Sync/Default path.

export function pushAppend(parent: Node, child: Node): void {
  _effects.push({ t: APPEND, p: parent, c: child })
}

export function pushInsert(parent: Node, child: Node, ref: Node | null): void {
  _effects.push({ t: INSERT, p: parent, c: child, r: ref })
}

export function pushRemove(parent: Node, child: Node): void {
  _effects.push({ t: REMOVE, p: parent, c: child })
}

// --- Thunk effects (for property / content mutations) ---
//
// These capture a DOM mutation as a closure. Closures are only allocated
// when _collecting is true (Transition lane). On the Sync/Default path,
// the boolean check short-circuits and executes directly with zero
// allocation overhead.

/**
 * Queue a thunk effect. The closure is called during commit.
 * Only call this when isCollecting() is true -- callers must
 * check the flag themselves to avoid closure allocation on the
 * non-collecting path.
 */
export function pushThunk(fn: () => void): void {
  _effects.push({ t: THUNK, f: fn })
}

// --- Deferred component effects ---
//
// During Transition-lane rendering, component effects (useEffect,
// useLayoutEffect) are deferred so they run after DOM mutations are
// committed. This ensures effect callbacks see the final DOM state.
//
// Sync and Default lanes run effects immediately (no deferral).

/**
 * Queue a component's effect runner for post-commit execution.
 * Called by runEffects when isCollecting() is true (Transition lane).
 *
 * @param fn - Closure that runs the component's pending effects
 */
export function pushDeferredEffect(fn: () => void): void {
  _deferredEffects.push(fn)
}

/**
 * Run all deferred component effects.
 * Called by the scheduler after commitEffects() completes.
 * Effects run in FIFO order (same order as render traversal).
 */
export function flushDeferredEffects(): void {
  const deferred = _deferredEffects
  // Snapshot length: effects may schedule new updates but not new
  // deferred effects (we're no longer collecting).
  const len = deferred.length
  for (let i = 0; i < len; i++) {
    deferred[i]!()
  }
  _deferredEffects.length = 0
}

/** Number of deferred component effects. Exposed for testing. */
export function pendingDeferredEffectCount(): number {
  return _deferredEffects.length
}

// --- Transition state restorers ---
//
// When a Transition render is abandoned (superseded by a newer
// Transition), component VNode state must be rolled back so the
// VNode tree matches the live DOM. Each restorer closure captures
// the pre-render values of a component instance's _rendered,
// _vnode.children, and _vnode.dom.

/**
 * Push a restorer closure. Called by component.ts before each
 * component render during Transition (both rerenderComponent and
 * patchComponent).
 */
export function pushTransitionRestorer(fn: () => void): void {
  _transitionRestorers.push(fn)
}

/**
 * Run all restorers in reverse order to roll back component VNode
 * state. Called by the scheduler when abandoning a superseded
 * Transition render.
 */
export function restoreTransitionState(): void {
  for (let i = _transitionRestorers.length - 1; i >= 0; i--) {
    _transitionRestorers[i]!()
  }
  _transitionRestorers.length = 0
}

/**
 * Clear restorers without running them.
 * Called after a successful Transition commit.
 */
export function clearTransitionRestorers(): void {
  _transitionRestorers.length = 0
}
