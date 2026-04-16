# Types & Flags

## VNodeFlags

Bitwise flags for VNode type discrimination:

```ts
VNodeFlags.Text      // 1 - Text node
VNodeFlags.Element   // 2 - DOM element
VNodeFlags.Component // 4 - Functional component
VNodeFlags.Fragment  // 8 - Fragment (multiple roots)
VNodeFlags.Svg       // 256 - SVG element
VNodeFlags.Void      // 512 - Void/empty node
```

Usage:

```ts
if ((vnode.flags & VNodeFlags.Element) !== 0) {
  // This is a DOM element
}
```

## ChildFlags

Bitwise flags for child shape discrimination:

```ts
ChildFlags.NoChildren          // 0
ChildFlags.HasKeyedChildren    // 16
ChildFlags.HasNonKeyedChildren // 32
ChildFlags.HasTextChildren     // 64
ChildFlags.HasSingleChild      // 128
```

## Type Guards

Type-narrowing functions for safe VNode access:

```ts
isTextVNode(vnode)      // narrows to { type: null, children: string }
isElementVNode(vnode)   // narrows to { type: string, dom: Element | null }
isComponentVNode(vnode) // narrows to { type: ComponentFn }
isFragmentVNode(vnode)  // narrows to { type: null }
hasSingleChild(vnode)   // narrows to { children: VNode }
hasArrayChildren(vnode) // narrows to { children: VNode[] }
hasTextChildren(vnode)  // narrows to { children: string }
```

## Core Types

```ts
// The VNode class
class VNode {
  flags: VNodeFlag
  type: VNodeType
  key: string | number | null
  props: Record<string, unknown> | null
  children: VNode[] | VNode | string | null
  dom: Element | Text | null
  childFlags: ChildFlag
  parentDom: Element | null
  className: string | null
}

// VNode type discriminant
type VNodeType = string | ComponentFn | null

// Component function signature
type ComponentFn = (props: Record<string, unknown>) => VNode

// Ref types
type RefObject<T> = { current: T | null }
type RefCallback<T> = (instance: T | null) => void
type Ref<T> = RefObject<T> | RefCallback<T>

// Effect cleanup
type EffectCleanup = void | (() => void)

// dangerouslySetInnerHTML
interface DangerousInnerHTML { __html: string }
```
