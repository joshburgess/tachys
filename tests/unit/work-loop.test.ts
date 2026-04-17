import { beforeEach, describe, expect, it, vi } from "vitest"
import {
  appendAfterWork,
  discardPendingWork,
  hasPendingWork,
  resumePendingWork,
  savePendingWork,
} from "../../src/work-loop"

// ---------------------------------------------------------------------------
// Reset state between tests
// ---------------------------------------------------------------------------

beforeEach(() => {
  if (hasPendingWork()) discardPendingWork()
})

// ---------------------------------------------------------------------------
// Basic save / has / resume lifecycle
// ---------------------------------------------------------------------------

describe("work-loop lifecycle", () => {
  it("hasPendingWork is false initially", () => {
    expect(hasPendingWork()).toBe(false)
  })

  it("savePendingWork sets hasPendingWork to true", () => {
    savePendingWork(() => {})
    expect(hasPendingWork()).toBe(true)
  })

  it("resumePendingWork returns false when no pending work", () => {
    expect(resumePendingWork()).toBe(false)
  })

  it("resumePendingWork calls the saved resume function", () => {
    const resume = vi.fn()
    savePendingWork(resume)
    resumePendingWork()
    expect(resume).toHaveBeenCalledOnce()
  })

  it("hasPendingWork is false after resume completes", () => {
    savePendingWork(() => {})
    resumePendingWork()
    expect(hasPendingWork()).toBe(false)
  })

  it("discardPendingWork clears without executing", () => {
    const resume = vi.fn()
    savePendingWork(resume)
    discardPendingWork()
    expect(hasPendingWork()).toBe(false)
    expect(resume).not.toHaveBeenCalled()
  })
})

// ---------------------------------------------------------------------------
// afterWork callbacks (LIFO order)
// ---------------------------------------------------------------------------

describe("afterWork callbacks", () => {
  it("afterWork callbacks run in LIFO order after resume", () => {
    const order: string[] = []

    savePendingWork(() => {})
    appendAfterWork(() => order.push("first"))
    appendAfterWork(() => order.push("second"))
    appendAfterWork(() => order.push("third"))

    resumePendingWork()

    // LIFO: third, second, first
    expect(order).toEqual(["third", "second", "first"])
  })

  it("afterWork is discarded with discardPendingWork", () => {
    const spy = vi.fn()
    savePendingWork(() => {})
    appendAfterWork(spy)
    discardPendingWork()
    expect(spy).not.toHaveBeenCalled()
  })

  it("empty afterWork does not error", () => {
    savePendingWork(() => {})
    expect(() => resumePendingWork()).not.toThrow()
  })
})

// ---------------------------------------------------------------------------
// Continuation chaining (resume yields again)
// ---------------------------------------------------------------------------

describe("continuation chaining", () => {
  it("returns true when resume triggers a new yield", () => {
    // First yield
    savePendingWork(() => {
      // During resume, yield again
      savePendingWork(() => {})
    })

    const result = resumePendingWork()
    expect(result).toBe(true)
    expect(hasPendingWork()).toBe(true)
  })

  it("returns false when resume completes without yielding", () => {
    savePendingWork(() => {})
    const result = resumePendingWork()
    expect(result).toBe(false)
    expect(hasPendingWork()).toBe(false)
  })

  it("carries over afterWork from old continuation to new", () => {
    const order: string[] = []

    // First yield with afterWork
    savePendingWork(() => {
      // During resume, yield again with new afterWork
      savePendingWork(() => {})
      appendAfterWork(() => order.push("inner"))
    })
    appendAfterWork(() => order.push("outer"))

    // First resume: yields again, afterWork carried over
    const result = resumePendingWork()
    expect(result).toBe(true)

    // Second resume: completes, runs all afterWork
    resumePendingWork()
    expect(order).toEqual(["inner", "outer"])
  })

  it("handles multi-level continuation chain", () => {
    const order: string[] = []
    let yieldCount = 0

    // Create a chain: resume -> yield -> resume -> yield -> resume -> done
    savePendingWork(() => {
      yieldCount++
      savePendingWork(() => {
        yieldCount++
        savePendingWork(() => {
          yieldCount++
          // Final resume: no more yields
        })
        appendAfterWork(() => order.push("level-2"))
      })
      appendAfterWork(() => order.push("level-1"))
    })
    appendAfterWork(() => order.push("level-0"))

    // Resume chain
    expect(resumePendingWork()).toBe(true) // yields again
    expect(resumePendingWork()).toBe(true) // yields again
    expect(resumePendingWork()).toBe(false) // completes

    expect(yieldCount).toBe(3)
    // LIFO: level-2 (innermost), level-1, level-0 (outermost)
    expect(order).toEqual(["level-2", "level-1", "level-0"])
  })
})

// ---------------------------------------------------------------------------
// Simulated children loop with yield points
// ---------------------------------------------------------------------------

describe("simulated yield in children loop", () => {
  it("saves and resumes a children loop continuation", () => {
    const processed: number[] = []
    const items = [0, 1, 2, 3, 4]

    function processFrom(startIdx: number) {
      for (let i = startIdx; i < items.length; i++) {
        processed.push(items[i]!)
        // Simulate yield after index 2
        if (i === 2) {
          savePendingWork(() => processFrom(i + 1))
          return
        }
      }
    }

    processFrom(0)
    expect(processed).toEqual([0, 1, 2])
    expect(hasPendingWork()).toBe(true)

    resumePendingWork()
    expect(processed).toEqual([0, 1, 2, 3, 4])
    expect(hasPendingWork()).toBe(false)
  })

  it("afterWork runs after children loop completes", () => {
    const log: string[] = []

    function processFrom(startIdx: number) {
      for (let i = startIdx; i < 3; i++) {
        log.push(`child-${i}`)
        if (i === 1) {
          savePendingWork(() => processFrom(i + 1))
          return
        }
      }
    }

    processFrom(0)
    // Caller appends post-work
    appendAfterWork(() => log.push("ref-update"))
    appendAfterWork(() => log.push("run-effects"))

    resumePendingWork()
    expect(log).toEqual([
      "child-0", "child-1", // before yield
      "child-2",            // after resume
      "run-effects",        // afterWork LIFO
      "ref-update",
    ])
  })
})
