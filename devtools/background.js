/**
 * Background service worker.
 *
 * Relays messages between the content script (page context) and the
 * DevTools panel. Uses chrome.runtime port-based messaging.
 */

const devtoolsPorts = new Map()

chrome.runtime.onConnect.addListener((port) => {
  if (port.name === "tachys-devtools-panel") {
    const tabId = port.sender?.tab?.id ?? port.name

    port.onMessage.addListener((msg) => {
      if (msg.type === "init" && msg.tabId) {
        devtoolsPorts.set(msg.tabId, port)
        port.onDisconnect.addListener(() => {
          devtoolsPorts.delete(msg.tabId)
        })
      }
    })
  }

  if (port.name === "tachys-devtools-content") {
    const tabId = port.sender?.tab?.id
    if (!tabId) return

    port.onMessage.addListener((msg) => {
      const panel = devtoolsPorts.get(tabId)
      if (panel) {
        panel.postMessage(msg)
      }
    })
  }
})
