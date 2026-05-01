/**
 * Event delegation system.
 *
 * Maintains a single delegated listener per event type on the root container.
 * When an event fires, walks from event.target up through the DOM tree,
 * checking each node for a stored handler.
 *
 * Handlers are stored on a single __tachys object on each DOM node (one stable
 * hidden class shape) rather than per-event properties that would cause
 * hidden class transitions.
 *
 * Non-bubbling events (focus, blur, etc.) use direct addEventListener instead.
 */

/**
 * Handler storage on DOM nodes. A single object with known event-name keys.
 */
interface TachysHandlers {
  [eventName: string]: EventListener | undefined
}

// Augment Element to include our handler storage
declare global {
  interface Element {
    __tachys?: TachysHandlers
  }
}

/**
 * Per-event scratch slot. Set by an inner delegated listener to the root
 * container it dispatched against, so an outer listener (another nested
 * root, or the document-level listener) resumes the bubble walk above
 * that ancestor and doesn't re-invoke handlers the inner pass already ran.
 */
interface TachysEvent extends Event {
  __tachysStopAt?: Element
}

import { batchedUpdates } from "./scheduler-shim"

/**
 * Events that do not bubble and must use direct addEventListener.
 * Typed as a string literal union to make the set self-documenting and
 * catch typos at compile time.
 */
type NonBubblingEvent =
  | "focus"
  | "blur"
  | "scroll"
  | "load"
  | "unload"
  | "error"
  | "resize"
  | "mouseenter"
  | "mouseleave"
  | "pointerenter"
  | "pointerleave"

const NON_BUBBLING_EVENTS: ReadonlySet<string> = new Set<NonBubblingEvent>([
  "focus",
  "blur",
  "scroll",
  "load",
  "unload",
  "error",
  "resize",
  "mouseenter",
  "mouseleave",
  "pointerenter",
  "pointerleave",
])

/**
 * Pre-define __tachys on Node.prototype so all DOM nodes share the same
 * hidden class shape for this property. Without this, the first write of
 * dom.__tachys = {...} causes a hidden class transition that makes subsequent
 * reads polymorphic/megamorphic across element types.
 *
 * This is the same technique Inferno uses with $EV/$V on Node.prototype.
 */
if (typeof Node !== "undefined") {
  // biome-ignore lint/suspicious/noExplicitAny: patching prototype for V8 optimization
  ;(Node.prototype as any).__tachys = null
}

/**
 * Track which event types have been delegated on which root containers.
 * Map<rootElement, Set<eventName>>
 */
const delegatedEvents = new WeakMap<Element, Set<string>>()

/**
 * Attach an event handler to a DOM element via the delegation system.
 *
 * For bubbling events: stores the handler on the element and ensures
 * a delegated listener exists on the root container.
 * For non-bubbling events: attaches directly via addEventListener.
 *
 * @param dom - The DOM element to attach the handler to
 * @param eventName - The lowercase event name (e.g. "click", "input")
 * @param handler - The event listener function
 * @param rootContainer - The root container for delegation
 */
export function attachEvent(
  dom: Element,
  eventName: string,
  handler: EventListener,
  rootContainer: Element,
): void {
  if (NON_BUBBLING_EVENTS.has(eventName)) {
    dom.addEventListener(eventName, handler)
    storeHandler(dom, eventName, handler)
    return
  }

  storeHandler(dom, eventName, handler)
  ensureDelegated(rootContainer, eventName)
}

/**
 * Remove an event handler from a DOM element.
 *
 * @param dom - The DOM element
 * @param eventName - The lowercase event name
 * @param handler - The handler to remove (needed for non-bubbling cleanup)
 */
export function detachEvent(dom: Element, eventName: string, handler: EventListener): void {
  if (NON_BUBBLING_EVENTS.has(eventName)) {
    dom.removeEventListener(eventName, handler)
  }

  const handlers = dom.__tachys
  if (handlers != null) {
    handlers[eventName] = undefined
  }
}

/**
 * Update an event handler on a DOM element.
 *
 * @param dom - The DOM element
 * @param eventName - The lowercase event name
 * @param oldHandler - Previous handler (null if none)
 * @param newHandler - New handler (null to remove)
 * @param rootContainer - The root container for delegation
 */
export function updateEvent(
  dom: Element,
  eventName: string,
  oldHandler: EventListener | null,
  newHandler: EventListener | null,
  rootContainer: Element,
): void {
  if (NON_BUBBLING_EVENTS.has(eventName)) {
    if (oldHandler !== null) {
      dom.removeEventListener(eventName, oldHandler)
    }
    if (newHandler !== null) {
      dom.addEventListener(eventName, newHandler)
      storeHandler(dom, eventName, newHandler)
    } else {
      clearHandler(dom, eventName)
    }
    return
  }

  if (newHandler !== null) {
    storeHandler(dom, eventName, newHandler)
    ensureDelegated(rootContainer, eventName)
  } else {
    clearHandler(dom, eventName)
  }
}

/**
 * Remove all event handlers from a DOM element.
 * Called during unmount.
 *
 * @param dom - The DOM element to clean up
 */
export function cleanupEvents(dom: Element): void {
  const handlers = dom.__tachys
  if (handlers == null) return

  // Remove direct listeners for non-bubbling events
  // Uses for...in (no Object.keys() array allocation)
  for (const eventName in handlers) {
    const handler = handlers[eventName]
    if (handler !== undefined && NON_BUBBLING_EVENTS.has(eventName)) {
      dom.removeEventListener(eventName, handler)
    }
    handlers[eventName] = undefined
  }
}

// --- Internal helpers ---

function storeHandler(dom: Element, eventName: string, handler: EventListener): void {
  let handlers = dom.__tachys
  if (handlers == null) {
    handlers = {}
    dom.__tachys = handlers
  }
  handlers[eventName] = handler
}

function clearHandler(dom: Element, eventName: string): void {
  const handlers = dom.__tachys
  if (handlers != null) {
    handlers[eventName] = undefined
  }
}

function ensureDelegated(rootContainer: Element, eventName: string): void {
  let events = delegatedEvents.get(rootContainer)
  if (events === undefined) {
    events = new Set()
    delegatedEvents.set(rootContainer, events)
  }

  if (events.has(eventName)) return
  events.add(eventName)

  rootContainer.addEventListener(eventName, (event: Event) => {
    delegatedEventHandler(event, eventName, rootContainer)
  })
}

function delegatedEventHandler(event: Event, eventName: string, rootContainer: Element): void {
  // Batch all setStates triggered by this event so the handler and render
  // run in a single EventDispatch FunctionCall (matches Inferno's behavior).
  batchedUpdates(() => {
    // If an inner-fired delegated listener already dispatched up to some
    // ancestor, resume from above it. Bubble phase fires inner-most root
    // first, so this naturally chains across nested roots and the doc
    // listener (see docDelegatedHandler).
    const stopAt = (event as TachysEvent).__tachysStopAt
    let target: Element | null = stopAt
      ? (stopAt.parentElement as Element | null)
      : (event.target as Element | null)

    while (target !== null && target !== rootContainer) {
      const handlers = target.__tachys
      if (handlers != null) {
        const handler = handlers[eventName]
        if (handler !== undefined) {
          // Override currentTarget so user handlers see the element the
          // listener was conceptually attached to, not the root container
          // where the native listener actually lives.
          Object.defineProperty(event, "currentTarget", {
            value: target,
            configurable: true,
          })
          handler.call(target, event)

          // Check if propagation was stopped
          if (event.cancelBubble) {
            ;(event as TachysEvent).__tachysStopAt = rootContainer
            return
          }
        }
      }

      target = target.parentElement
    }

    // Also check the root container itself
    if (target === rootContainer) {
      const handlers = rootContainer.__tachys
      if (handlers != null) {
        const handler = handlers[eventName]
        if (handler !== undefined) {
          Object.defineProperty(event, "currentTarget", {
            value: rootContainer,
            configurable: true,
          })
          handler.call(rootContainer, event)
        }
      }
    }
    // Outer listeners (other roots, document) resume above this root.
    ;(event as TachysEvent).__tachysStopAt = rootContainer
  })
}

/**
 * Compiled-runtime event attach. Stores the handler on `el.__tachys` and
 * lazily wires a single document-level listener per event type that walks
 * up the DOM dispatching handlers it finds. Lets compiled components skip
 * the per-element `el.onclick = fn` IDL-attribute write, which on Krausest
 * 07_create10k saves ~6ms of paint-side work across 20k handler attaches.
 *
 * Non-bubbling events fall back to direct addEventListener (same as
 * `attachEvent`).
 *
 * No rootContainer parameter: the compiler doesn't easily know it, and
 * document is a fine default for SPAs. Mixed compiled + manual-API trees
 * should ensure their root containers and document-delegated event sets
 * don't both dispatch the same event on overlapping subtrees, since the
 * two paths share `__tachys` storage (see events.ts:25).
 */
const docDelegated = new Set<string>()

export function _attachEvent(el: Element, eventName: string, handler: EventListener): void {
  if (NON_BUBBLING_EVENTS.has(eventName)) {
    el.addEventListener(eventName, handler)
    return
  }
  let handlers = el.__tachys
  if (handlers == null) {
    handlers = {}
    el.__tachys = handlers
  }
  handlers[eventName] = handler
  if (!docDelegated.has(eventName)) {
    docDelegated.add(eventName)
    document.addEventListener(eventName, docDelegatedHandler)
  }
}

function docDelegatedHandler(event: Event): void {
  batchedUpdates(() => {
    const evName = event.type
    // Inner root-level listeners may have already dispatched up to some
    // ancestor; resume from above it so the same handler doesn't fire twice.
    const stopAt = (event as TachysEvent).__tachysStopAt
    let target: Node | null = stopAt
      ? (stopAt.parentNode as Node | null)
      : (event.target as Node | null)
    while (target !== null && target !== document) {
      const handlers = (target as Element).__tachys
      if (handlers != null) {
        const handler = handlers[evName]
        if (handler !== undefined) {
          // Override currentTarget so user handlers can rely on it
          // pointing at the element the listener was attached to (the
          // standard React/native pattern). Native currentTarget would
          // be `document` here because that's where the listener lives.
          Object.defineProperty(event, "currentTarget", {
            value: target,
            configurable: true,
          })
          handler.call(target, event)
          if (event.cancelBubble) return
        }
      }
      target = target.parentNode
    }
  })
}
