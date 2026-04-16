/**
 * phasm-aeon -- Aeon FRP integration for Phasm.
 *
 * Bridges Aeon's Event/Behavior reactive primitives with Phasm's
 * component model. Provides hooks for subscribing to Events,
 * sampling Behaviors, and creating imperative push adapters,
 * with automatic cleanup on component unmount.
 */

export { useBehavior } from "./useBehavior.js"
export { useEvent } from "./useEvent.js"
export { useAdapter } from "./useAdapter.js"
export { useStepper } from "./useStepper.js"
export { useAccum } from "./useAccum.js"
export { createScheduler } from "./scheduler.js"
export { Reactive, bindText, bindAttr } from "./reactive.js"
