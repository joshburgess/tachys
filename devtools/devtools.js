/**
 * DevTools page script.
 *
 * Creates the "Tachys" panel in Chrome DevTools.
 * This runs when the DevTools are opened for a page.
 */

// Check if the page has Tachys before creating the panel
chrome.devtools.inspectedWindow.eval(
  "!!(window.__TACHYS_DEVTOOLS_HOOK__)",
  (hasTachys) => {
    if (hasTachys) {
      createPanel()
    } else {
      // Listen for it to appear (the page may not have loaded yet)
      const check = setInterval(() => {
        chrome.devtools.inspectedWindow.eval(
          "!!(window.__TACHYS_DEVTOOLS_HOOK__)",
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
  chrome.devtools.panels.create("Tachys", "", "panel.html")
}
