/**
 * Place a fixed-position node fully inside the viewport.
 *
 * `anchor` is a viewport rect (px). The node opens below the anchor, flips
 * above when there is no room, and is clamped to an 8px margin on every side.
 * With no anchor it is centred (hotkey invocation). `zoom` is the CSS zoom of
 * the host surface, so the node matches native scale; left/top are divided by
 * it because Chromium applies an element's own zoom to its offsets.
 *
 * @param {HTMLElement} node already attached to the document
 * @param {{ anchor?: { left: number, top: number, right?: number, bottom?: number } | null, zoom?: number, margin?: number }} [options]
 */
export function placeFloating(node, options = {}) {
  const win = node.ownerDocument.defaultView
  const zoom = options.zoom && options.zoom > 0 ? options.zoom : 1
  const margin = options.margin ?? 8
  if (zoom !== 1) node.style.zoom = String(zoom)
  const vw = win?.innerWidth || 1024
  const vh = win?.innerHeight || 768
  node.style.maxHeight = `${Math.max(120, (vh - margin * 2) / zoom)}px`
  node.style.overflowY = 'auto'
  node.style.left = '0px'
  node.style.top = '0px'
  const rect = node.getBoundingClientRect()
  const width = rect.width || 0
  const height = rect.height || 0
  const plan = computePlacement({ anchor: options.anchor ?? null, width, height, vw, vh, margin })
  node.style.left = `${plan.left / zoom}px`
  node.style.top = `${plan.top / zoom}px`
  node.dataset.side = plan.side
  // Second pass: zoom/font rounding can change the size after placement.
  const after = node.getBoundingClientRect()
  if (after.height && (after.bottom > vh - margin || after.right > vw - margin)) {
    const dy = Math.max(0, after.bottom - (vh - margin))
    const dx = Math.max(0, after.right - (vw - margin))
    plan.top = Math.max(margin, plan.top - dy)
    plan.left = Math.max(margin, plan.left - dx)
    node.style.left = `${plan.left / zoom}px`
    node.style.top = `${plan.top / zoom}px`
  }
  return plan
}

/**
 * Pure placement maths, exported for tests.
 * @param {{ anchor: any, width: number, height: number, vw: number, vh: number, margin: number }} input
 */
export function computePlacement({ anchor, width, height, vw, vh, margin }) {
  const clampX = (x) => Math.min(Math.max(margin, x), Math.max(margin, vw - margin - width))
  const clampY = (y) => Math.min(Math.max(margin, y), Math.max(margin, vh - margin - height))
  if (!anchor) {
    return { left: clampX((vw - width) / 2), top: clampY((vh - height) / 3), side: 'center' }
  }
  const bottom = anchor.bottom ?? anchor.top
  const below = bottom + 4
  const above = anchor.top - 4 - height
  let side = 'bottom'
  let top = below
  if (below + height > vh - margin) {
    if (above >= margin && above + height <= vh - margin) {
      side = 'top'
      top = above
    } else {
      side = 'clamped'
      top = clampY(below)
    }
  }
  return { left: clampX(anchor.left), top, side }
}
