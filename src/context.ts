/**
 * Context API for dependency injection without prop drilling.
 *
 * Provider components push a context value before their subtree mounts/patches
 * and pop it after. Since rendering is synchronous and single-threaded,
 * a simple value stack per context works correctly.
 *
 * useContext reads the current (top-of-stack) value during render.
 *
 * React 19 lets the Context itself act as the provider component, e.g.
 *   <MyContext value={v}>...</MyContext>
 * To support this, the Context object returned by `createContext` is itself
 * the provider function. `Context.Provider` is a self-reference kept for
 * React 18 compatibility.
 */

import { registerContextDep } from "./component"
import { ComponentMeta } from "./flags"
import type { VNode } from "./vnode"

export interface Context<T> {
  /** Invoked as a component: <MyContext value={v}>children</MyContext> */
  (props: Record<string, unknown>): VNode
  /** The default value when no Provider is above */
  _defaultValue: T
  /** Stack of active provider values (top = current) */
  _stack: T[]
  /** Self-reference: required by mountComponent's getProviderContext check */
  _context: Context<T>
  /** Meta bitmask flagging this function as a Provider (see flags.ComponentMeta) */
  _meta: number
  /** Self-reference for React 18 compat: `<MyContext.Provider value={v}>` */
  Provider: Context<T>
  /** Render-prop Consumer component for React compat */
  Consumer: ConsumerFunction<T>
}

export interface ConsumerFunction<T> {
  (props: Record<string, unknown>): VNode
  _contextRef: Context<T>
}

/** Kept as an alias for backwards compatibility -- providers ARE contexts now. */
export type ProviderFunction<T> = Context<T>

/**
 * Create a new context with the given default value.
 *
 * The returned Context is itself a component function (React 19 style):
 *   <MyContext value={v}>...</MyContext>
 * `MyContext.Provider` aliases the same function for React 18 compatibility.
 *
 * @param defaultValue - Value returned by useContext when no Provider is above
 */
export function createContext<T>(defaultValue: T): Context<T> {
  const Context = function ContextProvider(props: Record<string, unknown>): VNode {
    return props["children"] as VNode
  } as Context<T>

  Context._defaultValue = defaultValue
  Context._stack = []
  Context._context = Context
  Context._meta = ComponentMeta.Provider
  Context.Provider = Context

  const Consumer = function ContextConsumer(props: Record<string, unknown>): VNode {
    const value =
      Context._stack.length > 0
        ? Context._stack[Context._stack.length - 1]!
        : Context._defaultValue
    registerContextDep(Context as Context<unknown>, value)
    const children = props["children"] as (val: T) => VNode
    return children(value)
  } as ConsumerFunction<T>
  Consumer._contextRef = Context
  Context.Consumer = Consumer

  return Context
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
