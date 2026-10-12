import { ensureStyle } from './style.js'
import { NODE_PREFIX } from './strings.js'

const DOTS =
  '<svg aria-hidden="true" focusable="false" width="16" height="16" viewBox="0 0 16 16" xmlns="http://www.w3.org/2000/svg"><circle cx="3.33" cy="8" r="1.2" fill="currentColor"/><circle cx="8" cy="8" r="1.2" fill="currentColor"/><circle cx="12.67" cy="8" r="1.2" fill="currentColor"/></svg>'

/**
 * Collapsible stash section. `chrome` is a class/markup snapshot taken from a
 * native section by the adapter, so this module does not query Codex.
 *
 * Collapse is applied in place (no rebuild) so the disclosure rotation and
 * the height transition animate like native sections.
 *
 * @param {{
 *   doc: Document,
 *   parent: Element,
 *   before?: Node | null,
 *   chrome?: Record<string, any> | null,
 *   prefix?: string,
 *   strings: Record<string, string>,
 *   collapsed: boolean,
 *   rows: Array<{ threadId: string, title: string, dueLabel: string, due: boolean, missing: boolean }>,
 *   onToggle: () => void,
 *   onOpen: (threadId: string) => void,
 *   onContext: (threadId: string, x: number, y: number, anchor?: DOMRect) => void,
 *   onSectionMenu?: (anchor: DOMRect) => void,
 * }} options
 */
export function mountSection(options) {
  const prefix = options.prefix ?? NODE_PREFIX
  const { doc, parent, strings, rows, collapsed, chrome } = options
  ensureStyle(doc, prefix)
  const id = `${prefix}section`
  const signature = JSON.stringify({ section: strings.section, rows, chrome })
  let section = doc.getElementById(id)
  const fresh =
    !section?.isConnected ||
    section.getAttribute('data-codex-stash-signature') !== signature ||
    section.parentElement !== parent
  if (fresh) section = build(options, prefix, section, signature)
  // Callbacks may close over fresh state on every render.
  section.__codexStashHandlers = options
  applyCollapsed(section, prefix, collapsed, !fresh)
  if (section.parentElement !== parent || (options.before && section.nextSibling !== options.before && fresh)) {
    if (options.before && options.before.parentNode === parent) parent.insertBefore(section, options.before)
    else parent.append(section)
  }
  return section
}

function handlers(section) {
  return section.__codexStashHandlers
}

function applyCollapsed(section, prefix, collapsed, animate) {
  const toggle = section.querySelector(`#${prefix}toggle`)
  const list = section.querySelector(`#${prefix}rows-wrap`)
  toggle?.setAttribute('aria-expanded', collapsed ? 'false' : 'true')
  const chevron = toggle?.querySelector('svg')
  // The donor may carry its own state (rotate-0 / -rotate-90); set ours explicitly.
  chevron?.classList.toggle('-rotate-90', collapsed)
  chevron?.classList.toggle('rotate-0', !collapsed)
  section.setAttribute('data-codex-stash-collapsed', String(collapsed))
  if (list) {
    if (!animate) list.classList.add('codex-stash-v1-noanim')
    list.setAttribute('data-collapsed', String(collapsed))
    list.setAttribute('aria-hidden', String(collapsed))
    if (!animate) {
      void list.offsetHeight
      list.classList.remove('codex-stash-v1-noanim')
    }
  }
}

function build(options, prefix, existing, signature) {
  const { doc, strings, rows, chrome } = options
  const tag = chrome?.sectionTag || 'div'
  let section = existing
  if (!section || section.tagName.toLowerCase() !== tag) {
    const created = doc.createElement(tag)
    created.id = `${prefix}section`
    section?.replaceWith(created)
    section = created
  }
  section.className = chrome?.sectionClass || ''
  section.setAttribute('data-codex-stash-signature', signature)
  section.setAttribute('role', 'region')
  section.setAttribute('aria-label', strings.section)
  section.replaceChildren()

  const host = chrome?.innerClass ? doc.createElement('div') : section
  if (host !== section) {
    host.className = chrome.innerClass
    section.append(host)
  }
  const heading = doc.createElement(chrome?.headingTag || 'div')
  heading.id = `${prefix}heading`
  heading.className = `${chrome?.headingClass || ''} codex-stash-v1-heading`.trim()
  let toggleParent = heading
  if (chrome?.headingTextClass) {
    toggleParent = doc.createElement('div')
    toggleParent.className = chrome.headingTextClass
    heading.append(toggleParent)
  }
  const toggle = doc.createElement(chrome?.toggleTag || 'button')
  toggle.id = `${prefix}toggle`
  toggle.className = chrome?.toggleClass || ''
  if (toggle.tagName === 'BUTTON') toggle.type = 'button'
  const text = doc.createElement('span')
  text.className = 'min-w-0 truncate'
  text.textContent = strings.section
  toggle.append(text)
  if (chrome?.chevronSvg) {
    const svg = fromMarkup(doc, chrome.chevronSvg)
    if (svg) toggle.append(svg)
  }
  toggle.addEventListener('click', (event) => {
    event.preventDefault()
    handlers(section).onToggle()
  })
  toggleParent.append(toggle)
  if (rows.some((row) => row.due)) {
    const badge = doc.createElement('span')
    badge.id = `${prefix}due-count`
    badge.className = 'codex-stash-v1-due'
    badge.textContent = strings.due
    toggleParent.append(badge)
  }
  // Right-side hover affordance, same wrapper classes as the native header.
  const actions = doc.createElement('div')
  actions.className = chrome?.headerActionsClass || 'codex-stash-v1-header-actions'
  const reveal = doc.createElement('div')
  reveal.className = chrome?.headerRevealClass || 'codex-stash-v1-reveal'
  const more = dotsButton(doc, chrome?.headerButton, `${strings.section} · ${strings.options}`, chrome?.dotsSvg)
  more.id = `${prefix}section-more`
  more.addEventListener('click', (event) => {
    event.preventDefault()
    event.stopPropagation()
    handlers(section).onSectionMenu?.(more.getBoundingClientRect())
  })
  reveal.append(more)
  actions.append(reveal)
  heading.append(actions)
  host.append(heading)

  const wrap = doc.createElement('div')
  wrap.id = `${prefix}rows-wrap`
  wrap.className = 'codex-stash-v1-rows-wrap'
  const list = doc.createElement('div')
  list.id = `${prefix}rows`
  list.className = 'codex-stash-v1-rows'
  list.setAttribute('role', 'list')
  for (const row of rows) list.append(renderRow(doc, section, row, chrome, strings))
  wrap.append(list)
  host.append(wrap)
  return section
}

function dotsButton(doc, donor, label, svgMarkup) {
  const button = doc.createElement('button')
  button.type = 'button'
  button.className = donor?.className || 'codex-stash-v1-dots'
  for (const [name, value] of Object.entries(donor?.attrs ?? {})) button.setAttribute(name, value)
  button.setAttribute('aria-label', label)
  button.setAttribute('aria-haspopup', 'menu')
  const inner = doc.createElement('span')
  inner.className = donor?.innerClass || ''
  const svg = fromMarkup(doc, svgMarkup || DOTS) || fromMarkup(doc, DOTS)
  inner.append(svg)
  button.append(inner)
  return button
}

function fromMarkup(doc, markup) {
  const tpl = doc.createElement('template')
  tpl.innerHTML = markup
  const svg = tpl.content.firstElementChild
  return svg && svg.tagName.toLowerCase() === 'svg' ? svg : null
}

function renderRow(doc, section, row, chrome, strings) {
  const wrap = doc.createElement('div')
  wrap.className = `${chrome?.rowClass || ''} codex-stash-v1-row${row.missing ? ' codex-stash-v1-missing' : ''}`.trim()
  wrap.setAttribute('role', 'listitem')
  wrap.tabIndex = 0
  wrap.setAttribute('data-codex-stash-thread-id', row.threadId)
  const button = doc.createElement('button')
  button.type = 'button'
  button.className = 'codex-stash-v1-title'
  button.textContent = row.title
  button.title = row.missing ? `${row.title} · ${strings.missing}` : row.title
  const date = doc.createElement('time')
  date.className = 'codex-stash-v1-date'
  date.textContent = row.dueLabel
  wrap.append(button, date)
  if (row.due) {
    const due = doc.createElement('span')
    due.className = 'codex-stash-v1-due'
    due.textContent = strings.due
    wrap.append(due)
  }
  const more = dotsButton(doc, chrome?.rowButton, strings.options, chrome?.dotsSvg)
  more.classList.add('codex-stash-v1-row-more')
  more.addEventListener('click', (event) => {
    event.preventDefault()
    event.stopPropagation()
    const rect = more.getBoundingClientRect()
    handlers(section).onContext(row.threadId, rect.left, rect.bottom, rect)
  })
  wrap.append(more)
  wrap.addEventListener('click', () => handlers(section).onOpen(row.threadId))
  wrap.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') handlers(section).onOpen(row.threadId)
  })
  wrap.addEventListener('contextmenu', (event) => {
    event.preventDefault()
    handlers(section).onContext(row.threadId, event.clientX, event.clientY)
  })
  return wrap
}
