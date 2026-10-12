import { SELECTOR_TABLE } from './selectors.js'
import { domThreadKey, isSendButton, isSendKey, readRouteThreadId } from './dom-thread.js'

/**
 * @param {Document} doc
 * @param {{ selectorTable?: typeof SELECTOR_TABLE, ignoreIdPrefix?: string | null }} [options]
 */
export function createAdapter(doc, options = {}) {
  const table = options.selectorTable ?? SELECTOR_TABLE
  const ignoreIdPrefix = options.ignoreIdPrefix ?? null

  function isOurNode(node) {
    if (!ignoreIdPrefix || !node) return false
    const element = node.nodeType === 1 ? node : node.parentElement
    if (!element) return false
    if (element.id?.startsWith(ignoreIdPrefix)) return true
    return Boolean(element.closest?.(`[id^="${ignoreIdPrefix}"]`))
  }

  function findSidebar() {
    for (const selector of table.sidebar) {
      const found = doc.querySelector(selector)
      if (found) return found
    }
    const scroll = doc.querySelector(table.scroll)
    return scroll?.closest?.('aside') ?? null
  }

  function nativeSections() {
    return [...doc.querySelectorAll(table.section)].filter((section) => !isOurNode(section))
  }

  function firstNative(selector) {
    return [...doc.querySelectorAll(selector)].find((node) => !isOurNode(node)) ?? null
  }

  function threadNodes() {
    return [...doc.querySelectorAll(`[${table.threadIdAttr}]`)].filter((node) => !isOurNode(node))
  }

  function findRow(threadId) {
    const key = domThreadKey(threadId)
    if (!key) return null
    return (
      threadNodes().find((node) => domThreadKey(node.getAttribute(table.threadIdAttr)) === key) ??
      null
    )
  }

  function currentRow() {
    const marked = doc.querySelector(table.current)
    const viaCurrent = marked?.closest?.(`[${table.threadIdAttr}]`)
    if (viaCurrent && !isOurNode(viaCurrent)) return viaCurrent
    const selected = doc.querySelector(table.selected)
    const viaSelected = selected?.closest?.(`[${table.threadIdAttr}]`)
    if (viaSelected && !isOurNode(viaSelected)) return viaSelected
    return null
  }

  function rowTitle(row) {
    const copy = row.cloneNode(true)
    copy.querySelectorAll('button, [data-app-action-sidebar-thread-pinned]').forEach((node) => {
      if (node !== copy) node.remove()
    })
    const text = copy.textContent?.replace(/\s+/g, ' ').trim() ?? ''
    if (!text || text === row.getAttribute(table.threadIdAttr)) return null
    return text
  }

  function composerContains(node) {
    if (!node || typeof node.closest !== 'function') return false
    if (isOurNode(node)) return false
    const root = doc.querySelector(table.composerRoot)
    if (root?.contains(node)) return true
    const footer = doc.querySelector(table.threadFooter)
    if (footer?.contains(node) && node.closest(table.composer)) return true
    return false
  }

  function readCurrentThread() {
    const sidebarRow = currentRow()
    const sidebarId = sidebarRow?.getAttribute(table.threadIdAttr)
    if (sidebarId) return { raw: sidebarId, source: 'sidebar' }
    const portal = doc.querySelector(table.conversationId)
    const portalId = portal?.getAttribute('data-above-composer-conversation-id')
    if (portalId) return { raw: portalId, source: 'composer' }
    const route = readRouteThreadId(doc)
    if (route) return { raw: route, source: 'route' }
    return { raw: null, source: null }
  }

  function probe() {
    const sidebar = findSidebar()
    const scroll = doc.querySelector(table.scroll)
    const shell = doc.querySelector(table.appShell)
    const threads = threadNodes()
    const sections = nativeSections()
    if (!sidebar && !scroll && !shell) {
      return {
        ok: false,
        status: 'no-window',
        diagnostic: 'main renderer shell is not in this document',
        tableId: table.id,
      }
    }
    if (!sidebar && !scroll) {
      return {
        ok: false,
        status: 'broken',
        diagnostic: 'app shell is present but the sidebar anchor is missing',
        tableId: table.id,
      }
    }
    if (threads.length === 0 && sections.length === 0) {
      const host = scroll || sidebar
      const interactive = [...host.querySelectorAll('a, button')].filter((node) => !isOurNode(node))
      if (interactive.length >= 2) {
        return {
          ok: false,
          status: 'broken',
          diagnostic:
            'sidebar is present but data-app-action-sidebar-thread-id and section attributes are missing',
          tableId: table.id,
        }
      }
      return {
        ok: false,
        status: 'loading',
        diagnostic: 'sidebar anchor is present and thread rows have not rendered',
        tableId: table.id,
      }
    }
    return {
      ok: true,
      status: 'healthy',
      diagnostic: null,
      tableId: table.id,
      threads: threads.length,
      sections: sections.length,
    }
  }

  function readChrome() {
    const sections = nativeSections()
    let section = null
    for (const key of table.sectionKeys) {
      section = sections.find(
        (candidate) => candidate.getAttribute('data-app-action-sidebar-section') === key,
      )
      if (section) break
    }
    section = section ?? sections[0] ?? null
    if (!section) return null
    const heading = section.querySelector(table.sectionHeading)
    const toggle = section.querySelector(table.sectionToggle)
    const row = firstNative(table.threadRow) || firstNative(`[${table.threadIdAttr}]`)
    return {
      sectionTag: section.tagName.toLowerCase(),
      sectionClass: section.className,
      headingTag: (heading?.tagName || 'DIV').toLowerCase(),
      headingClass: heading?.className || '',
      toggleTag: (toggle?.tagName || 'BUTTON').toLowerCase(),
      toggleClass: toggle?.className || '',
      rowTag: (row?.tagName || 'BUTTON').toLowerCase(),
      rowClass: row?.className || '',
    }
  }

  function mountPoint() {
    const scroll = doc.querySelector(table.scroll)
    const parent = scroll || findSidebar()
    if (!parent) return null
    const sections = [...parent.querySelectorAll(table.section)].filter((section) => !isOurNode(section))
    const pinned = sections.find(
      (section) => section.getAttribute('data-app-action-sidebar-section') === 'pinned',
    )
    if (pinned?.parentElement) {
      return { parent: pinned.parentElement, before: nextHostNode(pinned.nextSibling) }
    }
    if (sections[0]?.parentElement) {
      return { parent: sections[0].parentElement, before: sections[0] }
    }
    return { parent, before: nextHostNode(parent.firstChild) }
  }

  function nextHostNode(node) {
    let current = node
    while (current && (current.nodeType !== 1 || isOurNode(current))) current = current.nextSibling
    return current
  }

  function openThread(threadId) {
    const row = findRow(threadId)
    if (!row) return { ok: false, reason: 'not-in-sidebar' }
    row.click()
    return { ok: true }
  }

  function onUserMessage(handler) {
    const win = doc.defaultView
    function emitFromComposer() {
      const reading = readCurrentThread()
      if (reading.raw) handler(reading.raw)
    }
    function onKey(event) {
      if (!isSendKey(event) || !composerContains(event.target)) return
      emitFromComposer()
    }
    function onClick(event) {
      const button = event.target?.closest?.('button')
      if (!button || !isSendButton(button) || !composerContains(button)) return
      emitFromComposer()
    }
    function onCustom(event) {
      const raw = event.detail?.threadId
      if (typeof raw === 'string' && raw) handler(raw)
    }
    doc.addEventListener('keydown', onKey, true)
    doc.addEventListener('click', onClick, true)
    win?.addEventListener('codexhost:user-message', onCustom)
    win?.addEventListener('codex-stash:user-message', onCustom)
    return () => {
      doc.removeEventListener('keydown', onKey, true)
      doc.removeEventListener('click', onClick, true)
      win?.removeEventListener('codexhost:user-message', onCustom)
      win?.removeEventListener('codex-stash:user-message', onCustom)
    }
  }

  function observe(handler) {
    const Observer = doc.defaultView?.MutationObserver
    if (!Observer || !doc.body) return () => {}
    let scheduled = false
    let sidebar = findSidebar()
    const observer = new Observer((records) => {
      if (records.every(mutationIsOurs)) return
      if (scheduled) return
      scheduled = true
      const schedule = doc.defaultView.queueMicrotask?.bind(doc.defaultView) ?? queueMicrotask
      schedule(() => {
        scheduled = false
        const next = findSidebar()
        if (next !== sidebar) {
          sidebar = next
          rebind()
        }
        handler()
      })
    })

    function mutationIsOurs(record) {
      if (isOurNode(record.target)) return true
      const nodes = [...record.addedNodes, ...record.removedNodes]
      return nodes.length > 0 && nodes.every((node) => isOurNode(node))
    }

    function rebind() {
      observer.disconnect()
      observer.observe(doc.body, { childList: true })
      if (!sidebar) return
      observer.observe(sidebar, {
        childList: true,
        subtree: true,
        characterData: true,
        attributes: true,
        attributeFilter: ['aria-current', 'aria-selected', table.threadIdAttr],
      })
    }

    rebind()
    return () => observer.disconnect()
  }

  return {
    selectorTable: table,
    probe,
    readCurrentThread,
    getThreadTitle(threadId) {
      const row = findRow(threadId)
      return row ? rowTitle(row) : null
    },
    isThreadListed(threadId) {
      return Boolean(findRow(threadId))
    },
    openThread,
    readChrome,
    mountPoint,
    onUserMessage,
    observe,
    composerContains,
  }
}
