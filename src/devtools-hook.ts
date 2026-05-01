/**
 * DevTools integration hook.
 *
 * Installs a global `__TACHYS_DEVTOOLS_HOOK__` object on the window that the
 * Tachys DevTools Chrome extension reads from. The hook provides methods
 * to walk the VNode tree, inspect component instances, and subscribe to
 * render events.
 *
 * This module is side-effect-only: import it to activate the hook.
 * It is stripped from production builds via the `__DEV__` guard.
 */

import { getComponentInstance } from "./component"
import type { ComponentInstance } from "./component"
import { __DEV__, getComponentName } from "./dev"
import { ChildFlags, VNodeFlags } from "./flags"
import type { VNode } from "./vnode"

// --- Types ---

export interface SerializedNode {
  id: number
  name: string
  type: "element" | "component" | "text" | "fragment" | "void"
  key: string | number | null
  props: Record<string, unknown> | null
  hooks: SerializedHook[] | null
  effects: SerializedEffect[] | null
  children: SerializedNode[]
  domTagName: string | null
}

interface SerializedHook {
  index: number
  value: unknown
}

interface SerializedEffect {
  index: number
  hasDeps: boolean
  depCount: number
  hasCleanup: boolean
  pendingRun: boolean
}

type RenderListener = (rootContainer: Element, serializedTree: SerializedNode) => void

export interface TachysDevToolsHook {
  /** Library version */
  version: string
  /** All tracked root containers */
  roots: Set<Element>
  /** Subscribe to render events */
  onRender: (listener: RenderListener) => () => void
  /** Serialize the full VNode tree for a root container */
  inspectRoot: (container: Element) => SerializedNode | null
  /** Highlight a DOM element (adds/removes overlay) */
  highlight: (domNode: Element | null) => void
  /** Get events registered on a DOM element */
  getEvents: (domNode: Element) => Record<string, boolean>
}

// --- State ---

let nextNodeId = 1
const nodeIdMap = new WeakMap<VNode, number>()
const listeners = new Set<RenderListener>()

function getNodeId(vnode: VNode): number {
  let id = nodeIdMap.get(vnode)
  if (id === undefined) {
    id = nextNodeId++
    nodeIdMap.set(vnode, id)
  }
  return id
}

// --- Serialization ---

function getNodeType(vnode: VNode): SerializedNode["type"] {
  const f = vnode.flags as number
  if (f & (VNodeFlags.Element as number)) return "element"
  if (f & (VNodeFlags.Component as number)) return "component"
  if (f & (VNodeFlags.Fragment as number)) return "fragment"
  if (f & (VNodeFlags.Void as number)) return "void"
  return "text"
}

function serializeHooks(instance: ComponentInstance): SerializedHook[] {
  return instance._hooks.map((h, i) => ({
    index: i,
    value: safeSerialize(h.value),
  }))
}

function serializeEffects(instance: ComponentInstance): SerializedEffect[] {
  return instance._effects.map((e, i) => ({
    index: i,
    hasDeps: e.deps !== null,
    depCount: e.deps ? e.deps.length : 0,
    hasCleanup: e.cleanup !== null,
    pendingRun: e.pendingRun,
  }))
}

function safeSerialize(value: unknown): unknown {
  if (value === null || value === undefined) return value
  const t = typeof value
  if (t === "string" || t === "number" || t === "boolean") return value
  if (t === "function") return `[Function: ${(value as { name?: string }).name || "anonymous"}]`
  if (Array.isArray(value)) {
    if (value.length > 20) return `[Array(${value.length})]`
    return value.map(safeSerialize)
  }
  if (t === "object") {
    try {
      const obj = value as Record<string, unknown>
      const keys = Object.keys(obj)
      if (keys.length > 20) return `[Object(${keys.length} keys)]`
      const result: Record<string, unknown> = {}
      for (const k of keys) {
        result[k] = safeSerialize(obj[k])
      }
      return result
    } catch {
      return "[Object]"
    }
  }
  return String(value)
}

function serializeVNode(vnode: VNode): SerializedNode {
  const id = getNodeId(vnode)
  const nodeType = getNodeType(vnode)
  let name: string
  let hooks: SerializedHook[] | null = null
  let effects: SerializedEffect[] | null = null
  let props: Record<string, unknown> | null = null

  if (nodeType === "component") {
    const fn = vnode.type as (...args: never[]) => unknown
    name = getComponentName(fn)
    const instance = getComponentInstance(vnode)
    if (instance) {
      hooks = serializeHooks(instance)
      effects = serializeEffects(instance)
      props = safeSerialize(instance._props) as Record<string, unknown>
    }
  } else if (nodeType === "element") {
    name = vnode.type as string
    props = vnode.props ? (safeSerialize(vnode.props) as Record<string, unknown>) : null
  } else if (nodeType === "text") {
    name = "#text"
  } else if (nodeType === "fragment") {
    name = "<Fragment>"
  } else {
    name = "<Void>"
  }

  const serializedChildren: SerializedNode[] = []
  const cf = vnode.childFlags as number

  if (nodeType === "component") {
    // For components, the rendered output is stored in children
    const instance = getComponentInstance(vnode)
    if (instance?._rendered) {
      serializedChildren.push(serializeVNode(instance._rendered))
    }
  } else if (cf & (ChildFlags.HasSingleChild as number)) {
    serializedChildren.push(serializeVNode(vnode.children as VNode))
  } else if (
    cf & (ChildFlags.HasKeyedChildren as number) ||
    cf & (ChildFlags.HasNonKeyedChildren as number)
  ) {
    for (const child of vnode.children as VNode[]) {
      serializedChildren.push(serializeVNode(child))
    }
  }

  let domTagName: string | null = null
  if (vnode.dom && "tagName" in vnode.dom) {
    domTagName = (vnode.dom as Element).tagName.toLowerCase()
  }

  return {
    id,
    name,
    type: nodeType,
    key: vnode.key,
    props,
    hooks,
    effects,
    children: serializedChildren,
    domTagName,
  }
}

// --- Highlight overlay ---

let highlightOverlay: HTMLDivElement | null = null

function highlight(domNode: Element | null): void {
  if (!highlightOverlay) {
    highlightOverlay = document.createElement("div")
    highlightOverlay.id = "__tachys-devtools-highlight"
    highlightOverlay.style.cssText =
      "position:fixed;pointer-events:none;z-index:2147483647;border:2px solid #61dafb;background:rgba(97,218,251,0.15);transition:all 0.1s ease;"
  }

  if (!domNode) {
    highlightOverlay.remove()
    return
  }

  const rect = domNode.getBoundingClientRect()
  highlightOverlay.style.top = `${rect.top}px`
  highlightOverlay.style.left = `${rect.left}px`
  highlightOverlay.style.width = `${rect.width}px`
  highlightOverlay.style.height = `${rect.height}px`

  if (!highlightOverlay.parentElement) {
    document.body.appendChild(highlightOverlay)
  }
}

// --- Events inspection ---

function getEvents(domNode: Element): Record<string, boolean> {
  const handlers = (domNode as unknown as { __tachys?: Record<string, unknown> }).__tachys
  if (!handlers) return {}
  const result: Record<string, boolean> = {}
  for (const key of Object.keys(handlers)) {
    if (handlers[key] !== undefined) {
      result[key] = true
    }
  }
  return result
}

// --- Hook installation ---

let rootTrees: WeakMap<Element, VNode> | null = null
const trackedRoots = new Set<Element>()

export function __devtools_setRootTrees(map: WeakMap<Element, VNode>): void {
  rootTrees = map
}

export function __devtools_notifyRender(container: Element): void {
  trackedRoots.add(container)
  if (listeners.size === 0) return
  const tree = inspectRoot(container)
  if (tree) {
    for (const fn of listeners) {
      try {
        fn(container, tree)
      } catch {
        // don't let listener errors break the render path
      }
    }
  }
}

function inspectRoot(container: Element): SerializedNode | null {
  if (!rootTrees) return null
  const vnode = rootTrees.get(container)
  if (!vnode) return null
  return serializeVNode(vnode)
}

function onRender(listener: RenderListener): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

// --- Install the global hook ---

export function installDevToolsHook(): void {
  if (typeof window === "undefined") return

  const hook: TachysDevToolsHook = {
    version: "0.0.1",
    roots: trackedRoots,
    onRender,
    inspectRoot,
    highlight,
    getEvents,
  }
  ;(
    window as unknown as { __TACHYS_DEVTOOLS_HOOK__: TachysDevToolsHook }
  ).__TACHYS_DEVTOOLS_HOOK__ = hook

  // Dispatch event to notify extension that the hook is ready
  window.dispatchEvent(new CustomEvent("__TACHYS_DEVTOOLS_HOOK_READY__"))
}

if (__DEV__) {
  installDevToolsHook()
}
