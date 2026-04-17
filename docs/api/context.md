# Context API

## createContext

```ts
function createContext<T>(defaultValue: T): Context<T>
```

Creates a Context object. The `defaultValue` is used when a component calls `useContext` without a matching Provider above it in the tree.

The returned object has a `.Provider` component:

```tsx
const ThemeCtx = createContext("light")

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
  Provider: (props: { value: T; children?: VNode }) => VNode
  Consumer: (props: { children: (value: T) => VNode }) => VNode
}
```

The context object. Use `.Provider` to supply a value and either `useContext` or `.Consumer` to read it.

## Context.Consumer

```tsx
<ThemeCtx.Consumer>
  {(value) => <span>{value}</span>}
</ThemeCtx.Consumer>
```

Render-prop component that reads the current context value. The `children` prop must be a function that receives the context value and returns a VNode.

This is the legacy React pattern for consuming context. Prefer `useContext` in new code, but `Consumer` is useful for interop with third-party libraries that rely on this pattern.
