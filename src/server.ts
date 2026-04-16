/**
 * Server-side rendering for Phasm.
 *
 * Provides renderToString(vnode) which serializes a VNode tree to an HTML
 * string. Runs in any JavaScript environment (Node.js, Deno, Bun, edge
 * functions) with no DOM dependency.
 *
 * Hooks work during SSR: useState/useReducer return initial values,
 * useMemo/useCallback compute normally, useEffect/useLayoutEffect are
 * no-ops (effects are never run on the server), and useContext reads
 * from the context value stack as usual.
 *
 * Usage:
 *   import { renderToString } from "phasm/server"
 *   const html = renderToString(h(App, null))
 */

export { hydrate } from "./hydrate"
import { buildProps, renderComponentSSR, resetIdCounter } from "./component"
import type { ProviderFunction } from "./context"
import { ChildFlags, VNodeFlags } from "./flags"
import type { ComponentFn, DangerousInnerHTML, VNode } from "./vnode"

// --- HTML escaping ---

const ESCAPE_RE = /[&<>"]/g
const ESCAPE_MAP: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
}

function escapeHtml(str: string): string {
  return str.replace(ESCAPE_RE, (ch) => ESCAPE_MAP[ch]!)
}

// --- Void elements (self-closing, no children) ---

const VOID_ELEMENTS = new Set([
  "area",
  "base",
  "br",
  "col",
  "embed",
  "hr",
  "img",
  "input",
  "link",
  "meta",
  "param",
  "source",
  "track",
  "wbr",
])

// --- Style object to string ---

/**
 * Convert a camelCase CSS property name to kebab-case.
 * e.g. "backgroundColor" -> "background-color"
 */
function camelToKebab(str: string): string {
  let result = ""
  for (let i = 0; i < str.length; i++) {
    const ch = str.charCodeAt(i)
    // Uppercase A-Z: 65-90
    if (ch >= 65 && ch <= 90) {
      result += `-${String.fromCharCode(ch + 32)}`
    } else {
      result += str[i]
    }
  }
  return result
}

function styleToString(style: Record<string, string | number>): string {
  let result = ""
  for (const key in style) {
    const value = style[key]
    if (value === null || value === undefined || value === "") continue
    if (result !== "") result += ";"
    // CSS custom properties start with --
    const cssKey = key[0] === "-" ? key : camelToKebab(key)
    result += `${cssKey}:${value}`
  }
  return result
}

// --- Prop name mapping (React camelCase -> HTML attribute) ---

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

function mapPropName(key: string): string {
  return PROP_TO_ATTR[key] ?? key
}

// --- Context support ---

function getProviderContext(type: ComponentFn): { _stack: unknown[] } | null {
  return "_context" in type ? (type as ProviderFunction<unknown>)._context : null
}

// --- Main API ---

/**
 * Render a VNode tree to an HTML string.
 *
 * Components are called with their props, hooks work for the initial
 * render, and the result is serialized. Effects are not executed.
 *
 * @param vnode - The VNode tree to render
 * @returns HTML string
 */
export function renderToString(vnode: VNode): string {
  resetIdCounter()
  return renderNode(vnode)
}

function renderNode(vnode: VNode): string {
  const flags = vnode.flags

  if ((flags & VNodeFlags.Text) !== 0) {
    return escapeHtml(vnode.children as string)
  }

  if ((flags & VNodeFlags.Element) !== 0) {
    return renderElement(vnode)
  }

  if ((flags & VNodeFlags.Component) !== 0) {
    return renderComponent(vnode)
  }

  if ((flags & VNodeFlags.Fragment) !== 0) {
    return renderChildren(vnode)
  }

  return ""
}

function renderElement(vnode: VNode): string {
  const tag = vnode.type as string
  let html = `<${tag}`

  // className -> class attribute
  if (vnode.className !== null) {
    html += ` class="${escapeHtml(vnode.className)}"`
  }

  // Props -> attributes
  const props = vnode.props
  if (props !== null) {
    for (const key in props) {
      const value = props[key]

      // Skip internal/client-only props
      if (key === "ref" || key === "key" || key === "className") continue

      // Skip event handlers
      if (key.charCodeAt(0) === 111 && key.charCodeAt(1) === 110) continue

      // dangerouslySetInnerHTML handled below
      if (key === "dangerouslySetInnerHTML" || key === "innerHTML") continue

      if (key === "style") {
        if (value !== null && typeof value === "object") {
          const styleStr = styleToString(value as Record<string, string | number>)
          if (styleStr !== "") {
            html += ` style="${escapeHtml(styleStr)}"`
          }
        }
        continue
      }

      const attrName = mapPropName(key)

      // Boolean attributes
      if (value === true) {
        html += ` ${attrName}`
        continue
      }
      if (value === false || value === null || value === undefined) {
        continue
      }

      html += ` ${attrName}="${escapeHtml(String(value))}"`
    }
  }

  // Void elements: self-closing, no children
  if (VOID_ELEMENTS.has(tag)) {
    html += ">"
    return html
  }

  html += ">"

  // dangerouslySetInnerHTML
  if (props !== null && props["dangerouslySetInnerHTML"] !== undefined) {
    html += (props["dangerouslySetInnerHTML"] as DangerousInnerHTML).__html
  } else {
    // Children
    html += renderChildren(vnode)
  }

  html += `</${tag}>`
  return html
}

function renderComponent(vnode: VNode): string {
  const type = vnode.type as ComponentFn
  const props = buildProps(vnode)

  // Context provider: push value before rendering
  const providerCtx = getProviderContext(type)
  if (providerCtx !== null) providerCtx._stack.push(props["value"])

  // Render the component (hooks work via currentInstance)
  const rendered = renderComponentSSR(type, props)

  // Serialize the rendered tree
  const html = renderNode(rendered)

  // Context provider: pop after rendering
  if (providerCtx !== null) providerCtx._stack.pop()

  return html
}

// --- Streaming API ---

/**
 * Render a VNode tree to a ReadableStream of HTML strings.
 *
 * Uses the Web Streams API (available in Node 18+, Deno, Bun, Cloudflare
 * Workers, and browsers). Content is emitted in chunks as the tree is
 * walked, enabling chunked transfer encoding for faster TTFB.
 *
 * Usage:
 *   import { renderToReadableStream } from "phasm/server"
 *   const stream = renderToReadableStream(h(App, null))
 *   return new Response(stream, { headers: { "Content-Type": "text/html" } })
 *
 * @param vnode - The VNode tree to render
 * @returns A ReadableStream that emits HTML string chunks
 */
export function renderToReadableStream(vnode: VNode): ReadableStream<string> {
  return new ReadableStream<string>({
    start(controller) {
      resetIdCounter()
      streamNode(vnode, controller)
      controller.close()
    },
  })
}

function streamNode(vnode: VNode, controller: ReadableStreamDefaultController<string>): void {
  const flags = vnode.flags

  if ((flags & VNodeFlags.Text) !== 0) {
    controller.enqueue(escapeHtml(vnode.children as string))
    return
  }

  if ((flags & VNodeFlags.Element) !== 0) {
    streamElement(vnode, controller)
    return
  }

  if ((flags & VNodeFlags.Component) !== 0) {
    streamComponent(vnode, controller)
    return
  }

  if ((flags & VNodeFlags.Fragment) !== 0) {
    streamChildren(vnode, controller)
  }
}

function streamElement(vnode: VNode, controller: ReadableStreamDefaultController<string>): void {
  const tag = vnode.type as string
  let openTag = `<${tag}`

  if (vnode.className !== null) {
    openTag += ` class="${escapeHtml(vnode.className)}"`
  }

  const props = vnode.props
  if (props !== null) {
    openTag += renderAttributes(props)
  }

  if (VOID_ELEMENTS.has(tag)) {
    controller.enqueue(`${openTag}>`)
    return
  }

  controller.enqueue(`${openTag}>`)

  if (props !== null && props["dangerouslySetInnerHTML"] !== undefined) {
    controller.enqueue((props["dangerouslySetInnerHTML"] as DangerousInnerHTML).__html)
  } else {
    streamChildren(vnode, controller)
  }

  controller.enqueue(`</${tag}>`)
}

function streamComponent(vnode: VNode, controller: ReadableStreamDefaultController<string>): void {
  const type = vnode.type as ComponentFn
  const props = buildProps(vnode)

  const providerCtx = getProviderContext(type)
  if (providerCtx !== null) providerCtx._stack.push(props["value"])

  const rendered = renderComponentSSR(type, props)
  streamNode(rendered, controller)

  if (providerCtx !== null) providerCtx._stack.pop()
}

function streamChildren(vnode: VNode, controller: ReadableStreamDefaultController<string>): void {
  const childFlags = vnode.childFlags

  if (childFlags === ChildFlags.NoChildren) return

  if (childFlags === ChildFlags.HasTextChildren) {
    controller.enqueue(escapeHtml(vnode.children as string))
    return
  }

  if (childFlags === ChildFlags.HasSingleChild) {
    streamNode(vnode.children as VNode, controller)
    return
  }

  const children = vnode.children as VNode[]
  for (let i = 0; i < children.length; i++) {
    streamNode(children[i]!, controller)
  }
}

/**
 * Render prop attributes to a string fragment (shared by streaming path).
 */
function renderAttributes(props: Record<string, unknown>): string {
  let result = ""
  for (const key in props) {
    const value = props[key]

    if (key === "ref" || key === "key" || key === "className") continue
    if (key.charCodeAt(0) === 111 && key.charCodeAt(1) === 110) continue
    if (key === "dangerouslySetInnerHTML" || key === "innerHTML") continue

    if (key === "style") {
      if (value !== null && typeof value === "object") {
        const styleStr = styleToString(value as Record<string, string | number>)
        if (styleStr !== "") {
          result += ` style="${escapeHtml(styleStr)}"`
        }
      }
      continue
    }

    const attrName = mapPropName(key)

    if (value === true) {
      result += ` ${attrName}`
      continue
    }
    if (value === false || value === null || value === undefined) {
      continue
    }

    result += ` ${attrName}="${escapeHtml(String(value))}"`
  }
  return result
}

// --- String rendering helpers ---

function renderChildren(vnode: VNode): string {
  const childFlags = vnode.childFlags

  if (childFlags === ChildFlags.NoChildren) {
    return ""
  }

  if (childFlags === ChildFlags.HasTextChildren) {
    return escapeHtml(vnode.children as string)
  }

  if (childFlags === ChildFlags.HasSingleChild) {
    return renderNode(vnode.children as VNode)
  }

  // Array children (keyed or non-keyed)
  const children = vnode.children as VNode[]
  let html = ""
  for (let i = 0; i < children.length; i++) {
    html += renderNode(children[i]!)
  }
  return html
}
