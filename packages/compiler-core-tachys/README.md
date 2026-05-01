# compiler-core-tachys

Shared compiler core for the Tachys JSX compilers. Defines a portable `CompiledIR` and a string emitter that turns it into `markCompiled` + `_template` source, with no dependency on any particular AST library.

This package is the runtime dependency of both [`babel-plugin-tachys`](https://github.com/joshburgess/tachys/tree/main/packages/babel-plugin-tachys) and [`swc-plugin-tachys`](https://github.com/joshburgess/tachys/tree/main/packages/swc-plugin-tachys). Most users should depend on one of those rather than on this package directly. It's published so that an alternative frontend (Oxc, a Rust transformer, etc.) can target the same IR and reuse the emitter.

## What's in here

- `CompiledIR` and slot variant types: the portable target a frontend produces.
- `emitComponent(ir, opts)`: the string emitter. Returns a `markCompiled(...)` call source plus any module-scope helper declarations a caller should hoist.
- `dsl` (`JsExpr`, `JsStmt`, `PREC`): a typed JS emission helper with operator-precedence-aware auto-parenthesization, used internally by the emitter.

## Install

```bash
pnpm add compiler-core-tachys
```

## Usage

```ts
import { emitComponent, type CompiledIR } from "compiler-core-tachys"

const ir: CompiledIR = /* produced by your frontend */
const { callSrc, hoistedHelpers } = emitComponent(ir, {
  tplId: "_tpl$MyComp_0",
  listHelpers: new Map(),
  markCompiledName: "markCompiled",
})
```

The frontend is then responsible for splicing `callSrc` into the source where the original component declaration was, and prepending the template declaration plus any `hoistedHelpers`.

## License

Dual-licensed under MIT or Apache-2.0, at your option.
