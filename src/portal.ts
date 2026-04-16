/**
 * Portal support -- render children into a DOM node outside the parent tree.
 *
 * createPortal returns a component VNode tagged with _portalContainer.
 * mountComponent/patchComponent/unmountComponent detect this tag and
 * mount/patch the rendered children into the portal container instead
 * of the normal parentDom. A placeholder text node is inserted in the
 * original position so the diff system can track the portal's location.
 */

import { h } from "./jsx"
import type { ComponentFn } from "./vnode"
import type { VNode } from "./vnode"

/**
 * Component function tagged with a portal container.
 */
export interface PortalFn extends ComponentFn {
  _portalContainer: Element
}

/**
 * Render children into a different DOM container.
 *
 * The children will be mounted into `container` rather than the
 * component's normal parent. A placeholder is left in the original
 * tree for the diff system to track.
 *
 * @param children - VNode(s) to render inside the portal
 * @param container - The target DOM element to render into
 * @returns A VNode representing the portal
 */
export function createPortal(children: VNode, container: Element): VNode {
  const portal = ((props: Record<string, unknown>) => {
    return props["children"] as VNode
  }) as PortalFn
  portal._portalContainer = container
  return h(portal, null, children)
}

/**
 * Extract the portal container from a component function, if any.
 */
export function getPortalContainer(type: ComponentFn): Element | undefined {
  return "_portalContainer" in type ? (type as PortalFn)._portalContainer : undefined
}
