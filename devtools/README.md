# Tachys DevTools

Chrome DevTools extension for inspecting Tachys component trees, hooks state, and re-render highlighting.

## Features

- Component tree visualization with expandable/collapsible nodes
- Props inspection for elements and components
- Hooks state viewer (useState, useMemo, useRef values)
- Effects inspector (deps count, cleanup status, pending state)
- DOM element highlighting on hover
- Search/filter components by name
- Dark and light theme support (follows system preference)
- Re-render flash animation

## Installation (Development)

1. Open Chrome and go to `chrome://extensions`
2. Enable "Developer mode" (toggle in top right)
3. Click "Load unpacked"
4. Select the `devtools/` directory from the Tachys repo

## Usage

1. Open Chrome DevTools (F12 or Cmd+Opt+I)
2. Navigate to a page using a **development build** of Tachys
3. A "Tachys" tab will appear in the DevTools panel
4. Click on components in the tree to inspect their props, hooks, and effects

## Requirements

- The page must use a development build of Tachys (the devtools hook is stripped from production builds via the `__DEV__` guard)
- Chrome 88+ (Manifest V3 support)

## Architecture

- `manifest.json` - Chrome extension manifest (MV3)
- `devtools.html/js` - Creates the DevTools panel when Tachys is detected
- `panel.html/js` - The panel UI (component tree + detail inspector)
- `content-script.js` - Bridge between page context and extension
- `background.js` - Service worker for message routing

The library side lives in `src/devtools-hook.ts` and installs `window.__TACHYS_DEVTOOLS_HOOK__` with methods for tree inspection, render subscriptions, and DOM highlighting.
