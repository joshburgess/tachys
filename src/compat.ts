/**
 * React/ReactDOM compatibility layer.
 *
 * Provides a React-compatible API surface so that bundler aliases like
 *   { "react": "phasm/compat", "react-dom": "phasm/compat" }
 * allow existing React component libraries to work with Phasm.
 *
 * Covers the functional React API. Class components (Component,
 * PureComponent) are not supported -- a warning is thrown if they
 * are used.
 */

// --- react ---

export { h as createElement, createTextVNode } from "./jsx"
export { VNode } from "./vnode"
export type { VNode as ReactElement } from "./vnode"
export type { ComponentFn as FunctionComponent, ComponentFn as FC } from "./vnode"
export { VNodeFlags, ChildFlags } from "./flags"
export { createRef } from "./ref"
export type { Ref, RefCallback, RefObject } from "./ref"
export { createContext, useContext } from "./context"
export type { Context } from "./context"
export { memo } from "./memo"
export type { MemoComponentFn } from "./memo"
export { forwardRef } from "./forward-ref"
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
  useLayoutEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
  useSyncExternalStore,
  useTransition,
} from "./component"
export type { EffectCleanup } from "./component"
export { lazy } from "./suspense"
export { __DEV__ } from "./dev"

// --- react-dom ---

export { render } from "./render"
export { createPortal } from "./portal"
export { flushUpdates as flushSync } from "./scheduler"
export { unmount } from "./unmount"
export { mount } from "./mount"
export { patch } from "./diff"

// --- compat utilities ---

export { Children, cloneElement, isValidElement } from "./compat-util"

// --- Fragment sentinel ---

/**
 * Fragment type. In Phasm, fragments use `null` as the type.
 * This matches React's Fragment export for JSX compatibility.
 */
export const Fragment = null

// --- Stubs for class component detection ---

/**
 * Stub base class. Phasm does not support class components.
 * This export exists so that `instanceof Component` checks in
 * third-party libraries don't crash. Attempting to use it as an
 * actual class component will throw.
 */
export class Component {
  constructor() {
    throw new Error(
      "Phasm does not support class components. Use function components with hooks instead.",
    )
  }
}

export class PureComponent extends Component {}

// --- version ---

export const version = "0.0.1"
