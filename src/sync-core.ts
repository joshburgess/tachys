/**
 * Tachys -- minimal public surface for size-sensitive consumers.
 *
 * Identical runtime semantics to `tachys/sync`, but the entrypoint
 * re-exports only the hooks and utilities a typical compiled-template
 * application uses. Bundlers that don't tree-shake well across barrel
 * files (older webpack, esbuild without metafile, in-browser ESM
 * loaders) will still strip the rest of the public surface this way.
 *
 * Excluded vs `tachys/sync`:
 *   - Suspense, lazy, use(), startTransition, useTransition, useDeferredValue
 *   - ErrorBoundary
 *   - createContext, useContext
 *   - createPortal
 *   - forwardRef, memo
 *   - useId, useImperativeHandle, useSyncExternalStore,
 *     useInsertionEffect, useDebugValue
 *   - getComponentName / devtools-hook
 *   - clearPool, getPoolSize
 *   - Hydration entry points (use `tachys/hydrate` for SSR)
 *
 * Concurrent-mode features (transitions, lanes, time slicing) are
 * already absent from this build because the scheduler shim is aliased
 * to the sync stub by the `./sync` rollup config.
 */

export {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
} from "./component"
export type { EffectCleanup } from "./component"
export { _attachEvent } from "./events"
export { patch } from "./diff"
export type { ChildFlag, VNodeFlag } from "./flags"
export { ChildFlags, VNodeFlags } from "./flags"
export type { CSSProperties, JSX } from "./jsx-types"
export { createTextVNode, h } from "./jsx"
export { mount, mountRoot } from "./mount"
export { EMPTY_PROPS } from "./patch"
export { createRef } from "./ref"
export { createRoot, render } from "./render"
export type { Root } from "./render"
export type { Ref, RefCallback, RefObject } from "./ref"
export {
  _batched,
  flushUpdates,
  flushSyncWork,
  hasPendingWork,
  Lane,
  shouldYield,
} from "./scheduler-shim"
export type { Lane as LaneType } from "./scheduler-shim"
export { unmount } from "./unmount"
export {
  VNode,
  hasArrayChildren,
  hasSingleChild,
  hasTextChildren,
  isComponentVNode,
  isElementVNode,
  isFragmentVNode,
  isTextVNode,
} from "./vnode"
export type { ComponentFn, DangerousInnerHTML, VNodeType } from "./vnode"
