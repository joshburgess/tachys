# Context

Context lets you pass data through the component tree without prop drilling.

## Creating a Context

```tsx
import { createContext } from "phasm"

interface Theme {
  primary: string
  background: string
}

const ThemeContext = createContext<Theme>({
  primary: "#007bff",
  background: "#ffffff",
})
```

## Providing a Value

Wrap a subtree with the Provider:

```tsx
function App() {
  const theme = { primary: "#e91e63", background: "#fafafa" }

  return (
    <ThemeContext.Provider value={theme}>
      <Toolbar />
    </ThemeContext.Provider>
  )
}
```

## Consuming Context

Use `useContext` to read the current value:

```tsx
import { useContext } from "phasm"

function ThemedButton() {
  const theme = useContext(ThemeContext)

  return (
    <button style={{ backgroundColor: theme.primary, color: "#fff" }}>
      Click me
    </button>
  )
}
```

Or use the `use()` hook:

```tsx
import { use } from "phasm"

function ThemedButton() {
  const theme = use(ThemeContext)
  // ...
}
```

## Nested Providers

Inner providers override outer ones:

```tsx
<ThemeContext.Provider value={lightTheme}>
  <Sidebar />
  <ThemeContext.Provider value={darkTheme}>
    <MainContent />
  </ThemeContext.Provider>
</ThemeContext.Provider>
```

## Performance

Context consumers re-render whenever the provided value changes (by reference). To avoid unnecessary re-renders:

1. **Memoize the value** with `useMemo` if it's an object:

```tsx
const actions = useMemo(() => ({
  toggle: (id: number) => { /* ... */ },
  remove: (id: number) => { /* ... */ },
}), [])

return <ActionsCtx.Provider value={actions}>...</ActionsCtx.Provider>
```

2. **Split contexts** by update frequency -- put rarely-changing data (e.g., theme) in a separate context from frequently-changing data (e.g., current user input).
