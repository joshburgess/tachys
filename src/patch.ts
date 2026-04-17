/**
 * DOM patching operations -- prop setting and diffing.
 *
 * Uses direct property access for common props (id, style)
 * instead of setAttribute for better V8 optimization.
 *
 * className is handled separately via the VNode's top-level className field,
 * not through the props loop.
 *
 * Event handlers are routed through the delegation system (events.ts).
 *
 * Uses for...in without hasOwnProperty (like Inferno) for maximum JIT
 * performance on clean props objects.
 */

import { isCollecting, pushThunk } from "./effects"
import { cleanupEvents, updateEvent } from "./events"

/**
 * Map React-style prop names to their corresponding HTML attribute names.
 * Props not in this map are passed through as-is.
 */
const PROP_TO_ATTR: Record<string, string> = {
  htmlFor: "for",
  httpEquiv: "http-equiv",
  acceptCharset: "accept-charset",
  accessKey: "accesskey",
  autoCapitalize: "autocapitalize",
  autoComplete: "autocomplete",
  autoFocus: "autofocus",
  autoPlay: "autoplay",
  cellPadding: "cellpadding",
  cellSpacing: "cellspacing",
  charSet: "charset",
  classID: "classid",
  colSpan: "colspan",
  contentEditable: "contenteditable",
  crossOrigin: "crossorigin",
  dateTime: "datetime",
  encType: "enctype",
  formAction: "formaction",
  formEncType: "formenctype",
  formMethod: "formmethod",
  formNoValidate: "formnovalidate",
  formTarget: "formtarget",
  frameBorder: "frameborder",
  hrefLang: "hreflang",
  inputMode: "inputmode",
  maxLength: "maxlength",
  mediaGroup: "mediagroup",
  minLength: "minlength",
  noModule: "nomodule",
  noValidate: "novalidate",
  playsInline: "playsinline",
  readOnly: "readonly",
  referrerPolicy: "referrerpolicy",
  rowSpan: "rowspan",
  spellCheck: "spellcheck",
  srcDoc: "srcdoc",
  srcLang: "srclang",
  srcSet: "srcset",
  tabIndex: "tabindex",
  useMap: "usemap",
}

/**
 * Frozen empty props sentinel. When both old and new props reference this
 * object, the differ skips prop enumeration entirely (referential equality).
 */
export const EMPTY_PROPS: Readonly<Record<string, unknown>> = Object.freeze(
  Object.create(null) as Record<string, unknown>,
)

/**
 * Module-level root container reference.
 * Set by mount/patch entry points so prop patching can register delegated events.
 */
let currentRootContainer: Element | null = null

/**
 * Set the root container for event delegation.
 * Called by mount.ts and diff.ts before processing a tree.
 */
export function setRootContainer(root: Element): void {
  currentRootContainer = root
}

/**
 * Get the current root container.
 */
export function getRootContainer(): Element | null {
  return currentRootContainer
}

/**
 * Patch a single prop on a DOM element.
 *
 * When effect collection is active (Transition lane), defers the
 * entire operation as a thunk effect. Otherwise executes directly.
 *
 * @param dom - The DOM element to modify
 * @param key - The prop name
 * @param oldValue - Previous value (null on initial mount)
 * @param newValue - New value (null to remove)
 * @param isSvg - Whether the element is in an SVG context
 */
export function patchProp(
  dom: Element,
  key: string,
  oldValue: unknown,
  newValue: unknown,
  isSvg: boolean,
): void {
  if (isCollecting()) {
    pushThunk(() => patchPropDirect(dom, key, oldValue, newValue, isSvg))
    return
  }
  patchPropDirect(dom, key, oldValue, newValue, isSvg)
}

/**
 * Direct prop patching implementation (no effect queue check).
 * Called by mountProps (always on detached elements) and by
 * patchProp's thunk during commit.
 */
function patchPropDirect(
  dom: Element,
  key: string,
  oldValue: unknown,
  newValue: unknown,
  isSvg: boolean,
): void {
  // Event detection via charCode (integer comparison, faster than string ops)
  if (key.charCodeAt(0) === 111 && key.charCodeAt(1) === 110) {
    // key starts with "on"
    patchEventProp(dom, key, oldValue as EventListener | null, newValue as EventListener | null)
  } else if (key === "id") {
    ;(dom as HTMLElement).id = (newValue as string) ?? ""
  } else if (key === "style") {
    patchStyle(
      dom as HTMLElement,
      oldValue as Record<string, string> | null,
      newValue as Record<string, string> | null,
    )
  } else if (key === "dangerouslySetInnerHTML" || key === "innerHTML") {
    // Handled separately by mount/diff -- skip here
  } else if (key === "ref") {
    // Handled separately -- skip here
  } else if (key === "value") {
    // Must set as DOM property, not attribute, to update the displayed value
    ;(dom as HTMLInputElement).value = newValue == null ? "" : String(newValue)
  } else if (key === "checked") {
    ;(dom as HTMLInputElement).checked = !!newValue
  } else {
    patchAttribute(dom, key, newValue, isSvg)
  }
}

/**
 * Set all props on a DOM element during initial mount.
 * Uses for...in without hasOwnProperty for maximum V8 JIT performance.
 *
 * Calls patchPropDirect (bypasses effect queue check) because mount
 * targets are always detached elements -- the appendChild that inserts
 * the element into the live DOM is what gets deferred, not the prop writes.
 *
 * @param dom - The DOM element
 * @param props - The props object (className already extracted)
 * @param isSvg - Whether the element is in an SVG context
 */
export function mountProps(dom: Element, props: Record<string, unknown>, isSvg: boolean): void {
  for (const key in props) {
    patchPropDirect(dom, key, null, props[key], isSvg)
  }
}

function patchStyle(
  dom: HTMLElement,
  oldStyle: Record<string, string> | null,
  newStyle: Record<string, string> | null,
): void {
  const style = dom.style

  if (newStyle === null) {
    dom.removeAttribute("style")
    return
  }

  // Remove old keys not in new style
  if (oldStyle !== null) {
    for (const key in oldStyle) {
      if (!(key in newStyle)) {
        style.setProperty(key, "")
      }
    }
  }

  // Set new style values
  for (const key in newStyle) {
    const value = newStyle[key]!
    if (oldStyle === null || oldStyle[key] !== value) {
      if (key[0] === "-") {
        // CSS custom properties (--var)
        style.setProperty(key, value)
      } else {
        ;(style as unknown as Record<string, string>)[key] = value
      }
    }
  }
}

function patchEventProp(
  dom: Element,
  key: string,
  oldHandler: EventListener | null,
  newHandler: EventListener | null,
): void {
  // Convert onClick -> click, onMouseDown -> mousedown
  const eventName = key.slice(2).toLowerCase()
  const root = currentRootContainer

  if (root !== null) {
    updateEvent(dom, eventName, oldHandler, newHandler, root)
  } else {
    // Fallback: no root container (shouldn't happen in normal usage)
    if (oldHandler) {
      dom.removeEventListener(eventName, oldHandler)
    }
    if (newHandler) {
      dom.addEventListener(eventName, newHandler)
    }
  }
}

function patchAttribute(dom: Element, key: string, value: unknown, _isSvg: boolean): void {
  const attrName = PROP_TO_ATTR[key] ?? key
  if (value === null || value === undefined || value === false) {
    dom.removeAttribute(attrName)
  } else if (value === true) {
    dom.setAttribute(attrName, "")
  } else {
    dom.setAttribute(attrName, String(value))
  }
}

/**
 * Clean up all delegated events on a DOM element.
 * Called during unmount.
 */
export { cleanupEvents }
