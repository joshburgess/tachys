/**
 * Typed mini-DSL for emitting JavaScript source. Each helper returns a
 * `JsExpr` or `JsStmt` value whose `.src` (for expressions) or
 * `.render(indent)` (for statements) yields final source code. Nominal
 * branding on both types means the type checker catches attempts to mix
 * an expression into a statement slot or vice versa.
 *
 * No dependency on any particular AST library — the output is a string.
 * A Rust or Go port of the emitter can reimplement this DSL in ~150
 * lines of equivalent helpers.
 *
 * Precedence tracking: every expression carries a `prec` number
 * corresponding to the JS operator-precedence table (higher = tighter
 * binding). Helpers that embed a sub-expression call `wrap(sub, minPrec)`
 * which parenthesizes the sub only when its `prec` is lower than the
 * surrounding context requires. That way hand-written `raw()` snippets
 * coming out of the IR stay unparenthesized when safe and get wrapped
 * when not, so the output matches what @babel/generator would produce
 * for the same shape.
 */

const EXPR_BRAND: unique symbol = Symbol("JsExpr")
const STMT_BRAND: unique symbol = Symbol("JsStmt")

export interface JsExpr {
  readonly [EXPR_BRAND]: true
  readonly src: string
  readonly prec: number
}

export interface JsStmt {
  readonly [STMT_BRAND]: true
  render(indent: string): string[]
}

// JS operator precedence table (subset used by the emitter).
// Higher number = tighter binding.
export const PREC = {
  PRIMARY: 18, // literals, identifiers, parenthesized, member, call, new
  UNARY: 14,
  EXPONENT: 13,
  MUL: 12, // * / %
  ADD: 11, // + -
  SHIFT: 10,
  REL: 9, // < <= > >= in instanceof
  EQ: 8, // == != === !==
  BAND: 7,
  BXOR: 6,
  BOR: 5,
  AND: 4, // &&
  OR: 3, // ||
  TERNARY: 2,
  ASSIGN: 1,
  COMMA: 0,
} as const

function makeExpr(src: string, prec: number): JsExpr {
  return { [EXPR_BRAND]: true, src, prec }
}

function makeStmt(render: (indent: string) => string[]): JsStmt {
  return { [STMT_BRAND]: true, render }
}

/**
 * Return the embedded source of `e` wrapped in parens iff `e.prec` is
 * lower than `minPrec` (i.e. the embedded expression binds looser than
 * the context permits).
 */
function wrap(e: JsExpr, minPrec: number): string {
  return e.prec < minPrec ? `(${e.src})` : e.src
}

// ---------------------------------------------------------------------
// Primary expressions
// ---------------------------------------------------------------------

export function id(name: string): JsExpr {
  return makeExpr(name, PREC.PRIMARY)
}

export function num(n: number): JsExpr {
  return makeExpr(String(n), PREC.PRIMARY)
}

export function str(s: string): JsExpr {
  return makeExpr(JSON.stringify(s), PREC.PRIMARY)
}

export function bool(b: boolean): JsExpr {
  return makeExpr(b ? "true" : "false", PREC.PRIMARY)
}

export const nullLit: JsExpr = makeExpr("null", PREC.PRIMARY)

/**
 * Embed a user-supplied expression source string whose syntactic shape
 * we can't statically know (e.g., comes from the CompiledIR). Treated
 * at the ASSIGN level so it parenthesizes unless the context is very
 * permissive; upstream frontends that know the precedence of their
 * source can pass an explicit `prec` override.
 */
export function raw(src: string, prec: number = PREC.ASSIGN): JsExpr {
  return makeExpr(src, prec)
}

// ---------------------------------------------------------------------
// Member / call / new
// ---------------------------------------------------------------------

export function member(obj: JsExpr, prop: string): JsExpr {
  return makeExpr(`${wrap(obj, PREC.PRIMARY)}.${prop}`, PREC.PRIMARY)
}

export function computedMember(obj: JsExpr, key: JsExpr): JsExpr {
  return makeExpr(`${wrap(obj, PREC.PRIMARY)}[${key.src}]`, PREC.PRIMARY)
}

export function call(fn: JsExpr, args: readonly JsExpr[]): JsExpr {
  const rendered = args.map((a) => wrap(a, PREC.ASSIGN + 1)).join(", ")
  return makeExpr(`${wrap(fn, PREC.PRIMARY)}(${rendered})`, PREC.PRIMARY)
}

// ---------------------------------------------------------------------
// Object / array / spread / template literal
// ---------------------------------------------------------------------

export type ObjEntry =
  | { readonly kind: "prop"; readonly key: string; readonly value: JsExpr }
  | { readonly kind: "spread"; readonly value: JsExpr }
  | { readonly kind: "shorthand"; readonly name: string }

export function obj(entries: readonly ObjEntry[]): JsExpr {
  if (entries.length === 0) return makeExpr("{}", PREC.PRIMARY)
  const parts = entries.map((e) => {
    if (e.kind === "spread") return `...${wrap(e.value, PREC.ASSIGN + 1)}`
    if (e.kind === "shorthand") return e.name
    return `${e.key}: ${wrap(e.value, PREC.ASSIGN + 1)}`
  })
  return makeExpr(`{ ${parts.join(", ")} }`, PREC.PRIMARY)
}

export function arr(items: readonly JsExpr[]): JsExpr {
  const parts = items.map((e) => wrap(e, PREC.ASSIGN + 1)).join(", ")
  return makeExpr(`[${parts}]`, PREC.PRIMARY)
}

// ---------------------------------------------------------------------
// Operators
// ---------------------------------------------------------------------

export type BinaryOp =
  | "+"
  | "-"
  | "*"
  | "/"
  | "%"
  | "==="
  | "!=="
  | "=="
  | "!="
  | "<"
  | "<="
  | ">"
  | ">="

const BIN_PREC: Record<BinaryOp, number> = {
  "+": PREC.ADD,
  "-": PREC.ADD,
  "*": PREC.MUL,
  "/": PREC.MUL,
  "%": PREC.MUL,
  "===": PREC.EQ,
  "!==": PREC.EQ,
  "==": PREC.EQ,
  "!=": PREC.EQ,
  "<": PREC.REL,
  "<=": PREC.REL,
  ">": PREC.REL,
  ">=": PREC.REL,
}

export function bin(op: BinaryOp, lhs: JsExpr, rhs: JsExpr): JsExpr {
  const prec = BIN_PREC[op]
  // Binary ops are left-associative: rhs needs `prec + 1`, lhs just `prec`.
  return makeExpr(`${wrap(lhs, prec)} ${op} ${wrap(rhs, prec + 1)}`, prec)
}

export function and(lhs: JsExpr, rhs: JsExpr): JsExpr {
  return makeExpr(
    `${wrap(lhs, PREC.AND)} && ${wrap(rhs, PREC.AND + 1)}`,
    PREC.AND,
  )
}

export function or(lhs: JsExpr, rhs: JsExpr): JsExpr {
  return makeExpr(
    `${wrap(lhs, PREC.OR)} || ${wrap(rhs, PREC.OR + 1)}`,
    PREC.OR,
  )
}

export function not(e: JsExpr): JsExpr {
  return makeExpr(`!${wrap(e, PREC.UNARY)}`, PREC.UNARY)
}

export function ternary(cond: JsExpr, cons: JsExpr, alt: JsExpr): JsExpr {
  return makeExpr(
    `${wrap(cond, PREC.TERNARY + 1)} ? ${wrap(cons, PREC.ASSIGN + 1)} : ${wrap(alt, PREC.ASSIGN + 1)}`,
    PREC.TERNARY,
  )
}

export function assign(lhs: JsExpr, rhs: JsExpr): JsExpr {
  // Assignment is right-associative: lhs binds tighter.
  return makeExpr(
    `${wrap(lhs, PREC.ASSIGN + 1)} = ${wrap(rhs, PREC.ASSIGN)}`,
    PREC.ASSIGN,
  )
}

// ---------------------------------------------------------------------
// Arrow functions
// ---------------------------------------------------------------------

export function arrow(params: readonly string[], body: JsExpr): JsExpr {
  const paramSrc =
    params.length === 1 ? params[0]! : `(${params.join(", ")})`
  // If body is an object literal, wrap in parens so the parser doesn't
  // read the `{` as a block.
  const bodySrc = body.src.startsWith("{")
    ? `(${body.src})`
    : wrap(body, PREC.ASSIGN)
  return makeExpr(`${paramSrc} => ${bodySrc}`, PREC.ASSIGN)
}

export function arrowBlock(
  params: readonly string[],
  body: readonly JsStmt[],
): JsExpr {
  const paramSrc =
    params.length === 1 ? params[0]! : `(${params.join(", ")})`
  if (body.length === 0) return makeExpr(`${paramSrc} => {}`, PREC.ASSIGN)
  // Arrow function body spans multiple lines; we render it as a block
  // statement. The emitter's top-level renderStmts handles indent.
  const renderedLines: string[] = []
  renderedLines.push(`${paramSrc} => {`)
  for (const stmt of body) {
    for (const line of stmt.render("  ")) renderedLines.push(line)
  }
  renderedLines.push(`}`)
  // This is a multi-line expression. We stash the joined form in .src and
  // rely on the surrounding context to emit it as-is. Callers that need
  // pretty indent should use `renderMultilineArrow` (below) or pass it
  // via a statement wrapper.
  return makeExpr(renderedLines.join("\n"), PREC.ASSIGN)
}

// ---------------------------------------------------------------------
// Statements
// ---------------------------------------------------------------------

export function vdecl(
  kind: "const" | "let" | "var",
  name: string,
  init: JsExpr,
): JsStmt {
  return makeStmt((indent) => [`${indent}${kind} ${name} = ${init.src};`])
}

export function exprStmt(expr: JsExpr): JsStmt {
  return makeStmt((indent) => [`${indent}${expr.src};`])
}

export function ret(expr: JsExpr): JsStmt {
  return makeStmt((indent) => [`${indent}return ${expr.src};`])
}

export function ifStmt(
  cond: JsExpr,
  cons: readonly JsStmt[],
  alt?: readonly JsStmt[],
): JsStmt {
  return makeStmt((indent) => {
    const inner = `${indent}  `
    const lines: string[] = []
    lines.push(`${indent}if (${cond.src}) {`)
    for (const s of cons) for (const l of s.render(inner)) lines.push(l)
    if (alt !== undefined && alt.length > 0) {
      lines.push(`${indent}} else {`)
      for (const s of alt) for (const l of s.render(inner)) lines.push(l)
    }
    lines.push(`${indent}}`)
    return lines
  })
}

export function block(stmts: readonly JsStmt[]): JsStmt {
  return makeStmt((indent) => {
    const inner = `${indent}  `
    const lines: string[] = [`${indent}{`]
    for (const s of stmts) for (const l of s.render(inner)) lines.push(l)
    lines.push(`${indent}}`)
    return lines
  })
}

/**
 * Render a list of statements to a single source string with newline
 * separators, rooted at the given base indent.
 */
export function renderStmts(
  stmts: readonly JsStmt[],
  indent: string = "",
): string {
  const out: string[] = []
  for (const s of stmts) for (const l of s.render(indent)) out.push(l)
  return out.join("\n")
}
