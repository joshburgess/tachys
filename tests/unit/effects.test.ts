import { beforeEach, describe, expect, it, vi } from "vitest"
import {
  beginCollecting,
  commitEffects,
  discardEffects,
  domAppendChild,
  domInsertBefore,
  domRemoveChild,
  domSetInnerHTML,
  domSetNodeValue,
  domSetTextContent,
  isCollecting,
  pauseCollecting,
  pendingEffectCount,
  pushThunk,
  resumeCollecting,
} from "../../src/effects"

// ---------------------------------------------------------------------------
// Reset state between tests
// ---------------------------------------------------------------------------

beforeEach(() => {
  if (isCollecting()) discardEffects()
})

// ---------------------------------------------------------------------------
// Collection lifecycle
// ---------------------------------------------------------------------------

describe("collection lifecycle", () => {
  it("isCollecting returns false by default", () => {
    expect(isCollecting()).toBe(false)
  })

  it("beginCollecting sets collecting to true", () => {
    beginCollecting()
    expect(isCollecting()).toBe(true)
    discardEffects()
  })

  it("commitEffects sets collecting to false", () => {
    beginCollecting()
    commitEffects()
    expect(isCollecting()).toBe(false)
  })

  it("discardEffects sets collecting to false", () => {
    beginCollecting()
    discardEffects()
    expect(isCollecting()).toBe(false)
  })

  it("beginCollecting clears any previously queued effects", () => {
    beginCollecting()
    const parent = document.createElement("div")
    const child = document.createElement("span")
    domAppendChild(parent, child)
    expect(pendingEffectCount()).toBe(1)

    beginCollecting()
    expect(pendingEffectCount()).toBe(0)
    discardEffects()
  })

  it("commitEffects clears the queue", () => {
    beginCollecting()
    const parent = document.createElement("div")
    const child = document.createElement("span")
    domAppendChild(parent, child)
    expect(pendingEffectCount()).toBe(1)

    commitEffects()
    expect(pendingEffectCount()).toBe(0)
  })
})

// ---------------------------------------------------------------------------
// Pause / resume
// ---------------------------------------------------------------------------

describe("pause / resume collecting", () => {
  it("pauseCollecting stops queuing without clearing effects", () => {
    beginCollecting()
    const parent = document.createElement("div")
    const child1 = document.createElement("span")
    const child2 = document.createElement("span")

    domAppendChild(parent, child1)
    expect(pendingEffectCount()).toBe(1)

    pauseCollecting()
    expect(isCollecting()).toBe(false)
    // Direct execution while paused
    domAppendChild(parent, child2)
    expect(parent.childNodes.length).toBe(1) // child2 appended directly
    expect(pendingEffectCount()).toBe(1) // queue unchanged

    resumeCollecting()
    expect(isCollecting()).toBe(true)
    discardEffects()
  })

  it("resumeCollecting preserves existing queue", () => {
    beginCollecting()
    const parent = document.createElement("div")
    const child = document.createElement("span")
    domAppendChild(parent, child)
    expect(pendingEffectCount()).toBe(1)

    pauseCollecting()
    resumeCollecting()
    expect(pendingEffectCount()).toBe(1)
    discardEffects()
  })
})

// ---------------------------------------------------------------------------
// domAppendChild
// ---------------------------------------------------------------------------

describe("domAppendChild", () => {
  it("executes directly when not collecting", () => {
    const parent = document.createElement("div")
    const child = document.createElement("span")

    domAppendChild(parent, child)
    expect(parent.childNodes.length).toBe(1)
    expect(parent.firstChild).toBe(child)
  })

  it("queues when collecting and applies on commit", () => {
    const parent = document.createElement("div")
    const child = document.createElement("span")

    beginCollecting()
    domAppendChild(parent, child)

    // Not yet in parent
    expect(parent.childNodes.length).toBe(0)
    expect(pendingEffectCount()).toBe(1)

    commitEffects()

    // Now in parent
    expect(parent.childNodes.length).toBe(1)
    expect(parent.firstChild).toBe(child)
  })

  it("discardEffects drops the append without applying", () => {
    const parent = document.createElement("div")
    const child = document.createElement("span")

    beginCollecting()
    domAppendChild(parent, child)
    discardEffects()

    expect(parent.childNodes.length).toBe(0)
  })
})

// ---------------------------------------------------------------------------
// domInsertBefore
// ---------------------------------------------------------------------------

describe("domInsertBefore", () => {
  it("executes directly when not collecting", () => {
    const parent = document.createElement("div")
    const existing = document.createElement("span")
    const child = document.createElement("em")
    parent.appendChild(existing)

    domInsertBefore(parent, child, existing)
    expect(parent.firstChild).toBe(child)
    expect(parent.lastChild).toBe(existing)
  })

  it("queues when collecting and applies on commit", () => {
    const parent = document.createElement("div")
    const existing = document.createElement("span")
    const child = document.createElement("em")
    parent.appendChild(existing)

    beginCollecting()
    domInsertBefore(parent, child, existing)

    expect(parent.childNodes.length).toBe(1) // only existing
    expect(pendingEffectCount()).toBe(1)

    commitEffects()

    expect(parent.childNodes.length).toBe(2)
    expect(parent.firstChild).toBe(child)
  })

  it("handles null ref (appends to end)", () => {
    const parent = document.createElement("div")
    const existing = document.createElement("span")
    const child = document.createElement("em")
    parent.appendChild(existing)

    beginCollecting()
    domInsertBefore(parent, child, null)
    commitEffects()

    expect(parent.lastChild).toBe(child)
  })
})

// ---------------------------------------------------------------------------
// domRemoveChild
// ---------------------------------------------------------------------------

describe("domRemoveChild", () => {
  it("executes directly when not collecting", () => {
    const parent = document.createElement("div")
    const child = document.createElement("span")
    parent.appendChild(child)

    domRemoveChild(parent, child)
    expect(parent.childNodes.length).toBe(0)
  })

  it("queues when collecting and applies on commit", () => {
    const parent = document.createElement("div")
    const child = document.createElement("span")
    parent.appendChild(child)

    beginCollecting()
    domRemoveChild(parent, child)

    // Still in parent
    expect(parent.childNodes.length).toBe(1)
    expect(pendingEffectCount()).toBe(1)

    commitEffects()

    expect(parent.childNodes.length).toBe(0)
  })

  it("discardEffects keeps the child in the DOM", () => {
    const parent = document.createElement("div")
    const child = document.createElement("span")
    parent.appendChild(child)

    beginCollecting()
    domRemoveChild(parent, child)
    discardEffects()

    expect(parent.childNodes.length).toBe(1)
  })
})

// ---------------------------------------------------------------------------
// Effect ordering (FIFO replay)
// ---------------------------------------------------------------------------

describe("effect ordering", () => {
  it("replays mixed effects in FIFO order", () => {
    const parent = document.createElement("div")
    const a = document.createElement("span")
    const b = document.createElement("span")
    const c = document.createElement("span")

    a.textContent = "A"
    b.textContent = "B"
    c.textContent = "C"

    // Start with [B] in parent
    parent.appendChild(b)

    beginCollecting()
    domAppendChild(parent, c) // queue: append C -> [B, C]
    domInsertBefore(parent, a, b) // queue: insert A before B -> [A, B, C]
    commitEffects()

    expect(parent.childNodes.length).toBe(3)
    expect((parent.childNodes[0] as HTMLElement).textContent).toBe("A")
    expect((parent.childNodes[1] as HTMLElement).textContent).toBe("B")
    expect((parent.childNodes[2] as HTMLElement).textContent).toBe("C")
  })

  it("handles mount-then-move pattern (mountBefore equivalent)", () => {
    const parent = document.createElement("div")
    const existing = document.createElement("span")
    existing.textContent = "existing"
    parent.appendChild(existing)

    const newNode = document.createElement("em")
    newNode.textContent = "new"

    beginCollecting()
    // Simulates mountInternal (append) followed by moveVNodeDOM (insertBefore)
    domAppendChild(parent, newNode)
    domInsertBefore(parent, newNode, existing)
    commitEffects()

    expect(parent.childNodes.length).toBe(2)
    expect(parent.firstChild).toBe(newNode)
    expect(parent.lastChild).toBe(existing)
  })

  it("handles remove-then-insert pattern (replaceVNode equivalent)", () => {
    const parent = document.createElement("div")
    const oldNode = document.createElement("span")
    const newNode = document.createElement("em")
    parent.appendChild(oldNode)

    beginCollecting()
    domAppendChild(parent, newNode)
    domInsertBefore(parent, newNode, oldNode)
    domRemoveChild(parent, oldNode)
    commitEffects()

    expect(parent.childNodes.length).toBe(1)
    expect(parent.firstChild).toBe(newNode)
  })

  it("handles keyed diff reversal pattern", () => {
    const parent = document.createElement("div")
    const a = document.createElement("span")
    const b = document.createElement("span")
    const c = document.createElement("span")
    const d = document.createElement("span")
    a.id = "a"
    b.id = "b"
    c.id = "c"
    d.id = "d"

    // Start with [A, B, C, D]
    parent.appendChild(a)
    parent.appendChild(b)
    parent.appendChild(c)
    parent.appendChild(d)

    // Reverse to [D, C, B, A] via insertBefore effects
    beginCollecting()
    domInsertBefore(parent, b, a) // [B, A, C, D]
    domInsertBefore(parent, c, b) // [C, B, A, D]
    domInsertBefore(parent, d, c) // [D, C, B, A]
    commitEffects()

    const ids = Array.from(parent.childNodes).map((n) => (n as HTMLElement).id)
    expect(ids).toEqual(["d", "c", "b", "a"])
  })

  it("handles nested mount (children into detached parent, then parent into live DOM)", () => {
    const liveRoot = document.createElement("div")
    const newParent = document.createElement("ul")
    const child1 = document.createElement("li")
    const child2 = document.createElement("li")
    child1.textContent = "1"
    child2.textContent = "2"

    beginCollecting()
    // Children appended to detached newParent
    domAppendChild(newParent, child1)
    domAppendChild(newParent, child2)
    // newParent appended to live root
    domAppendChild(liveRoot, newParent)
    commitEffects()

    expect(liveRoot.childNodes.length).toBe(1)
    const ul = liveRoot.firstChild as HTMLElement
    expect(ul.tagName).toBe("UL")
    expect(ul.childNodes.length).toBe(2)
    expect((ul.childNodes[0] as HTMLElement).textContent).toBe("1")
    expect((ul.childNodes[1] as HTMLElement).textContent).toBe("2")
  })
})

// ---------------------------------------------------------------------------
// Pause/resume with interleaved operations
// ---------------------------------------------------------------------------

describe("pause/resume with interleaved urgent work", () => {
  it("urgent work during pause executes directly while queue is preserved", () => {
    const parent = document.createElement("div")
    const transitionChild = document.createElement("span")
    const urgentChild = document.createElement("em")
    transitionChild.textContent = "transition"
    urgentChild.textContent = "urgent"

    beginCollecting()
    // Transition work
    domAppendChild(parent, transitionChild)
    expect(parent.childNodes.length).toBe(0) // deferred

    // Urgent work arrives
    pauseCollecting()
    domAppendChild(parent, urgentChild)
    expect(parent.childNodes.length).toBe(1) // urgent executed directly
    expect(parent.firstChild).toBe(urgentChild)

    // Resume transition
    resumeCollecting()
    commitEffects()

    // Both children in DOM
    expect(parent.childNodes.length).toBe(2)
    expect(parent.lastChild).toBe(transitionChild)
  })
})

// ---------------------------------------------------------------------------
// Thunk effects (Phase 2: property deferral)
// ---------------------------------------------------------------------------

describe("pushThunk", () => {
  it("queues a closure that executes on commit", () => {
    const spy = vi.fn()

    beginCollecting()
    pushThunk(spy)
    expect(spy).not.toHaveBeenCalled()
    expect(pendingEffectCount()).toBe(1)

    commitEffects()
    expect(spy).toHaveBeenCalledTimes(1)
  })

  it("discardEffects drops thunks without executing", () => {
    const spy = vi.fn()

    beginCollecting()
    pushThunk(spy)
    discardEffects()

    expect(spy).not.toHaveBeenCalled()
  })

  it("thunks execute in FIFO order interleaved with structural effects", () => {
    const order: string[] = []
    const parent = document.createElement("div")
    const child = document.createElement("span")

    beginCollecting()
    pushThunk(() => order.push("thunk-1"))
    domAppendChild(parent, child)
    pushThunk(() => order.push("thunk-2"))
    commitEffects()

    expect(order).toEqual(["thunk-1", "thunk-2"])
    expect(parent.firstChild).toBe(child)
  })
})

// ---------------------------------------------------------------------------
// domSetTextContent
// ---------------------------------------------------------------------------

describe("domSetTextContent", () => {
  it("executes directly when not collecting", () => {
    const div = document.createElement("div")
    domSetTextContent(div, "hello")
    expect(div.textContent).toBe("hello")
  })

  it("queues when collecting and applies on commit", () => {
    const div = document.createElement("div")
    div.textContent = "old"

    beginCollecting()
    domSetTextContent(div, "new")
    expect(div.textContent).toBe("old") // unchanged
    expect(pendingEffectCount()).toBe(1)

    commitEffects()
    expect(div.textContent).toBe("new")
  })

  it("discardEffects preserves original content", () => {
    const div = document.createElement("div")
    div.textContent = "keep me"

    beginCollecting()
    domSetTextContent(div, "replace me")
    discardEffects()

    expect(div.textContent).toBe("keep me")
  })
})

// ---------------------------------------------------------------------------
// domSetNodeValue
// ---------------------------------------------------------------------------

describe("domSetNodeValue", () => {
  it("executes directly when not collecting", () => {
    const text = document.createTextNode("old")
    domSetNodeValue(text, "new")
    expect(text.nodeValue).toBe("new")
  })

  it("queues when collecting and applies on commit", () => {
    const text = document.createTextNode("old")

    beginCollecting()
    domSetNodeValue(text, "new")
    expect(text.nodeValue).toBe("old")

    commitEffects()
    expect(text.nodeValue).toBe("new")
  })
})

// ---------------------------------------------------------------------------
// domSetInnerHTML
// ---------------------------------------------------------------------------

describe("domSetInnerHTML", () => {
  it("executes directly when not collecting", () => {
    const div = document.createElement("div")
    domSetInnerHTML(div, "<b>bold</b>")
    expect(div.innerHTML).toBe("<b>bold</b>")
  })

  it("queues when collecting and applies on commit", () => {
    const div = document.createElement("div")
    div.innerHTML = "<i>old</i>"

    beginCollecting()
    domSetInnerHTML(div, "<b>new</b>")
    expect(div.innerHTML).toBe("<i>old</i>")

    commitEffects()
    expect(div.innerHTML).toBe("<b>new</b>")
  })

  it("clears innerHTML on commit when set to empty string", () => {
    const div = document.createElement("div")
    div.innerHTML = "<span>content</span>"

    beginCollecting()
    domSetInnerHTML(div, "")
    commitEffects()

    expect(div.innerHTML).toBe("")
  })
})

// ---------------------------------------------------------------------------
// Combined structural + property effects
// ---------------------------------------------------------------------------

describe("structural + property effects together", () => {
  it("property changes on existing elements are deferred alongside structural changes", () => {
    const parent = document.createElement("div")
    const existing = document.createElement("span")
    existing.textContent = "old"
    parent.appendChild(existing)

    const newChild = document.createElement("em")

    beginCollecting()
    // Property change on existing (live) element
    domSetTextContent(existing, "updated")
    // Structural change: add a new child
    domAppendChild(parent, newChild)

    // Neither change visible yet
    expect(existing.textContent).toBe("old")
    expect(parent.childNodes.length).toBe(1)

    commitEffects()

    // Both changes applied atomically
    expect(existing.textContent).toBe("updated")
    expect(parent.childNodes.length).toBe(2)
  })

  it("patchProp-style thunk defers attribute changes", () => {
    const div = document.createElement("div")
    div.id = "old"

    beginCollecting()
    pushThunk(() => {
      div.id = "new"
    })
    expect(div.id).toBe("old")

    commitEffects()
    expect(div.id).toBe("new")
  })

  it("className thunk defers className changes", () => {
    const div = document.createElement("div")
    ;(div as HTMLElement).className = "old-class"

    beginCollecting()
    pushThunk(() => {
      ;(div as HTMLElement).className = "new-class"
    })
    expect((div as HTMLElement).className).toBe("old-class")

    commitEffects()
    expect((div as HTMLElement).className).toBe("new-class")
  })

  it("full render simulation: mount + prop changes + remove commit atomically", () => {
    const parent = document.createElement("div")
    const oldChild = document.createElement("span")
    oldChild.id = "old"
    parent.appendChild(oldChild)

    const newChild = document.createElement("em")
    newChild.textContent = "new content"

    beginCollecting()
    // Simulate: update existing element props, mount new, remove old
    pushThunk(() => {
      oldChild.id = "updated-but-going-away"
    })
    domAppendChild(parent, newChild)
    domInsertBefore(parent, newChild, oldChild)
    domRemoveChild(parent, oldChild)

    // Nothing changed yet
    expect(parent.childNodes.length).toBe(1)
    expect(parent.firstChild).toBe(oldChild)
    expect(oldChild.id).toBe("old")

    commitEffects()

    // All changes applied
    expect(parent.childNodes.length).toBe(1)
    expect(parent.firstChild).toBe(newChild)
  })
})
