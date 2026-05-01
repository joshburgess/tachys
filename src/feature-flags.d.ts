/**
 * Build-time feature flags. Replaced by `@rollup/plugin-replace` at bundle
 * time so dead branches inside the runtime collapse to literal `false` and
 * tree-shake away. Default to `true` for source / typecheck / vitest, and
 * for the full `tachys` and `tachys/sync` builds.
 *
 * The `sync-core` build sets all four to `false`, eliminating dispatch and
 * imports for Suspense, ErrorBoundary, Portal, and Context. The shared
 * runtime (component.ts, render.ts, etc.) handles all four shapes; users
 * who only need the lean compiled-template runtime get a smaller bundle.
 */

declare const __SUPPORTS_ERROR_BOUNDARY__: boolean
declare const __SUPPORTS_SUSPENSE__: boolean
declare const __SUPPORTS_PORTAL__: boolean
declare const __SUPPORTS_CONTEXT__: boolean
