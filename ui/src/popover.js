import { ensureStyle } from './style.js'
import { NODE_PREFIX } from './strings.js'

const PRESET_KEYS = ['tomorrow', 'in3days', 'nextMonday']

/**
 * @param {{
 *   doc: Document,
 *   strings: Record<string, string>,
 *   message?: string | null,
 *   hotkeyLabel?: string,
 *   editing?: boolean,
 *   left: number,
 *   top: number,
 *   prefix?: string,
 *   onPreset: (preset: string) => void,
 *   onCustom: (value: string) => void,
 *   onClose: () => void,
 * }} options
 */
export function mountPopover(options) {
  const prefix = options.prefix ?? NODE_PREFIX
  const { doc, strings } = options
  ensureStyle(doc, prefix)
  doc.getElementById(`${prefix}popover`)?.remove()
  const pop = doc.createElement('div')
  pop.id = `${prefix}popover`
  pop.setAttribute('role', 'dialog')
  pop.setAttribute('aria-label', strings.stashCurrent)
  pop.style.left = `${Math.max(8, options.left)}px`
  pop.style.top = `${Math.max(8, options.top)}px`

  const heading = doc.createElement('p')
  heading.textContent = options.editing
    ? strings.changeDate
    : options.hotkeyLabel
      ? `${strings.stashCurrent} (${options.hotkeyLabel})`
      : strings.stashCurrent
  pop.append(heading)

  if (options.message) {
    const note = doc.createElement('p')
    note.textContent = options.message
    pop.append(note)
  } else {
    for (const preset of PRESET_KEYS) {
      const button = doc.createElement('button')
      button.type = 'button'
      button.dataset.preset = preset
      button.textContent = strings[preset]
      button.addEventListener('click', () => options.onPreset(preset))
      pop.append(button)
    }
    const form = doc.createElement('form')
    const input = doc.createElement('input')
    input.type = 'date'
    input.name = 'due'
    input.setAttribute('aria-label', strings.custom)
    const submit = doc.createElement('button')
    submit.type = 'submit'
    submit.textContent = strings.custom
    form.append(input, submit)
    form.addEventListener('submit', (event) => {
      event.preventDefault()
      if (input.value) options.onCustom(input.value)
    })
    pop.append(form)
  }

  ;(doc.body || doc.documentElement).append(pop)
  return attachDismiss(doc, pop, options.onClose)
}

/**
 * @param {{
 *   doc: Document,
 *   strings: Record<string, string>,
 *   left: number,
 *   top: number,
 *   prefix?: string,
 *   onChangeDate: () => void,
 *   onRemove: () => void,
 *   onClose: () => void,
 * }} options
 */
export function mountMenu(options) {
  const prefix = options.prefix ?? NODE_PREFIX
  const { doc, strings } = options
  ensureStyle(doc, prefix)
  doc.getElementById(`${prefix}menu`)?.remove()
  const menu = doc.createElement('div')
  menu.id = `${prefix}menu`
  menu.setAttribute('role', 'menu')
  menu.style.left = `${Math.max(8, options.left)}px`
  menu.style.top = `${Math.max(8, options.top)}px`
  for (const [label, run] of [
    [strings.changeDate, options.onChangeDate],
    [strings.remove, options.onRemove],
  ]) {
    const button = doc.createElement('button')
    button.type = 'button'
    button.setAttribute('role', 'menuitem')
    button.textContent = label
    button.addEventListener('click', () => run())
    menu.append(button)
  }
  ;(doc.body || doc.documentElement).append(menu)
  return attachDismiss(doc, menu, options.onClose)
}

function attachDismiss(doc, node, onClose) {
  let closed = false
  function close() {
    if (closed) return
    closed = true
    doc.removeEventListener('keydown', onKey)
    doc.removeEventListener('pointerdown', onPointer)
    node.remove()
  }
  function onKey(event) {
    if (event.key !== 'Escape') return
    close()
    onClose()
  }
  function onPointer(event) {
    if (node.contains(event.target)) return
    close()
    onClose()
  }
  doc.addEventListener('keydown', onKey)
  doc.addEventListener('pointerdown', onPointer)
  return { close, node }
}
