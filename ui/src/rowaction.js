import { STASH_ICON, svgFrom } from './icons.js'
import { NODE_PREFIX } from './strings.js'
import { attachTooltip } from './tooltip.js'

/**
 * Add a 收纳 button to native row hover actions (next to pin / archive).
 *
 * The button is inserted as a direct child of the hover group, never inside a
 * native Radix tooltip trigger (`<span data-state class="contents">`), and it
 * copies only presentation (class + data-color/variant/size/pill). It carries
 * its own label and tooltip, so the native pin tooltip cannot appear for it.
 *
 * @param {{
 *   doc: Document,
 *   slots: Array<{ threadId: string, container: Element, before?: Element | null, buttonClass: string, buttonAttrs: Record<string, string>, innerClass?: string }>,
 *   label: string,
 *   shortcut?: string | null,
 *   tooltipClass?: string,
 *   zoom?: () => number,
 *   prefix?: string,
 *   onStash: (threadId: string, anchor: DOMRect) => void,
 * }} options
 */
export function mountRowActions(options) {
  const prefix = options.prefix ?? NODE_PREFIX
  const { doc, slots } = options
  const keep = new Set()
  for (const slot of slots) {
    let button = [...slot.container.children].find((node) => node.id?.startsWith(`${prefix}act-`))
    if (!button || button.getAttribute('data-codex-stash-thread-id') !== slot.threadId) {
      button?.remove()
      button = doc.createElement('button')
      button.type = 'button'
      button.id = `${prefix}act-${slot.threadId}`
      button.className = slot.buttonClass
      for (const [name, value] of Object.entries(slot.buttonAttrs)) button.setAttribute(name, value)
      button.setAttribute('aria-label', options.label)
      button.setAttribute('data-codex-stash-thread-id', slot.threadId)
      const inner = doc.createElement('span')
      inner.className = slot.innerClass || ''
      inner.append(svgFrom(doc, STASH_ICON))
      button.append(inner)
      attachTooltip(button, {
        text: options.label,
        shortcut: options.shortcut,
        className: options.tooltipClass,
        zoom: options.zoom,
        prefix,
      })
      button.addEventListener('click', (event) => {
        event.preventDefault()
        event.stopPropagation()
        doc.getElementById(`${prefix}tooltip`)?.remove()
        options.onStash(slot.threadId, button.getBoundingClientRect())
      })
      // Native rows navigate on pointerdown/click; keep the press local.
      button.addEventListener('pointerdown', (event) => event.stopPropagation())
      const before = slot.before && slot.before.parentNode === slot.container ? slot.before : slot.container.firstChild
      slot.container.insertBefore(button, before)
    }
    keep.add(button)
  }
  doc.querySelectorAll(`[id^="${prefix}act-"]`).forEach((node) => {
    if (!keep.has(node)) node.remove()
  })
}
