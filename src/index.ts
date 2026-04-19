/**
 * Tachys — A high-performance virtual DOM library.
 *
 * Public API exports.
 */

export {
  ErrorBoundary,
  Suspense,
  startTransition,
  use,
  useCallback,
  useDebugValue,
  useDeferredValue,
  useEffect,
  useId,
  useImperativeHandle,
  useInsertionEffect,
  useLayoutEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
  useSyncExternalStore,
  useTransition,
} from "./component"
export type { EffectCleanup } from "./component"
export { _mountList, _patchList, _template, markCompiled } from "./compiled"
export type { CompiledComponent, CompiledListState, CompiledMount } from "./compiled"
export { createContext, useContext } from "./context"
export { __DEV__, getComponentName } from "./dev"
export type { TachysDevToolsHook, SerializedNode } from "./devtools-hook"
export type { Context } from "./context"
export { forwardRef } from "./forward-ref"
export { memo } from "./memo"
export type { MemoComponentFn } from "./memo"
export { createPortal } from "./portal"
export { patch } from "./diff"
export type { ChildFlag, VNodeFlag } from "./flags"
export { ChildFlags, VNodeFlags } from "./flags"
export type { CSSProperties, JSX } from "./jsx-types"
export { createTextVNode, h } from "./jsx"
export { mount, mountRoot } from "./mount"
export { EMPTY_PROPS } from "./patch"
export { clearPool, getPoolSize } from "./pool"
export { createRef } from "./ref"
export { createRoot, hydrateRoot, render } from "./render"
export type { Root } from "./render"
export type { Ref, RefCallback, RefObject } from "./ref"
export { flushUpdates, flushSyncWork, Lane, shouldYield } from "./scheduler"
export type { Lane as LaneType } from "./scheduler"
export { lazy } from "./suspense"
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
