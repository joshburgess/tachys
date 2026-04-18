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
  let target = event.target as Element | null

  while (target !== null && target !== rootContainer) {
    const handlers = target.__tachys
    if (handlers != null) {
      const handler = handlers[eventName]
      if (handler !== undefined) {
        handler.call(target, event)

        // Check if propagation was stopped
        if (event.cancelBubble) return
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
        handler.call(rootContainer, event)
      }
    }
  }
}
