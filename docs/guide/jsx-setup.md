# JSX Setup

Tachys supports both the **automatic** JSX transform (recommended) and the **classic** pragma style.

## Automatic Transform (Recommended)

### Vite / esbuild

```ts
// vite.config.ts
import { defineConfig } from "vite"

export default defineConfig({
  esbuild: {
    jsxImportSource: "tachys",
  },
})
```

### TypeScript

```json
// tsconfig.json
{
  "compilerOptions": {
    "jsx": "react-jsx",
    "jsxImportSource": "tachys"
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
        "importSource": "tachys"
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
import { h } from "tachys"

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
