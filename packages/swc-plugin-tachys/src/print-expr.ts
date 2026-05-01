/**
 * Minimal JS expression pretty-printer for SWC AST nodes.
 *
 * The printer supports the expression subset that Tachys component bodies
 * can contain (the grammar is enforced by compile-swc.ts): identifiers,
 * literals, member access, calls, binary / logical / unary / conditional
 * expressions, arrow functions, template literals, array / object /
 * spread, parenthesis. Anything else throws — that forces compile-swc to
 * bail out of the fast path rather than silently emit broken source.
 *
 * The printer also implements the "destructured-name rewrite": identifiers
 * that appear in `destructured` are printed as `props.<name>`, matching
 * what the Babel frontend does on its AST before producing the IR.
 *
 * Output format mirrors `@babel/generator --compact` so that tests built
 * against the Babel plugin's output (substring/regex) keep matching.
 */

import type {
  ArrayExpression,
  ArrowFunctionExpression,
  BinaryExpression,
  CallExpression,
  ConditionalExpression,
  Expression,
  Identifier,
  MemberExpression,
  ObjectExpression,
  Pattern,
  TemplateLiteral,
  UnaryExpression,
} from "@swc/types"

export interface PrintContext {
  /**
   * Set of bare identifier names that originated from an object-destructured
   * function parameter (e.g. `function F({a, b}) {...}`). When the printer
   * meets one of these identifiers it emits `props.<name>` instead.
   */
  destructured: ReadonlySet<string> | null
  /**
   * Names bound inside the current expression (e.g. an arrow's `(item)`
   * parameter). Shadowing: an identifier in this set prints as its own
   * name, not `props.<name>`, even if it matches a destructured name.
   */
  bound: Set<string>
}

/** Operator-precedence table, matching the DSL in compiler-core. */
const PREC = {
  PRIMARY: 18,
  UNARY: 14,
  EXPONENT: 13,
  MUL: 12,
  ADD: 11,
  SHIFT: 10,
  REL: 9,
  EQ: 8,
  BAND: 7,
  BXOR: 6,
  BOR: 5,
  AND: 4,
  OR: 3,
  NULLISH: 3,
  TERNARY: 2,
  ASSIGN: 1,
} as const

function binPrec(op: string): number {
  switch (op) {
    case "**":
      return PREC.EXPONENT
    case "*":
    case "/":
    case "%":
      return PREC.MUL
    case "+":
    case "-":
      return PREC.ADD
    case "<<":
    case ">>":
    case ">>>":
      return PREC.SHIFT
    case "<":
    case "<=":
    case ">":
    case ">=":
    case "in":
    case "instanceof":
      return PREC.REL
    case "==":
    case "!=":
    case "===":
    case "!==":
      return PREC.EQ
    case "&":
      return PREC.BAND
    case "^":
      return PREC.BXOR
    case "|":
      return PREC.BOR
    case "&&":
      return PREC.AND
    case "||":
      return PREC.OR
    case "??":
      return PREC.NULLISH
    default:
      return PREC.ASSIGN
  }
}

function wrap(src: string, exprPrec: number, minPrec: number): string {
  return exprPrec < minPrec ? `(${src})` : src
}

interface Printed {
  src: string
  prec: number
}

/**
 * Main entry point. Returns the source of the expression with parent-prop
 * identifiers rewritten to `props.*`.
 */
export function printExpr(expr: Expression, ctx: PrintContext): string {
  return print(expr, ctx).src
}

function print(expr: Expression, ctx: PrintContext): Printed {
  switch (expr.type) {
    case "Identifier": {
      const ident = expr as Identifier
      const name = ident.value
      if (ctx.bound.has(name)) return { src: name, prec: PREC.PRIMARY }
      if (ctx.destructured?.has(name)) {
        return { src: `props.${name}`, prec: PREC.PRIMARY }
      }
      return { src: name, prec: PREC.PRIMARY }
    }
    case "StringLiteral":
      return { src: JSON.stringify(expr.value), prec: PREC.PRIMARY }
    case "NumericLiteral":
      return { src: String(expr.value), prec: PREC.PRIMARY }
    case "BooleanLiteral":
      return { src: expr.value ? "true" : "false", prec: PREC.PRIMARY }
    case "NullLiteral":
      return { src: "null", prec: PREC.PRIMARY }
    case "MemberExpression":
      return printMember(expr as MemberExpression, ctx)
    case "CallExpression":
      return printCall(expr as CallExpression, ctx)
    case "BinaryExpression":
      return printBinary(expr as BinaryExpression, ctx)
    case "UnaryExpression":
      return printUnary(expr as UnaryExpression, ctx)
    case "ConditionalExpression":
      return printConditional(expr as ConditionalExpression, ctx)
    case "ArrowFunctionExpression":
      return printArrow(expr as ArrowFunctionExpression, ctx)
    case "ArrayExpression":
      return printArray(expr as ArrayExpression, ctx)
    case "ObjectExpression":
      return printObject(expr as ObjectExpression, ctx)
    case "TemplateLiteral":
      return printTemplate(expr as TemplateLiteral, ctx)
    case "ParenthesisExpression":
      return print(expr.expression, ctx)
    default:
      throw new Error(`print-expr: unsupported node type ${expr.type}`)
  }
}

function printMember(expr: MemberExpression, ctx: PrintContext): Printed {
  const obj = print(expr.object as Expression, ctx)
  const prop = expr.property
  if (prop.type === "Identifier") {
    return {
      src: `${wrap(obj.src, obj.prec, PREC.PRIMARY)}.${prop.value}`,
      prec: PREC.PRIMARY,
    }
  }
  if (prop.type === "Computed") {
    const keyExpr = (prop as { expression: Expression }).expression
    const key = print(keyExpr, ctx)
    return {
      src: `${wrap(obj.src, obj.prec, PREC.PRIMARY)}[${key.src}]`,
      prec: PREC.PRIMARY,
    }
  }
  throw new Error(`print-expr: unsupported member property ${prop.type}`)
}

function printCall(expr: CallExpression, ctx: PrintContext): Printed {
  const callee = expr.callee
  if (callee.type === "Super" || callee.type === "Import") {
    throw new Error(`print-expr: unsupported call callee ${callee.type}`)
  }
  const fn = print(callee as Expression, ctx)
  const args = expr.arguments.map((a) => {
    const argPrinted = print(a.expression, ctx)
    if (a.spread !== undefined) return `...${argPrinted.src}`
    return wrap(argPrinted.src, argPrinted.prec, PREC.ASSIGN + 1)
  })
  return {
    src: `${wrap(fn.src, fn.prec, PREC.PRIMARY)}(${args.join(",")})`,
    prec: PREC.PRIMARY,
  }
}

function printBinary(expr: BinaryExpression, ctx: PrintContext): Printed {
  const prec = binPrec(expr.operator)
  const lhs = print(expr.left, ctx)
  const rhs = print(expr.right, ctx)
  return {
    src: `${wrap(lhs.src, lhs.prec, prec)}${expr.operator}${wrap(rhs.src, rhs.prec, prec + 1)}`,
    prec,
  }
}

function printUnary(expr: UnaryExpression, ctx: PrintContext): Printed {
  const arg = print(expr.argument, ctx)
  const op = expr.operator
  const space = op === "delete" || op === "typeof" || op === "void" ? " " : ""
  return {
    src: `${op}${space}${wrap(arg.src, arg.prec, PREC.UNARY)}`,
    prec: PREC.UNARY,
  }
}

function printConditional(expr: ConditionalExpression, ctx: PrintContext): Printed {
  const test = print(expr.test, ctx)
  const cons = print(expr.consequent, ctx)
  const alt = print(expr.alternate, ctx)
  return {
    src: `${wrap(test.src, test.prec, PREC.TERNARY + 1)}?${wrap(cons.src, cons.prec, PREC.ASSIGN + 1)}:${wrap(alt.src, alt.prec, PREC.ASSIGN + 1)}`,
    prec: PREC.TERNARY,
  }
}

function printArrow(expr: ArrowFunctionExpression, ctx: PrintContext): Printed {
  const newBound = new Set(ctx.bound)
  const params: string[] = []
  for (const p of expr.params) {
    if (p.type !== "Identifier") {
      throw new Error(`print-expr: unsupported arrow param ${p.type}`)
    }
    const ident = p as Pattern & { value: string }
    params.push(ident.value)
    newBound.add(ident.value)
  }
  const paramSrc = params.length === 1 ? params[0]! : `(${params.join(",")})`
  if (expr.body.type === "BlockStatement") {
    throw new Error("print-expr: block-body arrows are not supported in the subset")
  }
  const body = print(expr.body as Expression, { ...ctx, bound: newBound })
  // If body starts with `{` wrap to disambiguate from a block.
  const bodySrc = body.src.startsWith("{")
    ? `(${body.src})`
    : wrap(body.src, body.prec, PREC.ASSIGN)
  return { src: `${paramSrc}=>${bodySrc}`, prec: PREC.ASSIGN }
}

function printArray(expr: ArrayExpression, ctx: PrintContext): Printed {
  const parts = expr.elements.map((e) => {
    if (e === undefined) return ""
    const p = print(e.expression, ctx)
    if (e.spread !== undefined) return `...${wrap(p.src, p.prec, PREC.ASSIGN + 1)}`
    return wrap(p.src, p.prec, PREC.ASSIGN + 1)
  })
  return { src: `[${parts.join(",")}]`, prec: PREC.PRIMARY }
}

function printObject(expr: ObjectExpression, ctx: PrintContext): Printed {
  const parts = expr.properties.map((p) => {
    if (p.type === "SpreadElement") {
      const inner = print(p.arguments, ctx)
      return `...${wrap(inner.src, inner.prec, PREC.ASSIGN + 1)}`
    }
    if (p.type === "Identifier") {
      const ident = p as Identifier
      const name = ident.value
      if (ctx.bound.has(name)) return name
      if (ctx.destructured?.has(name)) {
        return `${name}:props.${name}`
      }
      return name
    }
    if (p.type === "KeyValueProperty") {
      const kv = p as { key: { type: string; value?: string | number }; value: Expression }
      const k = kv.key
      let keySrc: string
      if (k.type === "Identifier" || k.type === "StringLiteral") {
        keySrc = k.type === "Identifier" ? String(k.value) : JSON.stringify(k.value)
      } else if (k.type === "NumericLiteral") {
        keySrc = String(k.value)
      } else {
        throw new Error(`print-expr: unsupported object key ${k.type}`)
      }
      const v = print(kv.value, ctx)
      return `${keySrc}:${wrap(v.src, v.prec, PREC.ASSIGN + 1)}`
    }
    throw new Error(`print-expr: unsupported object property ${p.type}`)
  })
  return { src: `{${parts.join(",")}}`, prec: PREC.PRIMARY }
}

function printTemplate(expr: TemplateLiteral, ctx: PrintContext): Printed {
  // quasis.length === expressions.length + 1
  let out = "`"
  for (let i = 0; i < expr.quasis.length; i++) {
    out += expr.quasis[i]!.raw
    if (i < expr.expressions.length) {
      const e = print(expr.expressions[i]!, ctx)
      out += `\${${e.src}}`
    }
  }
  out += "`"
  return { src: out, prec: PREC.PRIMARY }
}

/**
 * Collect the prop names a printed expression reads. Walks the AST
 * looking for identifiers in `destructured` (bare, not shadowed) and
 * `props.<X>` member chains. Returns them in first-seen order.
 */
export function collectPropRefs(
  expr: Expression,
  destructured: ReadonlySet<string> | null,
  bound: ReadonlySet<string> = new Set(),
): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  const walk = (e: Expression | Pattern, b: Set<string>): void => {
    switch (e.type) {
      case "Identifier": {
        const ident = e as Identifier
        const name = ident.value
        if (b.has(name)) return
        if (destructured?.has(name)) {
          if (!seen.has(name)) {
            seen.add(name)
            out.push(name)
          }
        }
        return
      }
      case "MemberExpression": {
        const m = e as MemberExpression
        if (
          m.object.type === "Identifier" &&
          (m.object as Identifier).value === "props" &&
          m.property.type === "Identifier"
        ) {
          const name = (m.property as Identifier).value
          if (!seen.has(name)) {
            seen.add(name)
            out.push(name)
          }
          return
        }
        walk(m.object as Expression, b)
        if (m.property.type === "Computed") {
          walk((m.property as { expression: Expression }).expression, b)
        }
        return
      }
      case "CallExpression": {
        const c = e as CallExpression
        if (c.callee.type !== "Super" && c.callee.type !== "Import") {
          walk(c.callee as Expression, b)
        }
        for (const arg of c.arguments) walk(arg.expression, b)
        return
      }
      case "BinaryExpression": {
        const bi = e as BinaryExpression
        walk(bi.left, b)
        walk(bi.right, b)
        return
      }
      case "UnaryExpression": {
        walk((e as UnaryExpression).argument, b)
        return
      }
      case "ConditionalExpression": {
        const co = e as ConditionalExpression
        walk(co.test, b)
        walk(co.consequent, b)
        walk(co.alternate, b)
        return
      }
      case "ArrowFunctionExpression": {
        const a = e as ArrowFunctionExpression
        const inner = new Set(b)
        for (const p of a.params) {
          if (p.type === "Identifier") inner.add((p as Identifier).value)
        }
        if (a.body.type !== "BlockStatement") walk(a.body as Expression, inner)
        return
      }
      case "ArrayExpression": {
        for (const el of (e as ArrayExpression).elements) {
          if (el !== undefined) walk(el.expression, b)
        }
        return
      }
      case "ObjectExpression": {
        for (const p of (e as ObjectExpression).properties) {
          if (p.type === "SpreadElement") walk(p.arguments, b)
          else if (p.type === "Identifier") walk(p as unknown as Identifier, b)
          else if (p.type === "KeyValueProperty") {
            walk((p as { value: Expression }).value, b)
          }
        }
        return
      }
      case "TemplateLiteral": {
        for (const x of (e as TemplateLiteral).expressions) walk(x, b)
        return
      }
      case "ParenthesisExpression": {
        walk((e as { expression: Expression }).expression, b)
        return
      }
      default:
        return
    }
  }
  walk(expr, new Set(bound))
  return out
}
