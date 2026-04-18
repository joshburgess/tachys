# Events

Tachys uses delegated event handling for performance.

## Event Handlers

Attach handlers with `on*` props, using camelCase naming:

```tsx
function Button() {
  return (
    <button
      onClick={(e: MouseEvent) => console.log("clicked!", e.target)}
      onMouseEnter={() => console.log("hovered")}
    >
      Click me
    </button>
  )
}
```

## Event Delegation

Events are automatically delegated to the root container element. Instead of attaching a listener to every DOM node, Tachys registers a single listener at the root and dispatches events by walking the target's ancestor chain. This reduces memory usage and speeds up mount/unmount.

## Supported Events

All standard DOM events are supported. Common examples:

| Prop | DOM Event |
|------|-----------|
| `onClick` | `click` |
| `onInput` | `input` |
| `onChange` | `change` |
| `onKeyDown` | `keydown` |
| `onKeyUp` | `keyup` |
| `onSubmit` | `submit` |
| `onFocus` | `focus` |
| `onBlur` | `blur` |
| `onMouseEnter` | `mouseenter` |
| `onMouseLeave` | `mouseleave` |
| `onDblClick` | `dblclick` |

The naming convention converts `onEventName` to `eventname` (lowercase) for delegation.

## Preventing Default

```tsx
function Form() {
  const handleSubmit = (e: Event) => {
    e.preventDefault()
    // handle form data
  }

  return <form onSubmit={handleSubmit}>...</form>
}
```
