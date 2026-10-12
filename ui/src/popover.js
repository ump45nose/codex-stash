import { placeFloating } from './floating.js'
import { CHECK_ICON, svgFrom } from './icons.js'
import { ensureStyle } from './style.js'
import { NODE_PREFIX } from './strings.js'

const PRESET_KEYS = ['tomorrow', 'in3days', 'nextMonday']

/**
 * @typedef {{ contentClass?: string, itemClass?: string, rowClass?: string, labelClass?: string, separatorClass?: string }} MenuChrome
 * @typedef {{ left: number, top: number, right?: number, bottom?: number }} Anchor
 */

function frame(doc, prefix, id, role, chrome, label) {
  ensureStyle(doc, prefix)
  doc.getElementById(`${prefix}${id}`)?.remove()
  const node = doc.createElement('div')
  node.id = `${prefix}${id}`
  node.setAttribute('role', role)
  if (label) node.setAttribute('aria-label', label)
  node.className = `${chrome?.contentClass || ''} codex-stash-v1-floating`.trim()
  node.tabIndex = -1
  return node
}

function item(doc, chrome, label, shortcut, run, checked) {
  const el = doc.createElement('div')
  el.setAttribute('role', checked === undefined || checked === null ? 'menuitem' : 'menuitemradio')
  if (checked !== undefined && checked !== null) el.setAttribute('aria-checked', String(Boolean(checked)))
  el.tabIndex = -1
  el.className = `${chrome?.itemClass || ''} codex-stash-v1-item`.trim()
  const row = doc.createElement('div')
  row.className = chrome?.rowClass || 'codex-stash-v1-item-row'
  const text = doc.createElement('span')
  text.className = 'flex-1 min-w-0 truncate codex-stash-v1-item-label'
  text.textContent = label
  row.append(text)
  if (shortcut) {
    const kbd = doc.createElement('kbd')
    kbd.className = 'codex-stash-v1-kbd'
    kbd.textContent = shortcut
    row.append(kbd)
  }
  if (checked) {
    const check = svgFrom(doc, CHECK_ICON)
    check.setAttribute('class', 'icon-xs shrink-0 opacity-75 codex-stash-v1-check')
    row.append(check)
  }
  el.append(row)
  el.addEventListener('mouseenter', () => el.setAttribute('data-highlighted', ''))
  el.addEventListener('mouseleave', () => el.removeAttribute('data-highlighted'))
  el.addEventListener('click', (event) => {
    event.preventDefault()
    run()
  })
  el.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      run()
    }
  })
  return el
}

function label(doc, chrome, text) {
  const el = doc.createElement('div')
  el.className = `${chrome?.labelClass || ''} codex-stash-v1-label`.trim()
  el.textContent = text
  return el
}

function separator(doc, chrome) {
  const el = doc.createElement('div')
  el.setAttribute('role', 'separator')
  el.className = `${chrome?.separatorClass || ''} codex-stash-v1-sep`.trim()
  return el
}

/**
 * Stash / change-date chooser. Centred when `anchor` is null (hotkey).
 *
 * @param {{
 *   doc: Document,
 *   strings: Record<string, string>,
 *   message?: string | null,
 *   title?: string | null,
 *   hotkeyLabel?: string,
 *   editing?: boolean,
 *   anchor?: Anchor | null,
 *   left?: number,
 *   top?: number,
 *   zoom?: number,
 *   chrome?: MenuChrome | null,
 *   prefix?: string,
 *   onPreset: (preset: string) => void,
 *   onCustom: (value: string) => void,
 *   onClose: () => void,
 * }} options
 */
export function mountPopover(options) {
  const prefix = options.prefix ?? NODE_PREFIX
  const { doc, strings, chrome } = options
  const heading = options.editing ? strings.changeDate : options.heading || strings.stashCurrent
  const pop = frame(doc, prefix, 'popover', 'dialog', chrome, heading)
  pop.append(label(doc, chrome, options.editing || !options.hotkeyLabel ? heading : `${heading} (${options.hotkeyLabel})`))
  if (options.title) {
    const t = label(doc, chrome, options.title)
    t.classList.add('codex-stash-v1-subject')
    pop.append(t)
  }
  if (options.message) {
    pop.append(label(doc, chrome, options.message))
  } else {
    for (const preset of PRESET_KEYS) {
      const el = item(doc, chrome, strings[preset], null, () => options.onPreset(preset))
      el.dataset.preset = preset
      pop.append(el)
    }
    pop.append(separator(doc, chrome))
    const form = doc.createElement('form')
    form.className = 'codex-stash-v1-form'
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
  placeFloating(pop, { anchor: anchorOf(options), zoom: options.zoom })
  pop.querySelector('[role^=menuitem]')?.focus?.()
  return attachDismiss(doc, pop, options.onClose)
}

/**
 * Generic native-styled menu.
 *
 * @param {{
 *   doc: Document,
 *   strings: Record<string, string>,
 *   items?: Array<{ label: string, shortcut?: string | null, run: () => void, id?: string, checked?: boolean }>,
 *   anchor?: Anchor | null,
 *   left?: number,
 *   top?: number,
 *   zoom?: number,
 *   chrome?: MenuChrome | null,
 *   prefix?: string,
 *   changeDateShortcut?: string | null,
 *   removeShortcut?: string | null,
 *   onChangeDate?: () => void,
 *   onRemove?: () => void,
 *   onClose: () => void,
 * }} options
 */
export function mountMenu(options) {
  const prefix = options.prefix ?? NODE_PREFIX
  const { doc, strings, chrome } = options
  const menu = frame(doc, prefix, 'menu', 'menu', chrome, null)
  const items = options.items ?? [
    { id: 'change-date', label: strings.changeDate, shortcut: options.changeDateShortcut ?? null, run: () => options.onChangeDate?.() },
    { id: 'remove', label: strings.remove, shortcut: options.removeShortcut ?? null, run: () => options.onRemove?.() },
  ]
  for (const entry of items) {
    const el = item(doc, chrome, entry.label, entry.shortcut ?? null, entry.run, entry.checked)
    if (entry.id) el.dataset.action = entry.id
    menu.append(el)
  }
  ;(doc.body || doc.documentElement).append(menu)
  placeFloating(menu, { anchor: anchorOf(options), zoom: options.zoom })
  return attachDismiss(doc, menu, options.onClose)
}

function anchorOf(options) {
  if (options.anchor !== undefined) return options.anchor
  if (typeof options.left === 'number' && typeof options.top === 'number') {
    return { left: options.left, top: options.top, bottom: options.top }
  }
  return null
}

function attachDismiss(doc, node, onClose) {
  const win = doc.defaultView
  let closed = false
  function close() {
    if (closed) return
    closed = true
    doc.removeEventListener('keydown', onKey, true)
    doc.removeEventListener('pointerdown', onPointer, true)
    win?.removeEventListener('resize', onResize)
    win?.removeEventListener('blur', onResize)
    node.remove()
  }
  function dismiss() {
    close()
    onClose()
  }
  function onKey(event) {
    if (event.key === 'Escape') {
      event.stopPropagation()
      dismiss()
      return
    }
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      const items = [...node.querySelectorAll('[role^=menuitem]')]
      if (!items.length) return
      event.preventDefault()
      const at = items.indexOf(doc.activeElement)
      const next = event.key === 'ArrowDown' ? (at + 1) % items.length : (at - 1 + items.length) % items.length
      items.forEach((el) => el.removeAttribute('data-highlighted'))
      items[next].setAttribute('data-highlighted', '')
      items[next].focus?.()
    }
  }
  function onPointer(event) {
    if (node.contains(event.target)) return
    dismiss()
  }
  function onResize() {
    dismiss()
  }
  doc.addEventListener('keydown', onKey, true)
  doc.addEventListener('pointerdown', onPointer, true)
  win?.addEventListener('resize', onResize)
  win?.addEventListener('blur', onResize)
  return { close, node }
}
