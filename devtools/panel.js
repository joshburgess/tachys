/**
 * Tachys DevTools Panel
 *
 * Renders the component tree, handles selection, and displays
 * props/hooks/effects for the selected node.
 */

// --- State ---
let currentTree = null
let selectedNodeId = null
const expandedNodes = new Set()
let searchFilter = ""
const allNodes = new Map() // id -> node for fast lookup

// --- DOM refs ---
const emptyState = document.getElementById("empty-state")
const mainContainer = document.getElementById("main-container")
const treePane = document.getElementById("tree-pane")
const detailPane = document.getElementById("detail-pane")
const searchInput = document.getElementById("search")
const btnRefresh = document.getElementById("btn-refresh")
const btnCollapse = document.getElementById("btn-collapse")

// --- Communication with page ---

function sendToPage(msg) {
  chrome.devtools.inspectedWindow.eval(
    `window.postMessage(${JSON.stringify({ ...msg, source: "tachys-devtools-panel" })}, "*")`,
  )
}

function requestTree() {
  sendToPage({ type: "request-tree" })
}

// Listen for messages from the page (via background relay or eval polling)
function pollForUpdates() {
  chrome.devtools.inspectedWindow.eval(
    `(function() {
      var hook = window.__TACHYS_DEVTOOLS_HOOK__;
      if (!hook) return null;
      var result = [];
      for (var root of hook.roots) {
        var tree = hook.inspectRoot(root);
        if (tree) result.push({ containerId: root.id || root.tagName, tree: tree });
      }
      return result.length > 0 ? result : null;
    })()`,
    (results) => {
      if (results && results.length > 0) {
        showMainUI()
        // Use the first root for now
        handleTreeUpdate(results[0].tree)
      }
    },
  )
}

// Poll every 1.5 seconds for tree updates
const pollInterval = setInterval(pollForUpdates, 1500)

// Initial check
pollForUpdates()

// --- UI State ---

function showMainUI() {
  emptyState.style.display = "none"
  mainContainer.style.display = "flex"
}

// --- Tree indexing ---

function indexTree(node) {
  allNodes.set(node.id, node)
  for (const child of node.children) {
    indexTree(child)
  }
}

// --- Tree rendering ---

function handleTreeUpdate(tree) {
  const prevTree = currentTree
  currentTree = tree
  allNodes.clear()
  indexTree(tree)

  // Auto-expand top-level nodes on first load
  if (!prevTree) {
    expandedNodes.add(tree.id)
    for (const child of tree.children) {
      expandedNodes.add(child.id)
    }
  }

  renderTree()

  // Re-select if still valid
  if (selectedNodeId && allNodes.has(selectedNodeId)) {
    renderDetail(allNodes.get(selectedNodeId))
  }
}

function renderTree() {
  treePane.innerHTML = ""
  if (!currentTree) return
  const el = renderTreeNode(currentTree, 0)
  treePane.appendChild(el)
}

function renderTreeNode(node, depth) {
  const div = document.createElement("div")
  div.className = "tree-node"
  if (node.id === selectedNodeId) div.classList.add("selected")
  div.dataset.nodeId = node.id

  const hasChildren = node.children.length > 0
  const isExpanded = expandedNodes.has(node.id)

  // Filter check
  if (searchFilter && !nodeMatchesFilter(node)) {
    // Still render if a descendant matches
    if (!descendantMatchesFilter(node)) {
      div.style.display = "none"
      return div
    }
  }

  const content = document.createElement("div")
  content.className = "tree-node-content"
  content.style.paddingLeft = `${depth * 16 + 8}px`

  // Toggle arrow
  const toggle = document.createElement("span")
  toggle.className = "toggle"
  if (hasChildren) {
    toggle.textContent = isExpanded ? "\u25BC" : "\u25B6"
    toggle.addEventListener("click", (e) => {
      e.stopPropagation()
      if (expandedNodes.has(node.id)) {
        expandedNodes.delete(node.id)
      } else {
        expandedNodes.add(node.id)
      }
      renderTree()
    })
  }
  content.appendChild(toggle)

  // Tag name
  const tag = document.createElement("span")
  tag.className = `tag-${node.type}`

  if (node.type === "component") {
    tag.textContent = `<${node.name}>`
  } else if (node.type === "element") {
    tag.textContent = `<${node.name}>`
  } else if (node.type === "text") {
    const textContent = node.props?.text || ""
    tag.textContent =
      typeof textContent === "string" && textContent.length > 40
        ? `"${textContent.slice(0, 40)}..."`
        : `"${textContent}"`
  } else if (node.type === "fragment") {
    tag.textContent = node.name
  } else {
    tag.textContent = node.name
  }
  content.appendChild(tag)

  // Key badge
  if (node.key !== null) {
    const keyBadge = document.createElement("span")
    keyBadge.className = "node-key"
    keyBadge.textContent = `key=${JSON.stringify(node.key)}`
    content.appendChild(keyBadge)
  }

  // Hooks/effects count badges
  if (node.hooks && node.hooks.length > 0) {
    const badge = document.createElement("span")
    badge.className = "badge badge-hooks"
    badge.textContent = `${node.hooks.length} hooks`
    content.appendChild(badge)
  }
  if (node.effects && node.effects.length > 0) {
    const badge = document.createElement("span")
    badge.className = "badge badge-effects"
    badge.textContent = `${node.effects.length} effects`
    content.appendChild(badge)
  }

  content.addEventListener("click", () => {
    selectedNodeId = node.id
    renderTree()
    renderDetail(node)

    // Highlight the DOM element
    if (node.domTagName) {
      // Use a simple approach: eval to find and highlight
      chrome.devtools.inspectedWindow.eval(
        `(function() {
          var hook = window.__TACHYS_DEVTOOLS_HOOK__;
          if (hook) hook.highlight(null);
        })()`,
      )
    }
  })

  div.appendChild(content)

  // Children
  if (hasChildren) {
    const childContainer = document.createElement("div")
    childContainer.className = `tree-children${isExpanded ? "" : " collapsed"}`
    for (const child of node.children) {
      childContainer.appendChild(renderTreeNode(child, depth + 1))
    }
    div.appendChild(childContainer)
  }

  return div
}

function nodeMatchesFilter(node) {
  if (!searchFilter) return true
  return node.name.toLowerCase().includes(searchFilter.toLowerCase())
}

function descendantMatchesFilter(node) {
  if (nodeMatchesFilter(node)) return true
  return node.children.some((c) => descendantMatchesFilter(c))
}

// --- Detail pane ---

function renderDetail(node) {
  detailPane.innerHTML = ""

  // Header
  const header = document.createElement("div")
  header.className = "detail-section"
  const h2 = document.createElement("h3")
  h2.textContent = node.type === "component" ? node.name : `<${node.name}>`
  h2.style.fontSize = "14px"
  h2.style.textTransform = "none"
  h2.style.color = `var(--${node.type === "component" ? "component" : "element"})`
  header.appendChild(h2)

  // Type info
  const typeRow = document.createElement("div")
  typeRow.className = "detail-row"
  typeRow.innerHTML = `<span class="detail-key">Type</span><span class="detail-value">${node.type}</span>`
  header.appendChild(typeRow)

  if (node.key !== null) {
    const keyRow = document.createElement("div")
    keyRow.className = "detail-row"
    keyRow.innerHTML = `<span class="detail-key">Key</span><span class="detail-value">${escapeHtml(JSON.stringify(node.key))}</span>`
    header.appendChild(keyRow)
  }

  if (node.domTagName) {
    const domRow = document.createElement("div")
    domRow.className = "detail-row"
    domRow.innerHTML = `<span class="detail-key">DOM</span><span class="detail-value">&lt;${escapeHtml(node.domTagName)}&gt;</span>`
    header.appendChild(domRow)
  }

  detailPane.appendChild(header)

  // Props
  if (node.props && Object.keys(node.props).length > 0) {
    const propsSection = createSection("Props")
    for (const [key, value] of Object.entries(node.props)) {
      if (key === "children") continue
      propsSection.appendChild(createDetailRow(key, value))
    }
    detailPane.appendChild(propsSection)
  }

  // Hooks
  if (node.hooks && node.hooks.length > 0) {
    const hooksSection = createSection("Hooks State")
    for (const hook of node.hooks) {
      hooksSection.appendChild(createDetailRow(`[${hook.index}]`, hook.value))
    }
    detailPane.appendChild(hooksSection)
  }

  // Effects
  if (node.effects && node.effects.length > 0) {
    const effectsSection = createSection("Effects")
    for (const effect of node.effects) {
      const info = []
      if (effect.hasDeps) info.push(`deps[${effect.depCount}]`)
      else info.push("no deps")
      if (effect.hasCleanup) info.push("has cleanup")
      if (effect.pendingRun) info.push("pending")
      effectsSection.appendChild(createDetailRow(`[${effect.index}]`, info.join(", ")))
    }
    detailPane.appendChild(effectsSection)
  }
}

function createSection(title) {
  const section = document.createElement("div")
  section.className = "detail-section"
  const h3 = document.createElement("h3")
  h3.textContent = title
  section.appendChild(h3)
  return section
}

function createDetailRow(key, value) {
  const row = document.createElement("div")
  row.className = "detail-row"

  const keyEl = document.createElement("span")
  keyEl.className = "detail-key"
  keyEl.textContent = key

  const valEl = document.createElement("span")
  valEl.className = "detail-value"

  if (value === null || value === undefined) {
    valEl.classList.add("null")
    valEl.textContent = String(value)
  } else if (typeof value === "string" && value.startsWith("[Function:")) {
    valEl.classList.add("fn")
    valEl.textContent = value
  } else if (typeof value === "object") {
    valEl.textContent = JSON.stringify(value, null, 2)
    valEl.style.whiteSpace = "pre-wrap"
    valEl.style.maxHeight = "120px"
    valEl.style.overflow = "auto"
  } else {
    valEl.textContent = JSON.stringify(value)
  }

  row.appendChild(keyEl)
  row.appendChild(valEl)
  return row
}

function escapeHtml(str) {
  return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
}

// --- Event handlers ---

btnRefresh.addEventListener("click", () => {
  pollForUpdates()
})

btnCollapse.addEventListener("click", () => {
  expandedNodes.clear()
  if (currentTree) expandedNodes.add(currentTree.id)
  renderTree()
})

searchInput.addEventListener("input", (e) => {
  searchFilter = e.target.value
  // Auto-expand all when searching
  if (searchFilter) {
    allNodes.forEach((_, id) => expandedNodes.add(id))
  }
  renderTree()
})

// Cleanup on panel close
window.addEventListener("unload", () => {
  clearInterval(pollInterval)
  // Remove highlight
  chrome.devtools.inspectedWindow.eval(
    `(function() {
      var hook = window.__TACHYS_DEVTOOLS_HOOK__;
      if (hook) hook.highlight(null);
    })()`,
  )
})
