/**
 * Content script - bridge between the page and the DevTools extension.
 *
 * Injects a small script into the page that listens for the Phasm
 * devtools hook and relays tree data back through window.postMessage.
 */

// Listen for messages from the injected page script
window.addEventListener("message", (event) => {
  if (event.source !== window) return
  if (!event.data || event.data.source !== "phasm-devtools-page") return

  // Forward to background
  try {
    chrome.runtime.sendMessage(event.data)
  } catch {
    // Extension context may be invalidated
  }
})

// Listen for messages from the DevTools panel (via background)
chrome.runtime.onMessage.addListener((msg) => {
  if (msg.source === "phasm-devtools-panel") {
    window.postMessage(msg, "*")
  }
})

// Inject the page-level detector script
const script = document.createElement("script")
script.textContent = `(${pageScript.toString()})()`
;(document.head || document.documentElement).appendChild(script)
script.remove()

function pageScript() {
  let hook = null
  let unsubscribe = null

  function connect() {
    hook = window.__PHASM_DEVTOOLS_HOOK__
    if (!hook) return false

    // Notify extension that Phasm is detected
    window.postMessage(
      { source: "phasm-devtools-page", type: "phasm-detected", version: hook.version },
      "*",
    )

    // Subscribe to render events
    unsubscribe = hook.onRender((container, tree) => {
      window.postMessage(
        {
          source: "phasm-devtools-page",
          type: "phasm-render",
          containerId: container.id || container.tagName,
          tree,
        },
        "*",
      )
    })

    return true
  }

  // Try immediately
  if (!connect()) {
    // Wait for the hook to become available
    window.addEventListener("__PHASM_DEVTOOLS_HOOK_READY__", () => connect(), { once: true })
  }

  // Handle commands from the DevTools panel
  window.addEventListener("message", (event) => {
    if (event.source !== window) return
    if (!event.data || event.data.source !== "phasm-devtools-panel") return

    if (!hook) return

    if (event.data.type === "request-tree") {
      for (const root of hook.roots) {
        const tree = hook.inspectRoot(root)
        if (tree) {
          window.postMessage(
            {
              source: "phasm-devtools-page",
              type: "phasm-render",
              containerId: root.id || root.tagName,
              tree,
            },
            "*",
          )
        }
      }
    }

    if (event.data.type === "highlight") {
      if (event.data.selector) {
        const el = document.querySelector(event.data.selector)
        hook.highlight(el)
      } else {
        hook.highlight(null)
      }
    }

    if (event.data.type === "get-events") {
      if (event.data.selector) {
        const el = document.querySelector(event.data.selector)
        if (el) {
          const events = hook.getEvents(el)
          window.postMessage(
            { source: "phasm-devtools-page", type: "phasm-events", events },
            "*",
          )
        }
      }
    }
  })
}
