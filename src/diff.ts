/**
 * Core reconciliation algorithm.
 *
 * Dispatches to type-specific patchers based on VNode flags.
 * Keyed children use an LIS-based algorithm (Inferno-style) for minimal DOM moves.
 * Non-keyed children diff pairwise by index.
 *
 * Pre-allocated working arrays for LIS are reused across diffs to avoid allocation.
 */

import { patchComponent as patchComp } from "./component"
import { pushInsert, pushThunk } from "./effects"
import type { ChildFlag } from "./flags"
import { ChildFlags, VNodeFlags } from "./flags"
import { mountInternal } from "./mount"
import { patchProp, setRootContainer } from "./patch"
import { releaseVNode } from "./pool"
import { R, LANE_TRANSITION } from "./render-state"
import { registerPatch } from "./reconcile-bridge"
import { clearRef, setRef } from "./ref"
import { shouldYield } from "./scheduler"
import { unmount, unmountChildren } from "./unmount"
import type { DangerousInnerHTML, VNode } from "./vnode"
import { appendAfterWork, savePendingWork } from "./work-loop"

// --- className / text / innerHTML helpers ---
//
// Extracted so patchElement's body stays compact (improves V8 inlining
// budget for the outer patchInner dispatch). The Transition thunk
// closures are allocated only when R.collecting is true; the Sync path
// pays one branch and a direct DOM write.

function applyClassName(dom: Element, cn: string | null, isSvg: boolean): void {
  if (isSvg) {
    if (cn !== null) {
      dom.setAttribute("class", cn)
    } else {
      dom.removeAttribute("class")
    }
  } else {
    ;(dom as HTMLElement).className = cn ?? ""
  }
}

function patchClassName(dom: Element, cn: string | null, isSvg: boolean): void {
  if (R.collecting) {
    pushThunk(() => applyClassName(dom, cn, isSvg))
  } else if (isSvg) {
    if (cn !== null) {
      dom.setAttribute("class", cn)
    } else {
      dom.removeAttribute("class")
    }
  } else {
    ;(dom as HTMLElement).className = cn ?? ""
  }
}

function setTextContent(dom: Element, text: string): void {
  if (R.collecting) {
    pushThunk(() => { dom.textContent = text })
  } else {
    dom.textContent = text
  }
}

function setNodeValue(node: Text, str: string): void {
  if (R.collecting) {
    pushThunk(() => { node.nodeValue = str })
  } else {
    node.nodeValue = str
  }
}

function setInnerHTML(dom: Element, html: string): void {
  if (R.collecting) {
    pushThunk(() => { dom.innerHTML = html })
  } else {
    dom.innerHTML = html
  }
}

// --- Fragment DOM node helpers ---

/**
 * Move all DOM nodes belonging to a VNode before a reference node.
 * For element/text VNodes, this moves a single node.
 * For fragment VNodes, this moves all child DOM nodes.
 */
function moveVNodeDOM(vnode: VNode, parentDom: Element, refNode: Element | Text | null): void {
  if ((vnode.flags & VNodeFlags.Fragment) !== 0) {
    const childFlags = vnode.childFlags
    if (childFlags === ChildFlags.HasSingleChild) {
      moveVNodeDOM(vnode.children as VNode, parentDom, refNode)
    } else if (
      childFlags === ChildFlags.HasKeyedChildren ||
      childFlags === ChildFlags.HasNonKeyedChildren
    ) {
      const children = vnode.children as VNode[]
      for (let i = 0; i < children.length; i++) {
        moveVNodeDOM(children[i]!, parentDom, refNode)
      }
    } else if (vnode.dom !== null) {
      if (R.collecting) {
        pushInsert(parentDom, vnode.dom, refNode)
      } else {
        parentDom.insertBefore(vnode.dom, refNode)
      }
    }
  } else if (vnode.dom !== null) {
    if (R.collecting) {
      pushInsert(parentDom, vnode.dom, refNode)
    } else {
      parentDom.insertBefore(vnode.dom, refNode)
    }
  }
}

/**
 * Get the last DOM node belonging to a VNode.
 * For element/text VNodes, this is vnode.dom.
 * For fragments with multiple children, this is the last child's last DOM node.
 */
function getLastDOM(vnode: VNode): Element | Text | null {
  if ((vnode.flags & VNodeFlags.Fragment) !== 0) {
    const childFlags = vnode.childFlags
    if (childFlags === ChildFlags.HasSingleChild) {
      return getLastDOM(vnode.children as VNode)
    }
    if (
      childFlags === ChildFlags.HasKeyedChildren ||
      childFlags === ChildFlags.HasNonKeyedChildren
    ) {
      const children = vnode.children as VNode[]
      if (children.length > 0) {
        return getLastDOM(children[children.length - 1]!)
      }
    }
    return vnode.dom
  }
  return vnode.dom
}

/**
 * Get the reference node for inserting before the next VNode in a keyed list.
 * For fragments, we need the first DOM node, not just vnode.dom (which is the same,
 * but this is explicit).
 */
function getFirstDOM(vnode: VNode): Element | Text | null {
  return vnode.dom
}

// --- Pre-allocated working arrays (reused across diffs) ---

// Keyed diff: reuse Map and sources array to avoid per-diff allocation
const keyIndexMap: Map<string | number, number> = new Map()
let sourcesArr: Int32Array = new Int32Array(256)

function ensureSourcesCapacity(n: number): void {
  if (sourcesArr.length < n) {
    sourcesArr = new Int32Array(Math.max(n, sourcesArr.length * 2) | 0)
  }
}

// LIS working arrays
let lisP: Int32Array = new Int32Array(256)
let lisResult: Int32Array = new Int32Array(256)
let lisTails: Int32Array = new Int32Array(256)

function ensureLisCapacity(n: number): void {
  if (lisP.length < n) {
    const size = Math.max(n, lisP.length * 2) | 0
    lisP = new Int32Array(size)
    lisResult = new Int32Array(size)
    lisTails = new Int32Array(size)
  }
}

// --- Public API ---

/**
 * Patch an old VNode tree to match a new VNode tree, applying minimal DOM mutations.
 *
 * @param oldVNode - The existing virtual node tree
 * @param newVNode - The target virtual node tree
 * @param parentDom - The parent DOM element
 */
export function patch(oldVNode: VNode, newVNode: VNode, parentDom: Element): void {
  setRootContainer(parentDom)
  patchInner(oldVNode, newVNode, parentDom)
}

// Register with the bridge so component.ts can call patch without a direct import.
registerPatch(patch)

/**
 * Internal patch dispatch -- skips setRootContainer for recursive calls.
 * The root container only needs to be set once at the top-level entry point.
 */
function patchInner(oldVNode: VNode, newVNode: VNode, parentDom: Element): void {
  // Referential equality — nothing changed
  if (oldVNode === newVNode) return

  const oldFlags = oldVNode.flags
  const newFlags = newVNode.flags

  // Different types — replace entirely
  if (oldFlags !== newFlags || oldVNode.type !== newVNode.type) {
    replaceVNode(oldVNode, newVNode, parentDom)
    return
  }

  if ((newFlags & VNodeFlags.Element) !== 0) {
    patchElement(oldVNode, newVNode, parentDom)
  } else if ((newFlags & VNodeFlags.Text) !== 0) {
    // Inlined text patching -- avoids function call overhead on leaf nodes
    const dom = oldVNode.dom as Text
    newVNode.dom = dom
    newVNode.parentDom = oldVNode.parentDom
    if (oldVNode.children !== newVNode.children) {
      setNodeValue(dom, newVNode.children as string)
    }
  } else if ((newFlags & VNodeFlags.Component) !== 0) {
    patchComp(oldVNode, newVNode, parentDom)
  } else if ((newFlags & VNodeFlags.Fragment) !== 0) {
    patchFragment(oldVNode, newVNode, parentDom)
  }
}

// --- Type-specific patchers ---

function patchElement(oldVNode: VNode, newVNode: VNode, parentDom: Element): void {
  const dom = oldVNode.dom as Element
  newVNode.dom = dom
  newVNode.parentDom = parentDom

  const isSvg = (newVNode.flags & VNodeFlags.Svg) !== 0
  // Short-circuit: skip foreignObject string comparison when not in SVG (99% of cases)
  const childSvg = isSvg && (newVNode.type as string) !== "foreignObject"

  // className fast path -- direct property write (deferred during Transition)
  const oldCn = oldVNode.className
  const newCn = newVNode.className
  if (oldCn !== newCn) {
    patchClassName(dom, newCn, isSvg)
  }

  // Hoist props reads -- avoids repeated vnode.props access
  const oldProps = oldVNode.props
  const newProps = newVNode.props

  // Diff props -- inline null check avoids function call overhead when both are null
  if (oldProps !== newProps) {
    patchProps(dom, oldProps, newProps, isSvg)
  }

  // Handle dangerouslySetInnerHTML (rare path -- check props null first)
  if (newProps !== null || oldProps !== null) {
    const newDIH = newProps !== null ? newProps["dangerouslySetInnerHTML"] : undefined
    const oldDIH = oldProps !== null ? oldProps["dangerouslySetInnerHTML"] : undefined

    if (newDIH !== undefined) {
      const newHtml = (newDIH as DangerousInnerHTML).__html
      const oldHtml = oldDIH !== undefined ? (oldDIH as DangerousInnerHTML).__html : ""
      if (newHtml !== oldHtml) {
        setInnerHTML(dom, newHtml)
      }
      // Skip normal children diff when using innerHTML
    } else if (oldDIH !== undefined) {
      setInnerHTML(dom, "")
      mountNewChildren(newVNode, dom, childSvg)
    } else {
      patchChildren(oldVNode, newVNode, dom, childSvg)
    }
  } else {
    // Both props null -- just diff children (common fast path)
    patchChildren(oldVNode, newVNode, dom, childSvg)
  }

  // Update ref (only when props exist). Refs are rare, so checking R.pending
  // inside this branch -- instead of before it -- avoids one load+branch on
  // every ref-less element patch, which is the overwhelmingly common case.
  if (oldProps !== null || newProps !== null) {
    const oldRef = oldProps !== null ? oldProps["ref"] : undefined
    const newRef = newProps !== null ? newProps["ref"] : undefined
    if (oldRef !== newRef) {
      if (R.pending) {
        deferRefUpdate(dom, oldRef, newRef)
      } else {
        if (oldRef !== undefined) clearRef(oldRef, dom)
        if (newRef !== undefined) setRef(newRef, dom)
      }
    }
  }
}

/**
 * Queue the ref update to run after the resumed children diff completes.
 * Only called when R.pending is true (Transition mid-render yield).
 */
function deferRefUpdate(dom: Element, oldRef: unknown, newRef: unknown): void {
  appendAfterWork(() => {
    if (oldRef !== undefined) clearRef(oldRef, dom)
    if (newRef !== undefined) setRef(newRef, dom)
  })
}

function patchFragment(oldVNode: VNode, newVNode: VNode, parentDom: Element): void {
  newVNode.parentDom = parentDom
  patchChildren(oldVNode, newVNode, parentDom, false)

  // If a descendant yielded (Transition only), defer the dom reference update.
  if (R.pending) {
    appendAfterWork(() => updateFragmentDom(oldVNode, newVNode))
    return
  }

  updateFragmentDom(oldVNode, newVNode)
}

function updateFragmentDom(oldVNode: VNode, newVNode: VNode): void {
  const childFlags = newVNode.childFlags
  if (childFlags === ChildFlags.HasSingleChild) {
    newVNode.dom = (newVNode.children as VNode).dom
  } else if (
    childFlags === ChildFlags.HasKeyedChildren ||
    childFlags === ChildFlags.HasNonKeyedChildren
  ) {
    newVNode.dom = (newVNode.children as VNode[])[0]!.dom
  } else {
    newVNode.dom = oldVNode.dom
  }
}

// --- Prop diffing ---

function patchProps(
  dom: Element,
  oldProps: Record<string, unknown> | null,
  newProps: Record<string, unknown> | null,
  isSvg: boolean,
): void {
  if (oldProps === newProps) return
  if (oldProps === null && newProps === null) return

  // Remove old props not in new (for...in without hasOwnProperty for V8 JIT)
  if (oldProps !== null) {
    for (const key in oldProps) {
      if (newProps === null || !(key in newProps)) {
        patchProp(dom, key, oldProps[key], null, isSvg)
      }
    }
  }

  // Add/update new props
  if (newProps !== null) {
    for (const key in newProps) {
      const newVal = newProps[key]
      const oldVal = oldProps !== null ? oldProps[key] : undefined
      if (newVal !== oldVal) {
        patchProp(dom, key, oldVal ?? null, newVal, isSvg)
      }
    }
  }
}

// --- Children diffing ---

function patchChildren(oldVNode: VNode, newVNode: VNode, dom: Element, isSvg: boolean): void {
  const oldChildFlags = oldVNode.childFlags
  const newChildFlags = newVNode.childFlags
  const oldChildren = oldVNode.children
  const newChildren = newVNode.children

  // Fast path: same child type (covers ~95% of update cases)
  if (oldChildFlags === newChildFlags) {
    if (oldChildFlags === ChildFlags.HasKeyedChildren) {
      patchKeyedChildren(oldChildren as VNode[], newChildren as VNode[], dom, isSvg)
      return
    }
    if (oldChildFlags === ChildFlags.HasNonKeyedChildren) {
      patchNonKeyedChildren(oldChildren as VNode[], newChildren as VNode[], dom, isSvg)
      return
    }
    if (oldChildFlags === ChildFlags.HasSingleChild) {
      patchInner(oldChildren as VNode, newChildren as VNode, dom)
      return
    }
    if (oldChildFlags === ChildFlags.HasTextChildren) {
      if (oldChildren !== newChildren) {
        setTextContent(dom, newChildren as string)
      }
      return
    }
    // Both NoChildren
    return
  }

  // Cross-type transitions (rare during updates)
  if (oldChildFlags === ChildFlags.NoChildren) {
    mountNewChildren(newVNode, dom, isSvg)
    return
  }

  if (newChildFlags === ChildFlags.NoChildren) {
    removeOldChildren(oldVNode, dom)
    return
  }

  if (oldChildFlags === ChildFlags.HasTextChildren) {
    setTextContent(dom, "")
    mountNewChildren(newVNode, dom, isSvg)
    return
  }

  if (newChildFlags === ChildFlags.HasTextChildren) {
    removeOldChildVNodes(oldVNode, oldChildFlags, dom)
    setTextContent(dom, newChildren as string)
    return
  }

  if (oldChildFlags === ChildFlags.HasSingleChild) {
    unmount(oldChildren as VNode, dom)
    mountNewChildren(newVNode, dom, isSvg)
    return
  }

  if (newChildFlags === ChildFlags.HasSingleChild) {
    removeOldChildVNodes(oldVNode, oldChildFlags, dom)
    mountInternal(newChildren as VNode, dom, isSvg)
    return
  }

  // Array -> Array with different keyed/non-keyed flags
  if (newChildFlags === ChildFlags.HasKeyedChildren) {
    patchKeyedChildren(oldChildren as VNode[], newChildren as VNode[], dom, isSvg)
  } else {
    patchNonKeyedChildren(oldChildren as VNode[], newChildren as VNode[], dom, isSvg)
  }
}

function mountNewChildren(vnode: VNode, dom: Element, isSvg: boolean): void {
  const childFlags = vnode.childFlags

  if (childFlags === ChildFlags.HasTextChildren) {
    setTextContent(dom, vnode.children as string)
  } else if (childFlags === ChildFlags.HasSingleChild) {
    mountInternal(vnode.children as VNode, dom, isSvg)
  } else {
    const children = vnode.children as VNode[]
    for (let i = 0; i < children.length; i++) {
      mountInternal(children[i]!, dom, isSvg)
    }
  }
}

function bulkClearChildren(dom: Element): void {
  if (R.collecting) {
    pushThunk(() => {
      dom.textContent = ""
    })
  } else {
    dom.textContent = ""
  }
}

function removeOldChildren(vnode: VNode, dom: Element): void {
  const childFlags = vnode.childFlags

  if (childFlags === ChildFlags.HasTextChildren) {
    setTextContent(dom, "")
  } else if (childFlags === ChildFlags.HasSingleChild) {
    unmount(vnode.children as VNode, dom)
  } else {
    // Bulk clear: walk VNodes to run effect cleanups / release pool entries
    // without touching the DOM, then drop all DOM children in one shot.
    // Replaces N removeChild calls with a single textContent assignment.
    unmountChildren(vnode)
    bulkClearChildren(dom)
  }
}

function removeOldChildVNodes(vnode: VNode, childFlags: ChildFlag, dom: Element): void {
  if (childFlags === ChildFlags.HasSingleChild) {
    unmount(vnode.children as VNode, dom)
  } else {
    unmountChildren(vnode)
    bulkClearChildren(dom)
  }
}

// --- Non-keyed children diff ---

function patchNonKeyedChildren(
  oldChildren: VNode[],
  newChildren: VNode[],
  dom: Element,
  isSvg: boolean,
): void {
  // Sync fast path: no yield infrastructure, matches pre-fiber diff exactly.
  // Only Transition-lane rendering needs the resumable phase machinery.
  if (R.activeLane !== LANE_TRANSITION) {
    const oldLen = oldChildren.length | 0
    const newLen = newChildren.length | 0
    const minLen = oldLen < newLen ? oldLen : newLen
    for (let i = 0; i < minLen; i++) {
      const oldChild = oldChildren[i]!
      patchInner(oldChild, newChildren[i]!, dom)
      releaseVNode(oldChild)
    }
    if (newLen > oldLen) {
      for (let i = oldLen; i < newLen; i++) {
        mountInternal(newChildren[i]!, dom, isSvg)
      }
    } else if (oldLen > newLen) {
      for (let i = newLen; i < oldLen; i++) {
        unmount(oldChildren[i]!, dom)
      }
    }
    return
  }
  patchNonKeyedFrom(oldChildren, newChildren, dom, isSvg, 0, 0)
}

/**
 * Non-keyed children diff with resumable state. Called directly on
 * first entry and as a continuation closure when resuming after yield.
 *
 * The three phases (patch common, mount excess, unmount excess) are
 * encoded as a single linear progression using `startIdx` and `phase`:
 *   phase 0: patching common prefix (indices 0..minLen-1)
 *   phase 1: mounting excess new children (indices oldLen..newLen-1)
 *   phase 2: unmounting excess old children (indices newLen..oldLen-1)
 *
 * @param startIdx - Index to resume from within the current phase
 * @param phase - Which phase to resume (0 = patch, 1 = mount, 2 = unmount)
 */
function patchNonKeyedFrom(
  oldChildren: VNode[],
  newChildren: VNode[],
  dom: Element,
  isSvg: boolean,
  startIdx: number,
  phase: number,
): void {
  // Only reached during Transition-lane rendering (patchNonKeyedChildren
  // dispatches to a sync fast path otherwise).
  const oldLen = oldChildren.length | 0
  const newLen = newChildren.length | 0
  const minLen = oldLen < newLen ? oldLen : newLen

  // Phase 0: Patch common prefix
  if (phase === 0) {
    for (let i = startIdx; i < minLen; i++) {
      patchInner(oldChildren[i]!, newChildren[i]!, dom)

      if (R.pending || shouldYield()) {
        savePendingWork(() => patchNonKeyedFrom(oldChildren, newChildren, dom, isSvg, i + 1, 0))
        return
      }
    }
    // Fall through to the appropriate tail phase
    startIdx = 0
    phase = newLen > oldLen ? 1 : oldLen > newLen ? 2 : 3
  }

  // Phase 1: Mount excess new children
  if (phase === 1) {
    const mountStart = startIdx === 0 ? oldLen : startIdx
    for (let i = mountStart; i < newLen; i++) {
      mountInternal(newChildren[i]!, dom, isSvg)

      if (shouldYield() && i + 1 < newLen) {
        savePendingWork(() => patchNonKeyedFrom(oldChildren, newChildren, dom, isSvg, i + 1, 1))
        return
      }
    }
  }

  // Phase 2: Unmount excess old children
  if (phase === 2) {
    const unmountStart = startIdx === 0 ? newLen : startIdx
    for (let i = unmountStart; i < oldLen; i++) {
      unmount(oldChildren[i]!, dom)

      if (shouldYield() && i + 1 < oldLen) {
        savePendingWork(() => patchNonKeyedFrom(oldChildren, newChildren, dom, isSvg, i + 1, 2))
        return
      }
    }
  }
}

// --- Keyed children diff (Inferno-style LIS algorithm) ---

function patchKeyedChildren(
  oldChildren: VNode[],
  newChildren: VNode[],
  dom: Element,
  isSvg: boolean,
): void {
  // Sync fast path: single-function keyed diff, no yield checks.
  // Matches pre-fiber code shape for JIT inlining on Sync/Default lanes.
  if (R.activeLane !== LANE_TRANSITION) {
    patchKeyedChildrenSync(oldChildren, newChildren, dom, isSvg)
    return
  }

  let oldStart = 0
  let newStart = 0
  let oldEnd = (oldChildren.length | 0) - 1
  let newEnd = (newChildren.length | 0) - 1

  // Transition-lane: yield-aware path via patchKeyedFrom split.
  while (oldStart <= oldEnd && newStart <= newEnd) {
    const oldVNode = oldChildren[oldStart]!
    const newVNode = newChildren[newStart]!
    if (oldVNode.key !== newVNode.key) break
    patchInner(oldVNode, newVNode, dom)
    oldStart++
    newStart++

    if (R.pending || shouldYield()) {
      savePendingWork(() =>
        patchKeyedFrom(oldChildren, newChildren, dom, isSvg, oldStart, newStart, oldEnd, newEnd),
      )
      return
    }
  }

  patchKeyedFrom(oldChildren, newChildren, dom, isSvg, oldStart, newStart, oldEnd, newEnd)
}

function patchKeyedChildrenSync(
  oldChildren: VNode[],
  newChildren: VNode[],
  dom: Element,
  isSvg: boolean,
): void {
  let oldStart = 0
  let newStart = 0
  let oldEnd = (oldChildren.length | 0) - 1
  let newEnd = (newChildren.length | 0) - 1

  // Prefix and suffix scans release matched oldVNodes back to the pool
  // so the next render's jsx() calls pop them instead of allocating. For
  // update10th-style rerenders (all 1000 rows keep their key and position),
  // this converts 1000 heap allocations per render into 1000 pool pops.
  while (oldStart <= oldEnd && newStart <= newEnd) {
    const oldVNode = oldChildren[oldStart]!
    const newVNode = newChildren[newStart]!
    if (oldVNode.key !== newVNode.key) break
    patchInner(oldVNode, newVNode, dom)
    releaseVNode(oldVNode)
    oldStart++
    newStart++
  }

  while (oldStart <= oldEnd && newStart <= newEnd) {
    const oldVNode = oldChildren[oldEnd]!
    const newVNode = newChildren[newEnd]!
    if (oldVNode.key !== newVNode.key) break
    patchInner(oldVNode, newVNode, dom)
    releaseVNode(oldVNode)
    oldEnd--
    newEnd--
  }

  if (oldStart > oldEnd) {
    if (newStart <= newEnd) {
      const nextPos = newEnd + 1
      const refNode = nextPos < newChildren.length ? newChildren[nextPos]!.dom : null
      for (let i = newStart; i <= newEnd; i++) {
        mountBefore(newChildren[i]!, dom, refNode, isSvg)
      }
    }
    return
  }

  if (newStart > newEnd) {
    for (let i = oldStart; i <= oldEnd; i++) {
      unmount(oldChildren[i]!, dom)
    }
    return
  }

  const oldMiddleLen = oldEnd - oldStart + 1
  const newMiddleLen = newEnd - newStart + 1

  if (newMiddleLen < 4 || (oldMiddleLen | newMiddleLen) < 32) {
    patchKeyedSmall(oldChildren, newChildren, oldStart, oldEnd, newStart, newEnd, dom, isSvg)
    return
  }

  keyIndexMap.clear()
  for (let i = newStart; i <= newEnd; i++) {
    keyIndexMap.set(newChildren[i]!.key!, i)
  }

  ensureSourcesCapacity(newMiddleLen)
  for (let i = 0; i < newMiddleLen; i++) {
    sourcesArr[i] = -1
  }

  let moved = false
  let lastOldIndex = 0

  for (let i = oldStart; i <= oldEnd; i++) {
    const oldVNode = oldChildren[i]!
    const newIndex = keyIndexMap.get(oldVNode.key!)

    if (newIndex === undefined) {
      unmount(oldVNode, dom)
    } else {
      sourcesArr[newIndex - newStart] = i
      if (newIndex < lastOldIndex) {
        moved = true
      } else {
        lastOldIndex = newIndex
      }
      patchInner(oldVNode, newChildren[newIndex]!, dom)
      releaseVNode(oldVNode)
    }
  }

  patchKeyedApplyMoves(newChildren, dom, isSvg, newStart, newMiddleLen, moved)
}

/**
 * Resumable keyed children diff. Enters after the prefix scan has
 * completed (or been yielded-and-resumed).
 *
 * The suffix scan, simple-case checks, and middle section all run
 * from here. Yield points exist in the middle section's matching
 * loop and the final move/mount reverse walk.
 */
function patchKeyedFrom(
  oldChildren: VNode[],
  newChildren: VNode[],
  dom: Element,
  isSvg: boolean,
  oldStart: number,
  newStart: number,
  oldEnd: number,
  newEnd: number,
): void {
  // This function is only reached during Transition-lane rendering
  // (patchKeyedChildren dispatches to patchKeyedChildrenSync otherwise).

  // 2. Scan from end -- while keys match, patch in place
  // Suffix scan is typically short (stops at first mismatch), so no
  // yield check here. The scan must complete to establish bounds for
  // the middle section.
  while (oldStart <= oldEnd && newStart <= newEnd) {
    const oldVNode = oldChildren[oldEnd]!
    const newVNode = newChildren[newEnd]!
    if (oldVNode.key !== newVNode.key) break
    patchInner(oldVNode, newVNode, dom)
    oldEnd--
    newEnd--
  }

  // 3. Simple cases after scanning
  if (oldStart > oldEnd) {
    // Old exhausted -- mount remaining new
    if (newStart <= newEnd) {
      const nextPos = newEnd + 1
      const refNode = nextPos < newChildren.length ? newChildren[nextPos]!.dom : null
      for (let i = newStart; i <= newEnd; i++) {
        mountBefore(newChildren[i]!, dom, refNode, isSvg)
      }
    }
    return
  }

  if (newStart > newEnd) {
    // New exhausted -- unmount remaining old
    for (let i = oldStart; i <= oldEnd; i++) {
      unmount(oldChildren[i]!, dom)
    }
    return
  }

  // 4. Middle section -- match old children to new children
  const oldMiddleLen = oldEnd - oldStart + 1
  const newMiddleLen = newEnd - newStart + 1

  // Small-list fast path: O(n^2) scan is faster than Map + LIS for tiny lists
  // (avoids Map.set/get overhead and sources array initialization)
  if (newMiddleLen < 4 || (oldMiddleLen | newMiddleLen) < 32) {
    patchKeyedSmall(oldChildren, newChildren, oldStart, oldEnd, newStart, newEnd, dom, isSvg)
    return
  }

  // Build map of new keys -> new index (reuse pre-allocated Map)
  keyIndexMap.clear()
  for (let i = newStart; i <= newEnd; i++) {
    keyIndexMap.set(newChildren[i]!.key!, i)
  }

  // sources[i] = index into old children that maps to new[newStart + i], or -1 if new
  // Reuse pre-allocated array to avoid per-diff Int32Array allocation
  ensureSourcesCapacity(newMiddleLen)
  for (let i = 0; i < newMiddleLen; i++) {
    sourcesArr[i] = -1
  }

  let moved = false
  let lastOldIndex = 0

  // Walk old middle children, find their positions in new children.
  // This loop builds sourcesArr and the moved flag, and patches matched
  // pairs via patchInner. A descendant patchInner may yield, in which
  // case we save a continuation for the remaining matching + move phase.
  for (let i = oldStart; i <= oldEnd; i++) {
    const oldVNode = oldChildren[i]!
    const newIndex = keyIndexMap.get(oldVNode.key!)

    if (newIndex === undefined) {
      // Old child not in new -- remove it
      unmount(oldVNode, dom)
    } else {
      sourcesArr[newIndex - newStart] = i
      if (newIndex < lastOldIndex) {
        moved = true
      } else {
        lastOldIndex = newIndex
      }
      // Patch the matched pair
      patchInner(oldVNode, newChildren[newIndex]!, dom)

      if ((R.pending || shouldYield()) && i < oldEnd) {
        // Yield mid-matching. Save state and a continuation that finishes
        // the matching loop, then runs the move/mount phase.
        const resumeI = i + 1
        const movedSoFar = moved
        const lastOldSoFar = lastOldIndex
        savePendingWork(() =>
          patchKeyedMiddleResume(
            oldChildren, newChildren, dom, isSvg,
            oldStart, oldEnd, newStart, newEnd, newMiddleLen,
            resumeI, movedSoFar, lastOldSoFar,
          ),
        )
        return
      }
    }
  }

  // Move/mount phase
  patchKeyedApplyMoves(newChildren, dom, isSvg, newStart, newMiddleLen, moved)
}

/**
 * Resume the keyed diff matching loop after a mid-matching yield.
 * Continues walking old children from `resumeI`, building the remaining
 * sourcesArr entries and moved flag, then runs the move/mount phase.
 *
 * The keyIndexMap and sourcesArr are module-level state that persist
 * across the yield (they were populated before the yield and are only
 * read/written within a single patchKeyedChildren call chain).
 */
function patchKeyedMiddleResume(
  oldChildren: VNode[],
  newChildren: VNode[],
  dom: Element,
  isSvg: boolean,
  _oldStart: number,
  oldEnd: number,
  newStart: number,
  _newEnd: number,
  newMiddleLen: number,
  resumeI: number,
  moved: boolean,
  lastOldIndex: number,
): void {
  // Only reached during Transition-lane rendering.
  for (let i = resumeI; i <= oldEnd; i++) {
    const oldVNode = oldChildren[i]!
    const newIndex = keyIndexMap.get(oldVNode.key!)

    if (newIndex === undefined) {
      unmount(oldVNode, dom)
    } else {
      sourcesArr[newIndex - newStart] = i
      if (newIndex < lastOldIndex) {
        moved = true
      } else {
        lastOldIndex = newIndex
      }
      patchInner(oldVNode, newChildren[newIndex]!, dom)

      if ((R.pending || shouldYield()) && i < oldEnd) {
        const nextI = i + 1
        const movedSoFar = moved
        const lastOldSoFar = lastOldIndex
        savePendingWork(() =>
          patchKeyedMiddleResume(
            oldChildren, newChildren, dom, isSvg,
            _oldStart, oldEnd, newStart, _newEnd, newMiddleLen,
            nextI, movedSoFar, lastOldSoFar,
          ),
        )
        return
      }
    }
  }

  patchKeyedApplyMoves(newChildren, dom, isSvg, newStart, newMiddleLen, moved)
}

/**
 * Apply moves and mounts for the keyed diff middle section.
 * Called after the matching loop completes (all sourcesArr entries and
 * the moved flag are finalized). Computes LIS if needed, then walks
 * new children in reverse to mount/move.
 */
function patchKeyedApplyMoves(
  newChildren: VNode[],
  dom: Element,
  isSvg: boolean,
  newStart: number,
  newMiddleLen: number,
  moved: boolean,
): void {
  if (moved) {
    // Compute LIS of sourcesArr to find nodes that don't need to move
    const seq = longestIncreasingSubsequence(sourcesArr, newMiddleLen)
    let seqIdx = seq.length - 1

    // Walk new children in reverse, moving/inserting as needed
    for (let i = newMiddleLen - 1; i >= 0; i--) {
      const newIndex = newStart + i
      const nextPos = newIndex + 1
      const refNode = nextPos < newChildren.length ? newChildren[nextPos]!.dom : null

      if (sourcesArr[i] === -1) {
        // New node -- mount it
        mountBefore(newChildren[newIndex]!, dom, refNode, isSvg)
      } else if (seqIdx < 0 || i !== seq[seqIdx]!) {
        // Not in LIS -- move it (handles fragments with multiple DOM nodes)
        moveVNodeDOM(newChildren[newIndex]!, dom, refNode)
      } else {
        // In LIS -- no move needed
        seqIdx--
      }
    }
  } else {
    // No moves needed -- just mount new nodes
    for (let i = newMiddleLen - 1; i >= 0; i--) {
      if (sourcesArr[i] === -1) {
        const newIndex = newStart + i
        const nextPos = newIndex + 1
        const refNode = nextPos < newChildren.length ? newChildren[nextPos]!.dom : null
        mountBefore(newChildren[newIndex]!, dom, refNode, isSvg)
      }
    }
  }
}

/**
 * Small-list keyed diff: O(n^2) scan for tiny middle sections.
 * Faster than Map + LIS when the number of items is small because
 * it avoids Map.set/get, sources array init, and LIS computation.
 */
function patchKeyedSmall(
  oldChildren: VNode[],
  newChildren: VNode[],
  oldStart: number,
  oldEnd: number,
  newStart: number,
  newEnd: number,
  dom: Element,
  isSvg: boolean,
): void {
  // Track which old indices have been matched using a bitmask.
  // Safe because this function is only called when (oldMiddleLen | newMiddleLen) < 32.
  let matchedOld = 0

  // For each new child, scan old children to find a key match
  for (let i = newEnd; i >= newStart; i--) {
    const newChild = newChildren[i]!
    const newKey = newChild.key
    let found = false

    for (let j = oldStart; j <= oldEnd; j++) {
      const bit = 1 << (j - oldStart)
      if (matchedOld & bit) continue
      const oldChild = oldChildren[j]!
      if (oldChild.key === newKey) {
        patchInner(oldChild, newChild, dom)
        releaseVNode(oldChild)
        found = true
        matchedOld |= bit
        break
      }
    }

    if (!found) {
      // New node -- mount it
      const nextPos = i + 1
      const refNode = nextPos < newChildren.length ? getFirstDOM(newChildren[nextPos]!) : null
      mountBefore(newChild, dom, refNode, isSvg)
    } else {
      // Existing node -- move to correct position if needed
      const nextPos = i + 1
      const refNode = nextPos < newChildren.length ? getFirstDOM(newChildren[nextPos]!) : null
      if (refNode !== null && newChild.dom !== refNode) {
        moveVNodeDOM(newChild, dom, refNode)
      }
    }
  }

  // Unmount any old children that weren't matched
  for (let i = oldStart; i <= oldEnd; i++) {
    if (!(matchedOld & (1 << (i - oldStart)))) {
      unmount(oldChildren[i]!, dom)
    }
  }
}

/**
 * Mount a VNode and insert it before a reference DOM node (or append if ref is null).
 */
function mountBefore(
  vnode: VNode,
  parentDom: Element,
  refNode: Element | Text | null,
  isSvg: boolean,
): void {
  mountInternal(vnode, parentDom, isSvg)
  // mountInternal() appends to parentDom -- if we need it before refNode, move it
  if (refNode !== null && vnode.dom !== null) {
    moveVNodeDOM(vnode, parentDom, refNode)
  }
}

function replaceVNode(oldVNode: VNode, newVNode: VNode, parentDom: Element): void {
  const isSvg = (newVNode.flags & VNodeFlags.Svg) !== 0
  mountInternal(newVNode, parentDom, isSvg)

  // Insert new before old, then remove old
  if (oldVNode.dom !== null && newVNode.dom !== null) {
    if (R.collecting) {
      pushInsert(parentDom, newVNode.dom, oldVNode.dom)
    } else {
      parentDom.insertBefore(newVNode.dom, oldVNode.dom)
    }
  }
  unmount(oldVNode, parentDom)
}

// --- Longest Increasing Subsequence (O(n log n) patience sorting) ---

/**
 * Compute the LIS of the given sources array. Returns indices into the array
 * (not values) that form the longest increasing subsequence.
 *
 * Only considers non-negative values (skips -1 entries which represent new nodes).
 *
 * @param sources - Array where sources[i] is the old index, or -1 for new nodes
 * @param len - Length of the sources array to consider
 * @returns Array of indices (into sources) forming the LIS
 */
function longestIncreasingSubsequence(sources: Int32Array, len: number): number[] {
  ensureLisCapacity(len)

  // tails[k] = index of smallest tail element for IS of length k+1
  // p[i] = predecessor index for element at index i
  let lisLen = 0

  for (let i = 0; i < len; i++) {
    const val = sources[i]!
    if (val === -1) continue

    // Binary search for the position where val should go in tails
    let lo = 0
    let hi = lisLen

    while (lo < hi) {
      const mid = (lo + hi) >>> 1
      if (sources[lisTails[mid]!]! < val) {
        lo = mid + 1
      } else {
        hi = mid
      }
    }

    lisTails[lo] = i
    lisP[i] = lo > 0 ? lisTails[lo - 1]! : -1

    if (lo + 1 > lisLen) {
      lisLen = lo + 1
    }
  }

  // Backtrack to build the result
  const result: number[] = new Array(lisLen)
  let k = lisTails[lisLen - 1]!
  for (let i = lisLen - 1; i >= 0; i--) {
    result[i] = k
    k = lisP[k]!
  }

  return result
}
