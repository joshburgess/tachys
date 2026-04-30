/**
 * Client-side hydration for Tachys.
 *
 * hydrate(vnode, container) walks server-rendered DOM and attaches
 * event listeners, component instances, and refs without re-creating
 * DOM elements. After hydration, the VNode tree is fully live and
 * subsequent updates use the normal patch/diff path.
 *
 * Suspense-aware hydration:
 *   - Suspense boundary components are detected and wired up with
 *     suspend/resolve handlers, just like mountComponent.
 *   - Streaming SSR placeholders (ph:N spans, phr:N divs, swap scripts)
 *     are cleaned up during hydration.
 *   - Selective hydration: when the user interacts with content inside
 *     a not-yet-hydrated Suspense boundary, that boundary is hydrated
 *     at Sync priority.
 *
 * Usage:
 *   import { hydrate } from "tachys/server"
 *   hydrate(h(App, null), document.getElementById("app")!)
 */

import {
  finalizeHydratedComponent,
  hydrateComponentInstance,
  hydrateSuspenseInstance,
  finalizeSuspenseComponent,
  switchSuspenseToFallback,
  resetIdCounter,
} from "./component"
import type { ComponentInstance } from "./component"
import { ChildFlags, VNodeFlags } from "./flags"
import { mountInternal } from "./mount"
import { mountProps, setRootContainer } from "./patch"
import { bridgeRerender } from "./reconcile-bridge"
import { setRef } from "./ref"
import { scheduleUpdate } from "./scheduler-shim"
import { isSuspenseFn, isThenable, pushSuspendHandler, popSuspendHandler } from "./suspense"
import type { ComponentFn } from "./vnode"
import type { VNode } from "./vnode"

// --- Streaming SSR cleanup ---

/**
 * Remove streaming SSR artifacts from the container before hydration.
 * This cleans up:
 *   - Swap script elements (<script> containing $ph)
 *   - Hidden resolved content divs (<div hidden id="phr:N">)
 *   - Placeholder comments (<!--$ph:N-->)
 *   - Placeholder spans are left in place -- they contain the fallback
 *     content that gets replaced during Suspense hydration.
 */
function cleanStreamingArtifacts(container: Element): void {
  // Remove swap scripts and hidden resolved-content divs
  const scripts = container.querySelectorAll("script")
  for (let i = scripts.length - 1; i >= 0; i--) {
    const script = scripts[i]!
    if (script.textContent && script.textContent.indexOf("$ph") !== -1) {
      script.remove()
    }
  }

  // Remove hidden phr:N divs (resolved content already swapped in by scripts)
  const hiddenDivs = container.querySelectorAll("div[hidden][id^='phr:']")
  for (let i = hiddenDivs.length - 1; i >= 0; i--) {
    hiddenDivs[i]!.remove()
  }

  // Remove placeholder comments
  removeCommentNodes(container, "$ph:")
}

/**
 * Walk the DOM tree and remove comment nodes matching a prefix.
 */
function removeCommentNodes(node: Node, prefix: string): void {
  const walker = document.createTreeWalker(node, NodeFilter.SHOW_COMMENT)
  const toRemove: Comment[] = []
  let current = walker.nextNode()
  while (current !== null) {
    if ((current as Comment).data.indexOf(prefix) === 0) {
      toRemove.push(current as Comment)
    }
    current = walker.nextNode()
  }
  for (let i = 0; i < toRemove.length; i++) {
    toRemove[i]!.remove()
  }
}

// --- Selective hydration ---

/**
 * Pending Suspense boundaries that haven't finished hydrating.
 * Maps placeholder DOM node to a callback that hydrates the boundary.
 */
const pendingBoundaries = new Map<Node, () => void>()

/**
 * Event types that trigger selective hydration. When a user interacts
 * with content inside a pending Suspense boundary, we hydrate it
 * immediately at Sync priority.
 */
const INTERACTIVE_EVENTS = ["click", "input", "keydown", "focusin"]

let selectiveHydrationInstalled = false

function installSelectiveHydration(root: Element): void {
  if (selectiveHydrationInstalled) return
  selectiveHydrationInstalled = true

  for (const eventType of INTERACTIVE_EVENTS) {
    root.addEventListener(
      eventType,
      (event: Event) => {
        if (pendingBoundaries.size === 0) return
        const target = event.target as Node | null
        if (target === null) return

        // Walk up from the event target to find a pending boundary
        for (const [placeholder, hydrateFn] of pendingBoundaries) {
          if (placeholder.contains(target)) {
            // Hydrate this boundary immediately
            pendingBoundaries.delete(placeholder)
            hydrateFn()
            break
          }
        }
      },
      { capture: true },
    )
  }
}

// --- Public API ---

/**
 * Hydrate a server-rendered DOM tree with a VNode tree.
 *
 * Walks existing DOM nodes and matches them to the VNode tree,
 * attaching event listeners and creating component instances.
 * After hydration, the app is interactive and further updates
 * use the normal diff/patch path.
 *
 * Handles streaming SSR artifacts (placeholder spans, swap scripts,
 * hidden resolved-content divs) by cleaning them up before walking.
 *
 * @param vnode - The VNode tree (same tree used for renderToString)
 * @param container - The DOM element containing the server-rendered HTML
 */
export function hydrate(vnode: VNode, container: Element): void {
  resetIdCounter()
  setRootContainer(container)
  cleanStreamingArtifacts(container)
  installSelectiveHydration(container)
  hydrateNode(vnode, container, container.firstChild)
}

/**
 * Hydrate a single VNode against an existing DOM node.
 * Returns the next sibling DOM node to process.
 */
function hydrateNode(
  vnode: VNode,
  parentDom: Element,
  domNode: ChildNode | null,
): ChildNode | null {
  const flags = vnode.flags

  if ((flags & VNodeFlags.Element) !== 0) {
    return hydrateElement(vnode, parentDom, domNode)
  }

  if ((flags & VNodeFlags.Text) !== 0) {
    return hydrateText(vnode, parentDom, domNode)
  }

  if ((flags & VNodeFlags.Component) !== 0) {
    return hydrateComponent(vnode, parentDom, domNode)
  }

  if ((flags & VNodeFlags.Fragment) !== 0) {
    return hydrateFragment(vnode, parentDom, domNode)
  }

  return domNode
}

function hydrateElement(
  vnode: VNode,
  parentDom: Element,
  domNode: ChildNode | null,
): ChildNode | null {
  if (domNode === null || domNode.nodeType !== 1) {
    // Mismatch: fall back to mount
    mountFallback(vnode, parentDom, domNode)
    return domNode
  }

  const dom = domNode as Element
  vnode.dom = dom
  vnode.parentDom = parentDom

  const isSvg = (vnode.flags & VNodeFlags.Svg) !== 0

  // Attach event listeners and other client-only props (skip attributes
  // that are already in the HTML). We only need events and refs.
  const props = vnode.props
  if (props !== null) {
    // Mount event handlers (they start with "on")
    for (const key in props) {
      if (key.charCodeAt(0) === 111 && key.charCodeAt(1) === 110) {
        // Event handler: attach via mountProps path
        mountProps(dom, { [key]: props[key] }, isSvg)
      }
    }

    // Attach ref
    if (props["ref"] !== undefined) {
      setRef(props["ref"], dom)
    }
  }

  // Hydrate children
  const childFlags = vnode.childFlags
  if (
    childFlags === ChildFlags.HasSingleChild ||
    childFlags === ChildFlags.HasKeyedChildren ||
    childFlags === ChildFlags.HasNonKeyedChildren
  ) {
    hydrateChildren(vnode, dom)
  }

  return domNode.nextSibling
}

function hydrateText(
  vnode: VNode,
  parentDom: Element,
  domNode: ChildNode | null,
): ChildNode | null {
  if (domNode === null || domNode.nodeType !== 3) {
    mountFallback(vnode, parentDom, domNode)
    return domNode
  }

  vnode.dom = domNode as Text
  vnode.parentDom = parentDom

  // Update text content if it doesn't match (shouldn't happen normally)
  if (domNode.textContent !== vnode.children) {
    domNode.textContent = vnode.children as string
  }

  return domNode.nextSibling
}

function hydrateComponent(
  vnode: VNode,
  parentDom: Element,
  domNode: ChildNode | null,
): ChildNode | null {
  const type = vnode.type as ComponentFn

  // Suspense boundary: needs special handling for suspend/resolve lifecycle
  if (isSuspenseFn(type)) {
    return hydrateSuspenseBoundary(vnode, parentDom, domNode)
  }

  // Regular component: create instance, render, walk existing DOM
  const { rendered, instance } = hydrateComponentInstance(vnode, parentDom)
  const next = hydrateNode(rendered, parentDom, domNode)
  finalizeHydratedComponent(vnode, instance, rendered)

  return next
}

/**
 * Hydrate a Suspense boundary. If the children rendered synchronously on
 * the server (no suspension), we hydrate them normally. If the content
 * was streamed (placeholder span), we handle the swap.
 *
 * During hydration, lazy() components that haven't loaded yet will throw
 * a Promise. We catch it, show the fallback (which should match the
 * server-rendered fallback), and schedule re-hydration when the Promise
 * resolves.
 */
function hydrateSuspenseBoundary(
  vnode: VNode,
  parentDom: Element,
  domNode: ChildNode | null,
): ChildNode | null {
  // Check if this is a streaming placeholder (span with id="ph:N")
  const placeholderSpan = findStreamingPlaceholder(domNode)

  if (placeholderSpan !== null) {
    // This Suspense boundary was streamed with a placeholder.
    // The swap script should have already replaced the placeholder with
    // resolved content. If the swap hasn't happened yet, hydrate the
    // fallback and register for selective hydration.
    return hydrateStreamedSuspense(vnode, parentDom, domNode, placeholderSpan)
  }

  // Normal case: children rendered synchronously on the server.
  // Create the Suspense instance and render it (gets children VNode).
  const { rendered, instance } = hydrateSuspenseInstance(vnode, parentDom)

  // Push a suspend handler so thrown promises from lazy children during
  // hydration are caught by this Suspense boundary.
  let suspendedPromise: Promise<unknown> | null = null
  pushSuspendHandler((promise: Promise<unknown>) => {
    suspendedPromise = promise
  })

  let next: ChildNode | null
  try {
    next = hydrateNode(rendered, parentDom, domNode)
  } catch (err) {
    popSuspendHandler()
    if (isThenable(err)) {
      suspendedPromise = err
      return handleSuspenseDuringHydration(vnode, instance, parentDom, domNode, err)
    }
    throw err
  }

  popSuspendHandler()

  if (suspendedPromise !== null) {
    return handleSuspenseDuringHydration(vnode, instance, parentDom, domNode, suspendedPromise)
  }

  // Children hydrated without suspending
  finalizeSuspenseComponent(vnode, instance, rendered)
  return next
}

/**
 * Handle a suspended child during Suspense hydration. Switches the
 * Suspense to fallback state and re-hydrates when the promise resolves.
 */
function handleSuspenseDuringHydration(
  vnode: VNode,
  instance: ComponentInstance,
  parentDom: Element,
  domNode: ChildNode | null,
  promise: Promise<unknown>,
): ChildNode | null {
  // Switch to fallback state
  const fallback = switchSuspenseToFallback(vnode, instance)

  // The server-rendered fallback DOM should be in place.
  // Hydrate the fallback VNode against existing DOM.
  const next = hydrateNode(fallback, parentDom, domNode)
  finalizeSuspenseComponent(vnode, instance, fallback)

  // Register for selective hydration
  if (domNode !== null) {
    pendingBoundaries.set(domNode, () => {
      instance._hooks[0]!.value = false
      bridgeRerender(instance)
    })
  }

  // When promise resolves, clear loading state and re-render
  promise.then(
    () => {
      if (domNode !== null) pendingBoundaries.delete(domNode)
      instance._hooks[0]!.value = false
      scheduleUpdate(instance)
    },
    () => {
      if (domNode !== null) pendingBoundaries.delete(domNode)
      instance._hooks[0]!.value = false
      scheduleUpdate(instance)
    },
  )

  return next
}

/**
 * Check if a DOM node is a streaming placeholder span (id="ph:N").
 */
function findStreamingPlaceholder(domNode: ChildNode | null): HTMLSpanElement | null {
  if (
    domNode !== null &&
    domNode.nodeType === 1 &&
    (domNode as Element).tagName === "SPAN"
  ) {
    const id = (domNode as Element).id
    if (id.indexOf("ph:") === 0) {
      return domNode as HTMLSpanElement
    }
  }
  return null
}

/**
 * Hydrate a streamed Suspense boundary. The placeholder span contains
 * fallback content (or has already been swapped to resolved content).
 */
function hydrateStreamedSuspense(
  vnode: VNode,
  parentDom: Element,
  domNode: ChildNode | null,
  placeholderSpan: HTMLSpanElement,
): ChildNode | null {
  const next = placeholderSpan.nextSibling

  // Check if resolved content exists (swap script may have already run)
  const id = placeholderSpan.id.slice(3) // "ph:N" -> "N"
  const resolvedDiv = parentDom.querySelector(`#phr\\:${id}`)

  if (resolvedDiv !== null) {
    // Swap script already placed resolved content. Move children from
    // the hidden div to replace the placeholder, then hydrate normally.
    const fragment = document.createDocumentFragment()
    while (resolvedDiv.firstChild) {
      fragment.appendChild(resolvedDiv.firstChild)
    }
    parentDom.replaceChild(fragment, placeholderSpan)
    resolvedDiv.remove()
  } else {
    // Swap hasn't happened yet (placeholder still contains fallback).
    // Unwrap the span so the fallback content is directly in the tree.
    const fragment = document.createDocumentFragment()
    while (placeholderSpan.firstChild) {
      fragment.appendChild(placeholderSpan.firstChild)
    }
    parentDom.replaceChild(fragment, placeholderSpan)
  }

  // Now hydrate the Suspense component against the (possibly swapped) DOM
  const { rendered, instance } = hydrateSuspenseInstance(vnode, parentDom)

  // Recalculate domNode after our DOM manipulation
  const currentDom = next !== null ? next.previousSibling : parentDom.lastChild

  // Push suspend handler for lazy children
  let streamSuspendedPromise: Promise<unknown> | null = null
  pushSuspendHandler((promise: Promise<unknown>) => {
    streamSuspendedPromise = promise
  })

  try {
    hydrateNode(rendered, parentDom, currentDom)
  } catch (err) {
    popSuspendHandler()
    if (isThenable(err)) {
      streamSuspendedPromise = err
      const fallback = switchSuspenseToFallback(vnode, instance)
      hydrateNode(fallback, parentDom, currentDom)
      finalizeSuspenseComponent(vnode, instance, fallback)
      err.then(
        () => { instance._hooks[0]!.value = false; scheduleUpdate(instance) },
        () => { instance._hooks[0]!.value = false; scheduleUpdate(instance) },
      )
      return next
    }
    throw err
  }

  popSuspendHandler()

  if (streamSuspendedPromise !== null) {
    const fallback = switchSuspenseToFallback(vnode, instance)
    hydrateNode(fallback, parentDom, currentDom)
    finalizeSuspenseComponent(vnode, instance, fallback)
    ;(streamSuspendedPromise as Promise<unknown>).then(
      () => { instance._hooks[0]!.value = false; scheduleUpdate(instance) },
      () => { instance._hooks[0]!.value = false; scheduleUpdate(instance) },
    )
    return next
  }

  finalizeSuspenseComponent(vnode, instance, rendered)
  return next
}

function hydrateFragment(
  vnode: VNode,
  parentDom: Element,
  domNode: ChildNode | null,
): ChildNode | null {
  vnode.parentDom = parentDom

  const childFlags = vnode.childFlags

  if (childFlags === ChildFlags.HasSingleChild) {
    const child = vnode.children as VNode
    const next = hydrateNode(child, parentDom, domNode)
    vnode.dom = child.dom
    return next
  }

  if (childFlags === ChildFlags.HasKeyedChildren || childFlags === ChildFlags.HasNonKeyedChildren) {
    const children = vnode.children as VNode[]
    let cursor = domNode
    for (let i = 0; i < children.length; i++) {
      cursor = hydrateNode(children[i]!, parentDom, cursor)
    }
    vnode.dom = children[0]!.dom
    return cursor
  }

  if (childFlags === ChildFlags.HasTextChildren) {
    if (domNode !== null && domNode.nodeType === 3) {
      vnode.dom = domNode as Text
      return domNode.nextSibling
    }
  }

  // Empty fragment
  vnode.dom = domNode as Element | Text | null
  return domNode
}

function hydrateChildren(vnode: VNode, dom: Element): void {
  const childFlags = vnode.childFlags
  let cursor: ChildNode | null = dom.firstChild

  if (childFlags === ChildFlags.HasSingleChild) {
    hydrateNode(vnode.children as VNode, dom, cursor)
  } else if (
    childFlags === ChildFlags.HasKeyedChildren ||
    childFlags === ChildFlags.HasNonKeyedChildren
  ) {
    const children = vnode.children as VNode[]
    for (let i = 0; i < children.length; i++) {
      cursor = hydrateNode(children[i]!, dom, cursor)
    }
  }
}

/**
 * Fallback: when hydration encounters a mismatch, mount the VNode fresh.
 */
function mountFallback(vnode: VNode, parentDom: Element, before: ChildNode | null): void {
  mountInternal(vnode, parentDom, false)
  // Move the mounted node before the current position if needed
  if (before !== null && vnode.dom !== null) {
    parentDom.insertBefore(vnode.dom, before)
  }
}
