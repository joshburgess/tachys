/**
 * DevTools page script.
 *
 * Creates the "Phasm" panel in Chrome DevTools.
 * This runs when the DevTools are opened for a page.
 */

// Check if the page has Phasm before creating the panel
chrome.devtools.inspectedWindow.eval(
  "!!(window.__PHASM_DEVTOOLS_HOOK__)",
  (hasPhasm) => {
    if (hasPhasm) {
      createPanel()
    } else {
      // Listen for it to appear (the page may not have loaded yet)
      const check = setInterval(() => {
        chrome.devtools.inspectedWindow.eval(
          "!!(window.__PHASM_DEVTOOLS_HOOK__)",
          (found) => {
            if (found) {
              clearInterval(check)
              createPanel()
            }
          },
        )
      }, 1000)

      // Stop checking after 30 seconds
      setTimeout(() => clearInterval(check), 30000)
    }
  },
)

function createPanel() {
  chrome.devtools.panels.create("Phasm", "", "panel.html")
}
