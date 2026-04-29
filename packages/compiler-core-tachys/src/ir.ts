/**
 * Portable intermediate representation for a compiled Tachys function
 * component. Carries no dependency on any particular JavaScript AST
 * library: every user-authored expression is stored as a JavaScript
 * source-code string, alongside the list of parent prop names the
 * expression reads (so the emitter can dirty-check without re-parsing).
 *
 * Pipeline:
 *   parse (Babel | SWC | Oxc | ...)
 *     -> frontend grammar check        (AST-specific)
 *       -> CompiledIR                   (this file; portable)
 *         -> emitter                    (string or target-AST; portable
 *                                        or target-specific)
 *
 * The Babel plugin today produces an AST-typed `CompiledResult` (in
 * `compile.ts`) and then converts it to this IR via `compiled-to-ir.ts`.
 * An SWC frontend would produce this IR directly from SWC's AST.
 *
 * Expression-source conventions:
 *   - Parent props are referenced as `props.<name>`. Destructured params
 *     are normalized to `props.<name>` by the frontend before conversion.
 *   - List-item values reference `itemParamName` unchanged (the frontend
 *     preserves the JSX source name; the emitter alpha-renames if needed).
 *   - Expressions must be fully self-contained: any identifier used must
 *     be either `props.<name>`, the list itemParamName, or a literal.
 */

/**
 * Template-literal expression reconstructed as source plus the ordered,
 * deduped list of parent prop names it reads. The source string is a
 * full JavaScript template literal ready to be embedded in emitter
 * output (e.g. `` `hello ${props.name}` ``).
 */
export interface IRCompositeExpr {
  srcExpr: string
  /** Unique prop names referenced, in stable first-seen order. */
  propNames: string[]
}

export interface IRTextSlot {
  kind: "text"
  path: number[]
  propName: string
  composite?: IRCompositeExpr
  placeholder: "marker" | "prealloc"
}

export interface IRAttrSlot {
  kind: "attr"
  path: number[]
  attrName: string
  strategy: "className" | "setAttribute"
  propName: string
  /**
   * Simple ternary fast path. Either branch may be `null`, meaning the
   * attribute is omitted on mount when that branch is taken (and cleared
   * on patch). At least one branch is a string.
   */
  ternary?: { ifTrue: string | null; ifFalse: string | null }
  composite?: IRCompositeExpr
}

export interface IREventSlot {
  kind: "event"
  path: number[]
  domProp: string
  propName: string
}

/**
 * One entry in a child component's prop list. Source order is preserved
 * so later explicit keys can override earlier spreads.
 */
export type IRChildPropEntry =
  | {
      kind: "prop"
      name: string
      /** Source expression referencing `props.<name>` or literals. */
      valueSrc: string
      /** Parent prop names this value reads; empty for literals. */
      deps: string[]
    }
  | {
      kind: "spread"
      valueSrc: string
      deps: string[]
    }

export interface IRComponentSlot {
  kind: "component"
  path: number[]
  componentRef: string
  props: IRChildPropEntry[]
  allDeps: string[]
}

export interface IRListSlot {
  kind: "list"
  path: number[]
  componentRef: string
  arrayPropName: string
  itemParamName: string
  /** Key expression source, referencing `itemParamName` and/or props. */
  keySrc: string
  /** Non-key prop entries. Each valueSrc references `itemParamName` or `props.*`. */
  propSpecs: Array<{
    name: string
    valueSrc: string
  }>
  /** Parent prop names across key + prop entries, deduped in first-seen order. */
  parentPropDeps: string[]
  /**
   * Indices into `parentPropDeps` for parent props that participate in a
   * `<keyExpr> === <props.X>` boolean propSpec, where `<keyExpr>` is
   * structurally identical to this slot's keyExpr. When such a parent dep
   * changes from `oldVal` to `newVal`, only the rows whose key equals
   * `oldVal` or `newVal` need patching, so the runtime can skip the full
   * iteration when only these deps changed.
   */
  selectionDepIndices: number[]
  /**
   * True when this list is the last child of its parent template element.
   * The compiler skips the `<!>` marker and `_mountList` receives the parent
   * element directly; rows are appended via `parent.appendChild`. Saves one
   * DOM node and avoids the trailing comment that inflated Chromium's
   * PrePaint/Layout pass on mid-list `removeChild`.
   */
  tailOfParent: boolean
}

export interface IRCondSlot {
  kind: "cond"
  path: number[]
  componentRef: string
  /** Condition expression source (parent prop refs rewritten to `props.*`). */
  condSrc: string
  condDeps: string[]
  props: IRChildPropEntry[]
  allDeps: string[]
}

export interface IRAltSlot {
  kind: "alt"
  path: number[]
  condSrc: string
  condDeps: string[]
  refA: string
  propsA: IRChildPropEntry[]
  refB: string
  propsB: IRChildPropEntry[]
  allDeps: string[]
}

export type IRSlot =
  | IRTextSlot
  | IRAttrSlot
  | IREventSlot
  | IRComponentSlot
  | IRListSlot
  | IRCondSlot
  | IRAltSlot

export interface CompiledIR {
  html: string
  slots: IRSlot[]
  /** Name used for the props parameter in the emitted mount/patch. */
  propsParamName: string
}
