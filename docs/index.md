---
layout: home
hero:
  name: Tachys
  text: High-Performance Virtual DOM
  tagline: A lightweight virtual DOM library optimized for V8, with a React-compatible API.
  actions:
    - theme: brand
      text: Get Started
      link: /guide/getting-started
    - theme: alt
      text: API Reference
      link: /api/rendering
features:
  - title: Tiny Footprint
    details: ~11 KB gzipped core with object pooling, bitwise flags, and zero-allocation hot paths. Lean entry points (sync, sync-core) drop further.
  - title: React-Compatible API
    details: Full hooks API (useState, useEffect, useMemo, use, useSyncExternalStore, etc.), memo, forwardRef, Suspense, lazy, ErrorBoundary, and React 19 use() hook.
  - title: Server-Side Rendering
    details: renderToString, renderToStringAsync, renderToReadableStream with streaming Suspense, and Suspense-aware hydration with selective hydration.
  - title: Concurrent Scheduler
    details: Three-lane scheduler (Sync, Default, Transition) with fiber-style mid-render yield, two-phase commit for Transitions, and abandonment rollback.
---
