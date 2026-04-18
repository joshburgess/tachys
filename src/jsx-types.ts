/**
 * JSX type definitions for Tachys.
 *
 * Provides IntrinsicElements and Element types for TypeScript JSX support.
 */

import type { Ref } from "./ref"
import type { VNode } from "./vnode"

/**
 * CSS properties type derived from CSSStyleDeclaration.
 *
 * Maps each camelCase CSS property name to a string value, giving autocomplete
 * for standard properties while allowing custom properties via the index signature.
 */
export type CSSProperties = {
  [K in Exclude<
    keyof CSSStyleDeclaration,
    | "length"
    | "parentRule"
    | "cssText"
    | "cssFloat"
    | "getPropertyPriority"
    | "getPropertyValue"
    | "item"
    | "removeProperty"
    | "setProperty"
    | typeof Symbol.iterator
    | number
  >]?: string
} & {
  /** CSS custom properties (e.g. `--my-color`) */
  [key: `--${string}`]: string
}

type EventHandler<E = Event> = (event: E) => void

interface DOMAttributes {
  // Clipboard events
  onCopy?: EventHandler<ClipboardEvent>
  onCut?: EventHandler<ClipboardEvent>
  onPaste?: EventHandler<ClipboardEvent>

  // Composition events
  onCompositionEnd?: EventHandler<CompositionEvent>
  onCompositionStart?: EventHandler<CompositionEvent>
  onCompositionUpdate?: EventHandler<CompositionEvent>

  // Focus events
  onFocus?: EventHandler<FocusEvent>
  onBlur?: EventHandler<FocusEvent>

  // Form events
  onChange?: EventHandler<Event>
  onInput?: EventHandler<Event>
  onSubmit?: EventHandler<Event>
  onReset?: EventHandler<Event>
  onInvalid?: EventHandler<Event>

  // Image events
  onLoad?: EventHandler<Event>
  onError?: EventHandler<Event>

  // Keyboard events
  onKeyDown?: EventHandler<KeyboardEvent>
  onKeyPress?: EventHandler<KeyboardEvent>
  onKeyUp?: EventHandler<KeyboardEvent>

  // Mouse events
  onClick?: EventHandler<MouseEvent>
  onContextMenu?: EventHandler<MouseEvent>
  onDblClick?: EventHandler<MouseEvent>
  onMouseDown?: EventHandler<MouseEvent>
  onMouseEnter?: EventHandler<MouseEvent>
  onMouseLeave?: EventHandler<MouseEvent>
  onMouseMove?: EventHandler<MouseEvent>
  onMouseOut?: EventHandler<MouseEvent>
  onMouseOver?: EventHandler<MouseEvent>
  onMouseUp?: EventHandler<MouseEvent>

  // Drag events
  onDrag?: EventHandler<DragEvent>
  onDragEnd?: EventHandler<DragEvent>
  onDragEnter?: EventHandler<DragEvent>
  onDragExit?: EventHandler<DragEvent>
  onDragLeave?: EventHandler<DragEvent>
  onDragOver?: EventHandler<DragEvent>
  onDragStart?: EventHandler<DragEvent>
  onDrop?: EventHandler<DragEvent>

  // Touch events
  onTouchCancel?: EventHandler<TouchEvent>
  onTouchEnd?: EventHandler<TouchEvent>
  onTouchMove?: EventHandler<TouchEvent>
  onTouchStart?: EventHandler<TouchEvent>

  // Pointer events
  onPointerDown?: EventHandler<PointerEvent>
  onPointerMove?: EventHandler<PointerEvent>
  onPointerUp?: EventHandler<PointerEvent>
  onPointerCancel?: EventHandler<PointerEvent>
  onPointerEnter?: EventHandler<PointerEvent>
  onPointerLeave?: EventHandler<PointerEvent>
  onPointerOver?: EventHandler<PointerEvent>
  onPointerOut?: EventHandler<PointerEvent>

  // Scroll events
  onScroll?: EventHandler<Event>

  // Wheel events
  onWheel?: EventHandler<WheelEvent>

  // Animation events
  onAnimationStart?: EventHandler<AnimationEvent>
  onAnimationEnd?: EventHandler<AnimationEvent>
  onAnimationIteration?: EventHandler<AnimationEvent>

  // Transition events
  onTransitionEnd?: EventHandler<TransitionEvent>

  // Other
  dangerouslySetInnerHTML?: { __html: string }
  children?: VNode | VNode[] | string | number | null
  key?: string | number
  ref?: Ref
}

interface HTMLAttributes extends DOMAttributes {
  // Standard HTML attributes
  accept?: string
  acceptCharset?: string
  accessKey?: string
  action?: string
  allowFullScreen?: boolean
  allowTransparency?: boolean
  alt?: string
  as?: string
  async?: boolean
  autoComplete?:
    | "off"
    | "on"
    | "name"
    | "email"
    | "username"
    | "new-password"
    | "current-password"
    | "one-time-code"
    | "organization"
    | "street-address"
    | "country"
    | "country-name"
    | "postal-code"
    | "cc-name"
    | "cc-number"
    | "cc-exp"
    | "cc-csc"
    | "tel"
    | "url"
    | (string & {})
  autoFocus?: boolean
  autoPlay?: boolean
  capture?: boolean | string
  cellPadding?: number | string
  cellSpacing?: number | string
  charSet?: string
  checked?: boolean
  cite?: string
  className?: string
  cols?: number
  colSpan?: number
  content?: string
  contentEditable?: boolean | "true" | "false" | "plaintext-only"
  controls?: boolean
  coords?: string
  crossOrigin?: "anonymous" | "use-credentials" | (string & {})
  data?: string
  dateTime?: string
  default?: boolean
  defer?: boolean
  dir?: "ltr" | "rtl" | "auto"
  disabled?: boolean
  download?: boolean | string
  draggable?: boolean
  encType?: "application/x-www-form-urlencoded" | "multipart/form-data" | "text/plain"
  for?: string
  form?: string
  formAction?: string
  formEncType?: string
  formMethod?: string
  formNoValidate?: boolean
  formTarget?: string
  frameBorder?: number | string
  headers?: string
  height?: number | string
  hidden?: boolean
  high?: number
  href?: string
  hrefLang?: string
  htmlFor?: string
  httpEquiv?: string
  id?: string
  inputMode?: "none" | "text" | "tel" | "url" | "email" | "numeric" | "decimal" | "search"
  integrity?: string
  is?: string
  label?: string
  lang?: string
  list?: string
  loading?: "eager" | "lazy"
  loop?: boolean
  low?: number
  max?: number | string
  maxLength?: number
  media?: string
  method?: "get" | "post" | "dialog"
  min?: number | string
  minLength?: number
  multiple?: boolean
  muted?: boolean
  name?: string
  noValidate?: boolean
  open?: boolean
  optimum?: number
  pattern?: string
  placeholder?: string
  playsInline?: boolean
  poster?: string
  preload?: "auto" | "metadata" | "none"
  readOnly?: boolean
  rel?:
    | "alternate"
    | "author"
    | "bookmark"
    | "canonical"
    | "dns-prefetch"
    | "external"
    | "help"
    | "icon"
    | "license"
    | "manifest"
    | "modulepreload"
    | "next"
    | "nofollow"
    | "noopener"
    | "noreferrer"
    | "opener"
    | "pingback"
    | "preconnect"
    | "prefetch"
    | "preload"
    | "prerender"
    | "prev"
    | "search"
    | "shortlink"
    | "stylesheet"
    | "tag"
    | (string & {})
  required?: boolean
  reversed?: boolean
  role?:
    | "alert"
    | "alertdialog"
    | "application"
    | "article"
    | "banner"
    | "button"
    | "cell"
    | "checkbox"
    | "columnheader"
    | "combobox"
    | "complementary"
    | "contentinfo"
    | "definition"
    | "dialog"
    | "directory"
    | "document"
    | "feed"
    | "figure"
    | "form"
    | "grid"
    | "gridcell"
    | "group"
    | "heading"
    | "img"
    | "link"
    | "list"
    | "listbox"
    | "listitem"
    | "log"
    | "main"
    | "marquee"
    | "math"
    | "menu"
    | "menubar"
    | "menuitem"
    | "menuitemcheckbox"
    | "menuitemradio"
    | "navigation"
    | "none"
    | "note"
    | "option"
    | "presentation"
    | "progressbar"
    | "radio"
    | "radiogroup"
    | "region"
    | "row"
    | "rowgroup"
    | "rowheader"
    | "scrollbar"
    | "search"
    | "searchbox"
    | "separator"
    | "slider"
    | "spinbutton"
    | "status"
    | "switch"
    | "tab"
    | "table"
    | "tablist"
    | "tabpanel"
    | "term"
    | "textbox"
    | "timer"
    | "toolbar"
    | "tooltip"
    | "tree"
    | "treegrid"
    | "treeitem"
    | (string & {})
  rows?: number
  rowSpan?: number
  sandbox?: string
  scope?: "row" | "col" | "rowgroup" | "colgroup"
  scrolling?: string
  selected?: boolean
  shape?: string
  size?: number
  sizes?: string
  slot?: string
  span?: number
  spellCheck?: boolean
  src?: string
  srcDoc?: string
  srcLang?: string
  srcSet?: string
  start?: number
  step?: number | string
  style?: CSSProperties
  summary?: string
  tabIndex?: number
  target?: "_blank" | "_self" | "_parent" | "_top" | (string & {})
  title?: string
  translate?: "yes" | "no"
  type?:
    | "button"
    | "checkbox"
    | "color"
    | "date"
    | "datetime-local"
    | "email"
    | "file"
    | "hidden"
    | "image"
    | "month"
    | "number"
    | "password"
    | "radio"
    | "range"
    | "reset"
    | "search"
    | "submit"
    | "tel"
    | "text"
    | "time"
    | "url"
    | "week"
    | (string & {})
  useMap?: string
  value?: string | number | string[]
  width?: number | string
  wrap?: "hard" | "soft" | "off"

  referrerPolicy?:
    | ""
    | "no-referrer"
    | "no-referrer-when-downgrade"
    | "origin"
    | "origin-when-cross-origin"
    | "same-origin"
    | "strict-origin"
    | "strict-origin-when-cross-origin"
    | "unsafe-url"

  // Modern HTML attributes
  autocapitalize?: "off" | "none" | "on" | "sentences" | "words" | "characters"
  enterKeyHint?: "enter" | "done" | "go" | "next" | "previous" | "search" | "send"
  fetchPriority?: "high" | "low" | "auto"
  inert?: boolean
  nonce?: string
  popover?: "" | "auto" | "manual"
  popoverTarget?: string
  popoverTargetAction?: "hide" | "show" | "toggle"

  // WAI-ARIA
  "aria-activedescendant"?: string
  "aria-atomic"?: boolean | "true" | "false"
  "aria-autocomplete"?: "none" | "inline" | "list" | "both"
  "aria-busy"?: boolean | "true" | "false"
  "aria-checked"?: boolean | "true" | "false" | "mixed"
  "aria-colcount"?: number
  "aria-colindex"?: number
  "aria-colspan"?: number
  "aria-current"?: boolean | "true" | "false" | "page" | "step" | "location" | "date" | "time"
  "aria-describedby"?: string
  "aria-details"?: string
  "aria-disabled"?: boolean | "true" | "false"
  "aria-expanded"?: boolean | "true" | "false"
  "aria-haspopup"?: boolean | "true" | "false" | "menu" | "listbox" | "tree" | "grid" | "dialog"
  "aria-hidden"?: boolean | "true" | "false"
  "aria-invalid"?: boolean | "true" | "false" | "grammar" | "spelling"
  "aria-label"?: string
  "aria-labelledby"?: string
  "aria-level"?: number
  "aria-live"?: "off" | "assertive" | "polite"
  "aria-modal"?: boolean | "true" | "false"
  "aria-multiline"?: boolean | "true" | "false"
  "aria-multiselectable"?: boolean | "true" | "false"
  "aria-orientation"?: "horizontal" | "vertical"
  "aria-placeholder"?: string
  "aria-pressed"?: boolean | "true" | "false" | "mixed"
  "aria-readonly"?: boolean | "true" | "false"
  "aria-required"?: boolean | "true" | "false"
  "aria-roledescription"?: string
  "aria-rowcount"?: number
  "aria-rowindex"?: number
  "aria-rowspan"?: number
  "aria-selected"?: boolean | "true" | "false"
  "aria-sort"?: "none" | "ascending" | "descending" | "other"
  "aria-valuemax"?: number
  "aria-valuemin"?: number
  "aria-valuenow"?: number
  "aria-valuetext"?: string

  // Data attributes
  [key: `data-${string}`]: string | number | boolean | undefined
}

interface SVGAttributes extends DOMAttributes {
  className?: string
  id?: string
  style?: CSSProperties

  // SVG-specific attributes
  clipPath?: string
  cx?: number | string
  cy?: number | string
  d?: string
  dx?: number | string
  dy?: number | string
  fill?: string
  fillOpacity?: number | string
  fillRule?: "nonzero" | "evenodd" | "inherit"
  filter?: string
  fontFamily?: string
  fontSize?: number | string
  fx?: number | string
  fy?: number | string
  gradientTransform?: string
  gradientUnits?: string
  height?: number | string
  href?: string
  markerEnd?: string
  markerMid?: string
  markerStart?: string
  mask?: string
  offset?: number | string
  opacity?: number | string
  patternContentUnits?: string
  patternUnits?: string
  points?: string
  preserveAspectRatio?: string
  r?: number | string
  rx?: number | string
  ry?: number | string
  spreadMethod?: string
  stopColor?: string
  stopOpacity?: number | string
  stroke?: string
  strokeDasharray?: string | number
  strokeDashoffset?: string | number
  strokeLinecap?: "butt" | "round" | "square" | "inherit"
  strokeLinejoin?: "miter" | "round" | "bevel" | "inherit"
  strokeMiterlimit?: number | string
  strokeOpacity?: number | string
  strokeWidth?: number | string
  textAnchor?: string
  textDecoration?: string
  transform?: string
  viewBox?: string
  width?: number | string
  x?: number | string
  x1?: number | string
  x2?: number | string
  xlinkHref?: string
  xmlns?: string
  y?: number | string
  y1?: number | string
  y2?: number | string
}

type HTMLElementTag = {
  a: HTMLAttributes
  abbr: HTMLAttributes
  address: HTMLAttributes
  area: HTMLAttributes
  article: HTMLAttributes
  aside: HTMLAttributes
  audio: HTMLAttributes
  b: HTMLAttributes
  base: HTMLAttributes
  bdi: HTMLAttributes
  bdo: HTMLAttributes
  blockquote: HTMLAttributes
  body: HTMLAttributes
  br: HTMLAttributes
  button: HTMLAttributes
  canvas: HTMLAttributes
  caption: HTMLAttributes
  cite: HTMLAttributes
  code: HTMLAttributes
  col: HTMLAttributes
  colgroup: HTMLAttributes
  data: HTMLAttributes
  datalist: HTMLAttributes
  dd: HTMLAttributes
  del: HTMLAttributes
  details: HTMLAttributes
  dfn: HTMLAttributes
  dialog: HTMLAttributes
  div: HTMLAttributes
  dl: HTMLAttributes
  dt: HTMLAttributes
  em: HTMLAttributes
  embed: HTMLAttributes
  fieldset: HTMLAttributes
  figcaption: HTMLAttributes
  figure: HTMLAttributes
  footer: HTMLAttributes
  form: HTMLAttributes
  h1: HTMLAttributes
  h2: HTMLAttributes
  h3: HTMLAttributes
  h4: HTMLAttributes
  h5: HTMLAttributes
  h6: HTMLAttributes
  head: HTMLAttributes
  header: HTMLAttributes
  hgroup: HTMLAttributes
  hr: HTMLAttributes
  html: HTMLAttributes
  i: HTMLAttributes
  iframe: HTMLAttributes
  img: HTMLAttributes
  input: HTMLAttributes
  ins: HTMLAttributes
  kbd: HTMLAttributes
  label: HTMLAttributes
  legend: HTMLAttributes
  li: HTMLAttributes
  link: HTMLAttributes
  main: HTMLAttributes
  map: HTMLAttributes
  mark: HTMLAttributes
  menu: HTMLAttributes
  meta: HTMLAttributes
  meter: HTMLAttributes
  nav: HTMLAttributes
  noscript: HTMLAttributes
  object: HTMLAttributes
  ol: HTMLAttributes
  optgroup: HTMLAttributes
  option: HTMLAttributes
  output: HTMLAttributes
  p: HTMLAttributes
  picture: HTMLAttributes
  pre: HTMLAttributes
  progress: HTMLAttributes
  q: HTMLAttributes
  rp: HTMLAttributes
  rt: HTMLAttributes
  ruby: HTMLAttributes
  s: HTMLAttributes
  samp: HTMLAttributes
  script: HTMLAttributes
  search: HTMLAttributes
  section: HTMLAttributes
  select: HTMLAttributes
  slot: HTMLAttributes
  small: HTMLAttributes
  source: HTMLAttributes
  span: HTMLAttributes
  strong: HTMLAttributes
  style: HTMLAttributes
  sub: HTMLAttributes
  summary: HTMLAttributes
  sup: HTMLAttributes
  table: HTMLAttributes
  tbody: HTMLAttributes
  td: HTMLAttributes
  template: HTMLAttributes
  textarea: HTMLAttributes
  tfoot: HTMLAttributes
  th: HTMLAttributes
  thead: HTMLAttributes
  time: HTMLAttributes
  title: HTMLAttributes
  tr: HTMLAttributes
  track: HTMLAttributes
  u: HTMLAttributes
  ul: HTMLAttributes
  var: HTMLAttributes
  video: HTMLAttributes
  wbr: HTMLAttributes
}

type SVGElementTag = {
  svg: SVGAttributes
  animate: SVGAttributes
  animateMotion: SVGAttributes
  animateTransform: SVGAttributes
  circle: SVGAttributes
  clipPath: SVGAttributes
  defs: SVGAttributes
  desc: SVGAttributes
  ellipse: SVGAttributes
  feBlend: SVGAttributes
  feColorMatrix: SVGAttributes
  feComponentTransfer: SVGAttributes
  feComposite: SVGAttributes
  feConvolveMatrix: SVGAttributes
  feDiffuseLighting: SVGAttributes
  feDisplacementMap: SVGAttributes
  feDistantLight: SVGAttributes
  feFlood: SVGAttributes
  feFuncA: SVGAttributes
  feFuncB: SVGAttributes
  feFuncG: SVGAttributes
  feFuncR: SVGAttributes
  feGaussianBlur: SVGAttributes
  feImage: SVGAttributes
  feMerge: SVGAttributes
  feMergeNode: SVGAttributes
  feMorphology: SVGAttributes
  feOffset: SVGAttributes
  fePointLight: SVGAttributes
  feSpecularLighting: SVGAttributes
  feSpotLight: SVGAttributes
  feTile: SVGAttributes
  feTurbulence: SVGAttributes
  filter: SVGAttributes
  foreignObject: SVGAttributes
  g: SVGAttributes
  image: SVGAttributes
  line: SVGAttributes
  linearGradient: SVGAttributes
  marker: SVGAttributes
  mask: SVGAttributes
  metadata: SVGAttributes
  path: SVGAttributes
  pattern: SVGAttributes
  polygon: SVGAttributes
  polyline: SVGAttributes
  radialGradient: SVGAttributes
  rect: SVGAttributes
  stop: SVGAttributes
  switch: SVGAttributes
  symbol: SVGAttributes
  text: SVGAttributes
  textPath: SVGAttributes
  tspan: SVGAttributes
  use: SVGAttributes
}

export declare namespace JSX {
  type Element = VNode
  interface IntrinsicAttributes {
    key?: string | number
  }
  type IntrinsicElements = HTMLElementTag & SVGElementTag
}
