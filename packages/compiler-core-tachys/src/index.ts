/**
 * Shared compiler core for Tachys JSX compilers.
 *
 * Exports:
 *   - The portable `CompiledIR` type and its slot variants (target of any
 *     frontend — Babel, SWC, Oxc, Rust).
 *   - The typed JS emission DSL (`js-dsl.ts`) used to build source strings
 *     with operator-precedence-aware auto-parenthesization.
 *   - `emitComponent`, the string emitter that turns a `CompiledIR` into
 *     the `markCompiled(mount, patch, compare)` call source plus any
 *     module-scope helper declarations a caller should hoist.
 *
 * No dependency on any particular AST library.
 */

export type {
  CompiledIR,
  IRAltSlot,
  IRAttrSlot,
  IRChildPropEntry,
  IRComponentSlot,
  IRCompositeExpr,
  IRCondSlot,
  IREventSlot,
  IRListSlot,
  IRSlot,
  IRTextSlot,
} from "./ir"

export * as dsl from "./js-dsl"
export type { JsExpr, JsStmt } from "./js-dsl"
export { PREC } from "./js-dsl"

export { emitComponent } from "./emit"
export type { EmitInput, EmitResult, ListHelpers } from "./emit"
