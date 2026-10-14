import { placeFloating } from './floating.js'
import { NODE_PREFIX } from './strings.js'

/**
 * Our own tooltip (never a native Radix trigger), styled with the native
 * compact tooltip classes passed in by the caller.
 *
 * @param {Element} target
 * @param {{ text: string, shortcut?: string | null, className?: string, zoom?: () => number, prefix?: string, delayMs?: number }} options
 */
export function attachTooltip(target, options) {
  const doc = target.ownerDocument
  const win = doc.defaultView
  const prefix = options.prefix ?? NODE_PREFIX
  let timer = null
  function hide() {
    if (timer) win?.clearTimeout(timer)
    timer = null
    doc.getElementById(`${prefix}tooltip`)?.remove()
  }
  function show() {
    hide()
    const tip = doc.createElement('div')
    tip.id = `${prefix}tooltip`
    tip.setAttribute('role', 'tooltip')
    tip.className = `${options.className || ''} codex-stash-v1-tooltip`.trim()
    const row = doc.createElement('div')
    row.className = 'flex gap-2 items-center'
    const text = doc.createElement('div')
    text.className = 'min-w-0'
    text.textContent = options.text
    row.append(text)
    if (options.shortcut) {
      const kbd = doc.createElement('span')
      kbd.className = 'codex-stash-v1-tooltip-kbd'
      kbd.textContent = options.shortcut
      row.append(kbd)
    }
    tip.append(row)
    ;(doc.body || doc.documentElement).append(tip)
    const rect = target.getBoundingClientRect()
    // Prefer above, like native row action tooltips.
    const height = tip.getBoundingClientRect().height || 24
    placeFloating(tip, {
      anchor: { left: rect.left + rect.width / 2 - (tip.getBoundingClientRect().width || 0) / 2, top: rect.top - height - 8, bottom: rect.top - height - 8 },
      zoom: options.zoom?.() ?? 1,
    })
    target.setAttribute('aria-describedby', tip.id)
  }
  function onEnter() {
    hide()
    timer = win?.setTimeout(show, options.delayMs ?? 300) ?? null
  }
  target.addEventListener('pointerenter', onEnter)
  target.addEventListener('pointerleave', hide)
  target.addEventListener('pointerdown', hide)
  target.addEventListener('focus', onEnter)
  target.addEventListener('blur', hide)
  return { hide, show }
}
