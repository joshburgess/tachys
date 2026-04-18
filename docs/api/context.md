# Context API

## createContext

```ts
function createContext<T>(defaultValue: T): Context<T>
```

Creates a Context object. The `defaultValue` is used when a component calls `useContext` without a matching Provider above it in the tree.

The returned Context is itself a component function (React 19 style). `MyContext.Provider` aliases the same function for React 18 compatibility:

```tsx
const ThemeCtx = createContext("light")

// React 19 style
<ThemeCtx value="dark">
  {children}
</ThemeCtx>

// React 18 style (still works)
<ThemeCtx.Provider value="dark">
  {children}
</ThemeCtx.Provider>
```

## useContext

```ts
function useContext<T>(context: Context<T>): T
```

Returns the current value of the given context, reading from the nearest Provider ancestor. If no Provider is found, returns the default value passed to `createContext`.

## Context\<T\>

```ts
interface Context<T> {
  (props: { value: T; children?: VNode }): VNode        // React 19 usage
  Provider: Context<T>                                   // React 18 alias (self-reference)
  Consumer: (props: { children: (value: T) => VNode }) => VNode
}
```

The context object. Use the context itself (or `.Provider`) to supply a value, and either `useContext` or `.Consumer` to read it.

## Context.Consumer

```tsx
<ThemeCtx.Consumer>
  {(value) => <span>{value}</span>}
</ThemeCtx.Consumer>
```

Render-prop component that reads the current context value. The `children` prop must be a function that receives the context value and returns a VNode.

This is the legacy React pattern for consuming context. Prefer `useContext` in new code, but `Consumer` is useful for interop with third-party libraries that rely on this pattern.
