import { ensureStyle } from './style.js'
import { NODE_PREFIX } from './strings.js'

/**
 * Collapsible stash section. `chrome` is a class/tag snapshot from the adapter
 * so this module does not query Codex.
 *
 * @param {{
 *   doc: Document,
 *   parent: Element,
 *   before?: Node | null,
 *   chrome?: {
 *     sectionTag?: string,
 *     sectionClass?: string,
 *     headingTag?: string,
 *     headingClass?: string,
 *     toggleTag?: string,
 *     toggleClass?: string,
 *     rowClass?: string,
 *   } | null,
 *   prefix?: string,
 *   strings: Record<string, string>,
 *   collapsed: boolean,
 *   rows: Array<{ threadId: string, title: string, dueLabel: string, due: boolean, missing: boolean }>,
 *   onToggle: () => void,
 *   onOpen: (threadId: string) => void,
 *   onContext: (threadId: string, x: number, y: number) => void,
 * }} options
 */
export function mountSection(options) {
  const prefix = options.prefix ?? NODE_PREFIX
  const { doc, parent, strings, rows, collapsed, chrome } = options
  ensureStyle(doc, prefix)
  const id = `${prefix}section`
  const signature = JSON.stringify({
    collapsed,
    section: strings.section,
    rows,
  })
  let section = doc.getElementById(id)
  if (
    section?.isConnected &&
    section.getAttribute('data-codex-stash-signature') === signature &&
    section.parentElement === parent
  ) {
    return section
  }

  const tag = chrome?.sectionTag || 'div'
  if (!section || section.tagName.toLowerCase() !== tag) {
    const created = doc.createElement(tag)
    created.id = id
    section?.replaceWith(created)
    section = created
  }
  section.className = chrome?.sectionClass || ''
  section.setAttribute('data-codex-stash-signature', signature)
  section.setAttribute('role', 'region')
  section.setAttribute('aria-label', strings.section)
  section.replaceChildren()

  const heading = doc.createElement(chrome?.headingTag || 'div')
  heading.id = `${prefix}heading`
  heading.className = chrome?.headingClass || ''
  const toggle = doc.createElement(chrome?.toggleTag || 'button')
  toggle.id = `${prefix}toggle`
  toggle.className = chrome?.toggleClass || ''
  if (toggle.tagName === 'BUTTON') toggle.type = 'button'
  toggle.setAttribute('aria-expanded', collapsed ? 'false' : 'true')
  toggle.textContent = strings.section
  toggle.addEventListener('click', (event) => {
    event.preventDefault()
    options.onToggle()
  })
  heading.append(toggle)
  if (rows.some((row) => row.due)) {
    const badge = doc.createElement('span')
    badge.id = `${prefix}due-count`
    badge.className = 'codex-stash-v1-due'
    badge.textContent = strings.due
    heading.append(badge)
  }
  section.append(heading)

  if (!collapsed) {
    const list = doc.createElement('div')
    list.id = `${prefix}rows`
    for (const row of rows) {
      list.append(renderRow(doc, row, chrome, strings, options.onOpen, options.onContext))
    }
    section.append(list)
  }

  if (section.parentElement !== parent) {
    if (options.before && options.before.parentNode === parent) parent.insertBefore(section, options.before)
    else parent.append(section)
  }
  return section
}

function renderRow(doc, row, chrome, strings, onOpen, onContext) {
  const wrap = doc.createElement('div')
  wrap.className = `codex-stash-v1-row${row.missing ? ' codex-stash-v1-missing' : ''}`
  wrap.setAttribute('data-codex-stash-thread-id', row.threadId)
  const button = doc.createElement('button')
  button.type = 'button'
  button.className = `${chrome?.rowClass || ''} codex-stash-v1-title`.trim()
  button.textContent = row.title
  button.disabled = Boolean(row.missing)
  button.title = row.missing ? strings.missing : row.title
  button.addEventListener('click', () => onOpen(row.threadId))
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
  wrap.addEventListener('contextmenu', (event) => {
    event.preventDefault()
    onContext(row.threadId, event.clientX, event.clientY)
  })
  return wrap
}
