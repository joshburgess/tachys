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
  _defaultValue: T
  _stack: T[]
}
```

The context object. You typically only interact with `.Provider` and pass the context itself to `useContext`.
