# tachys-aeon

[Aeon](https://www.npmjs.com/package/aeon-core) FRP integration for [Tachys](https://github.com/joshburgess/tachys). Surfaces Aeon `Behavior`s and `Event`s as first-class UI primitives via a small set of hooks, with automatic subscription cleanup on unmount.

## Install

```bash
pnpm add tachys tachys-aeon aeon-core aeon-types aeon-scheduler
```

`tachys`, `aeon-core`, `aeon-types`, and `aeon-scheduler` are peer dependencies.

## Hooks

| Hook            | Purpose                                                                  |
|-----------------|--------------------------------------------------------------------------|
| `useBehavior`   | Sample a `Behavior` during render. Optional `trigger` Event drives re-renders. |
| `useEvent`      | Subscribe to an `Event` for side effects. No re-render unless you call one yourself. |
| `useStepper`    | Hold the latest value from an `Event` (via Aeon's `stepper`) and re-render on each fire. |
| `useAccum`      | Fold an `Event` into accumulated state and re-render on each update.     |
| `useAdapter`    | Create an imperative push adapter (`{ push, event }`) for bridging callbacks into Aeon. |

Plus `createScheduler` for advanced cases (custom scheduler per subtree), and `Reactive` / `bindText` / `bindAttr` for fine-grained binding without re-rendering the surrounding component.

## Example

```tsx
import { useStepper } from "tachys-aeon"

function MouseTracker({ moves }: { moves: Event<{ x: number; y: number }> }) {
  const pos = useStepper({ x: 0, y: 0 }, moves)
  return <div>Mouse: {pos.x}, {pos.y}</div>
}
```

`useStepper` creates the Behavior from the Event, subscribes for re-renders, and disposes everything on unmount.

## License

Dual-licensed under MIT or Apache-2.0, at your option.
