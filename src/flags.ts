/**
 * Bitwise VNode type and child flags.
 *
 * All values are SMI-safe (< 2^30) to stay on V8's optimized integer path.
 * Using plain constants instead of const enum for isolatedModules compatibility.
 *
 * VNodeFlag and ChildFlag are branded (opaque) number types -- the TypeScript
 * equivalent of Haskell's newtype or Rust's newtype pattern. This prevents
 * accidentally passing a ChildFlag where a VNodeFlag is expected (or vice
 * versa), even though both are plain numbers at runtime.
 */

// --- Branded (opaque) flag types ---

declare const __vnodeFlag: unique symbol
declare const __childFlag: unique symbol

/** Branded number type for VNode type flags. Opaque to prevent mixing with ChildFlag. */
export type VNodeFlag = number & { readonly [__vnodeFlag]: true }

/** Branded number type for child shape flags. Opaque to prevent mixing with VNodeFlag. */
export type ChildFlag = number & { readonly [__childFlag]: true }

// --- VNode type flags ---

export const VNodeFlags: {
  readonly Text: VNodeFlag
  readonly Element: VNodeFlag
  readonly Component: VNodeFlag
  readonly Fragment: VNodeFlag
  readonly Svg: VNodeFlag
  readonly Void: VNodeFlag
} = {
  Text: 1 as VNodeFlag,
  Element: (1 << 1) as VNodeFlag,
  Component: (1 << 2) as VNodeFlag,
  Fragment: (1 << 3) as VNodeFlag,
  Svg: (1 << 8) as VNodeFlag,
  Void: (1 << 9) as VNodeFlag,
}

// --- Child shape flags ---

export const ChildFlags: {
  readonly HasKeyedChildren: ChildFlag
  readonly HasNonKeyedChildren: ChildFlag
  readonly HasTextChildren: ChildFlag
  readonly HasSingleChild: ChildFlag
  readonly NoChildren: ChildFlag
} = {
  HasKeyedChildren: (1 << 4) as ChildFlag,
  HasNonKeyedChildren: (1 << 5) as ChildFlag,
  HasTextChildren: (1 << 6) as ChildFlag,
  HasSingleChild: (1 << 7) as ChildFlag,
  NoChildren: 0 as ChildFlag,
}

// --- Component meta flags ---
//
// Bitmask set on special component function types (ErrorBoundary, Suspense,
// createPortal, createContext Provider). Replaces four separate `"_xxx" in type`
// prototype-chain lookups per mount/patch with a single property read + bit
// test. Components without any meta tag read 0 and skip all four branches.

export const ComponentMeta: {
  readonly None: number
  readonly ErrorBoundary: number
  readonly Suspense: number
  readonly Portal: number
  readonly Provider: number
  readonly Compiled: number
} = {
  None: 0,
  ErrorBoundary: 1,
  Suspense: 1 << 1,
  Portal: 1 << 2,
  Provider: 1 << 3,
  Compiled: 1 << 4,
}
