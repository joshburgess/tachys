# JSX Setup

Phasm supports both the **automatic** JSX transform (recommended) and the **classic** pragma style.

## Automatic Transform (Recommended)

### Vite / esbuild

```ts
// vite.config.ts
import { defineConfig } from "vite"

export default defineConfig({
  esbuild: {
    jsxImportSource: "phasm",
  },
})
```

### TypeScript

```json
// tsconfig.json
{
  "compilerOptions": {
    "jsx": "react-jsx",
    "jsxImportSource": "phasm"
  }
}
```

### SWC

```json
{
  "jsc": {
    "transform": {
      "react": {
        "runtime": "automatic",
        "importSource": "phasm"
      }
    }
  }
}
```

## Classic Pragma

If you prefer the classic transform:

```json
// tsconfig.json
{
  "compilerOptions": {
    "jsx": "react",
    "jsxFactory": "h",
    "jsxFragmentFactory": "Fragment"
  }
}
```

Then import `h` in every file that uses JSX:

```tsx
import { h } from "phasm"

function App() {
  return <div>Hello</div>
}
```

## Fragments

Fragments work with both transforms:

```tsx
function List() {
  return (
    <>
      <li>One</li>
      <li>Two</li>
    </>
  )
}
```
