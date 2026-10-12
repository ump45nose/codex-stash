import { NODE_PREFIX } from './strings.js'

const STASH_ICON =
  '<svg aria-hidden="true" width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M2.5 4.25h11M3.25 4.25v7.5c0 .69.56 1.25 1.25 1.25h7c.69 0 1.25-.56 1.25-1.25v-7.5M6.5 7.25h3M2.5 2.75h11v1.5h-11z" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/></svg>'

/**
 * Add a 收纳 button to native row hover actions (next to pin/archive).
 * Slots come from the adapter; this module never queries Codex selectors.
 *
 * @param {{
 *   doc: Document,
 *   slots: Array<{ threadId: string, container: Element, buttonClass: string, buttonAttrs: Record<string, string> }>,
 *   label: string,
 *   prefix?: string,
 *   onStash: (threadId: string, anchor: DOMRect) => void,
 * }} options
 */
export function mountRowActions(options) {
  const prefix = options.prefix ?? NODE_PREFIX
  const { doc, slots } = options
  const keep = new Set()
  slots.forEach((slot) => {
    let button = [...slot.container.children].find((node) => node.id?.startsWith(`${prefix}act-`))
    if (!button || button.getAttribute('data-codex-stash-thread-id') !== slot.threadId) {
      button?.remove()
      button = doc.createElement('button')
      button.type = 'button'
      button.id = `${prefix}act-${slot.threadId}`
      button.className = slot.buttonClass
      for (const [name, value] of Object.entries(slot.buttonAttrs)) button.setAttribute(name, value)
      button.setAttribute('aria-label', options.label)
      button.setAttribute('title', options.label)
      button.setAttribute('data-codex-stash-thread-id', slot.threadId)
      const inner = doc.createElement('span')
      inner.className = slot.innerClass || ''
      inner.innerHTML = STASH_ICON
      button.append(inner)
      button.addEventListener('click', (event) => {
        event.preventDefault()
        event.stopPropagation()
        options.onStash(slot.threadId, button.getBoundingClientRect())
      })
      // Native rows navigate on pointerdown/click; keep the press local.
      button.addEventListener('pointerdown', (event) => event.stopPropagation())
      slot.container.prepend(button)
    }
    keep.add(button)
  })
  doc.querySelectorAll(`[id^="${prefix}act-"]`).forEach((node) => {
    if (!keep.has(node)) node.remove()
  })
}
