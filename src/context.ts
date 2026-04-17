/**
 * Context API for dependency injection without prop drilling.
 *
 * Provider components push a context value before their subtree mounts/patches
 * and pop it after. Since rendering is synchronous and single-threaded,
 * a simple value stack per context works correctly.
 *
 * useContext reads the current (top-of-stack) value during render.
 */

import { registerContextDep } from "./component"
import type { VNode } from "./vnode"

export interface Context<T> {
  /** The default value when no Provider is above */
  _defaultValue: T
  /** Stack of active provider values (top = current) */
  _stack: T[]
  /** The Provider component function (tagged with _context) */
  Provider: ProviderFunction<T>
  /** Render-prop Consumer component for React compat */
  Consumer: ConsumerFunction<T>
}

export interface ConsumerFunction<T> {
  (props: Record<string, unknown>): VNode
  _contextRef: Context<T>
}

export interface ProviderFunction<T> {
  (props: Record<string, unknown>): VNode
  _context: Context<T>
}

/**
 * Create a new context with the given default value.
 *
 * @param defaultValue - Value returned by useContext when no Provider is above
 * @returns A Context object with a .Provider component
 */
export function createContext<T>(defaultValue: T): Context<T> {
  const context: Context<T> = {
    _defaultValue: defaultValue,
    _stack: [],
    Provider: null!,
    Consumer: null!,
  }

  // Provider is a component that passes through its children.
  // The actual push/pop is handled by mountComponent/patchComponent
  // which check for _context on the component function.
  const Provider = function ContextProvider(props: Record<string, unknown>): VNode {
    return props["children"] as VNode
  } as ProviderFunction<T>

  Provider._context = context
  context.Provider = Provider

  // Consumer is a render-prop component that reads the current context value
  // and calls its children function with that value.
  // Usage: <MyContext.Consumer>{value => <div>{value}</div>}</MyContext.Consumer>
  const Consumer = function ContextConsumer(props: Record<string, unknown>): VNode {
    const value =
      context._stack.length > 0
        ? context._stack[context._stack.length - 1]!
        : context._defaultValue
    registerContextDep(context as Context<unknown>, value)
    const children = props["children"] as (val: T) => VNode
    return children(value)
  } as ConsumerFunction<T>

  Consumer._contextRef = context
  context.Consumer = Consumer

  return context
}

/**
 * Read the current value of a context.
 * Must be called inside a component render.
 *
 * @param context - The context to read from
 * @returns The current context value (from nearest Provider or default)
 */
export function useContext<T>(context: Context<T>): T {
  const value =
    context._stack.length > 0 ? context._stack[context._stack.length - 1]! : context._defaultValue
  registerContextDep(context as Context<unknown>, value)
  return value
}
