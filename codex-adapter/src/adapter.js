import { SELECTOR_TABLE } from './selectors.js'
import { domThreadKey, isSendButton, isSendKey, readRouteThreadId } from './dom-thread.js'

/**
 * @param {Document} doc
 * @param {{ selectorTable?: typeof SELECTOR_TABLE, ignoreIdPrefix?: string | null }} [options]
 */
/**
 * Class strings of Codex's Radix dropdown menu (captured live 2026-10-12, see
 * SELECTORS.md). Presentation only; the menu itself is our own node.
 */
export const NATIVE_MENU_CHROME = {
  contentClass:
    'no-drag z-50 m-px flex select-none flex-col overflow-y-auto bg-surface-elevated-secondary/90 text-default ring-(--color-border-overlay) ring-(length:--dropdown-overlay-ring-width) shadow-(--shadow-dropdown-overlay) backdrop-blur-sm rounded-2xl p-[var(--app-menu-gutter,var(--spacing))] min-w-[var(--app-menu-min-width,220px)]',
  itemClass: 'no-drag _itemBase_14z1j_2 rounded-xl text-default group _itemInteractive_14z1j_2 flex flex-col',
  rowClass: 'flex w-full min-w-0 items-center gap-[var(--spacing-menu-item-content,calc(var(--spacing)*1.5))]',
  labelClass: 'text-tertiary',
  separatorClass: '',
}

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

  /** Normalized section key: pinned / projects / recent / … or '' */
  function sectionKey(section) {
    for (const attr of table.sectionKeyAttrs ?? ['data-app-action-sidebar-section']) {
      const raw = section.getAttribute(attr)
      if (!raw) continue
      const key = raw.trim().toLowerCase()
      if (key === 'recents') return 'recent'
      return key
    }
    return ''
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
    for (const selector of [table.threadActive, table.threadSelected]) {
      if (!selector) continue
      const row = firstNative(selector)
      if (row?.hasAttribute(table.threadIdAttr)) return row
    }
    const marked = doc.querySelector(table.current)
    const viaCurrent = marked?.closest?.(`[${table.threadIdAttr}]`)
    if (viaCurrent && !isOurNode(viaCurrent)) return viaCurrent
    const selected = doc.querySelector(table.selected)
    const viaSelected = selected?.closest?.(`[${table.threadIdAttr}]`)
    if (viaSelected && !isOurNode(viaSelected)) return viaSelected
    return null
  }

  function rowTitle(row) {
    const attrTitle = table.threadTitleAttr && row.getAttribute(table.threadTitleAttr)?.trim()
    if (attrTitle) return attrTitle
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
    // Codex keeps earlier thread views mounted (hidden), so there can be
    // several composer roots; the event target's own ancestor decides.
    if (node.closest(table.composerRoot)) return true
    if (node.closest(table.threadFooter) && node.closest(table.composer)) return true
    return false
  }

  function isShown(element) {
    if (typeof element.checkVisibility === 'function') {
      return element.checkVisibility({ visibilityProperty: true })
    }
    for (let node = element; node && node.nodeType === 1; node = node.parentElement) {
      if (node.hidden || node.style?.display === 'none') return false
    }
    return true
  }

  /**
   * The above-composer portal is itself display:none when empty, and stale
   * portals of cached (hidden) thread views stay in the DOM. Pick the portal
   * whose nearest scope with a composer root has that composer visible.
   */
  function activePortal() {
    const portals = [...doc.querySelectorAll(table.conversationId)].filter((node) => !isOurNode(node))
    if (portals.length <= 1) {
      const only = portals[0]
      if (!only) return null
      const scopeRoot = composerScope(only)
      return !scopeRoot || isShown(scopeRoot) ? only : null
    }
    for (const portal of portals) {
      const scopeRoot = composerScope(portal)
      if (scopeRoot && isShown(scopeRoot)) return portal
    }
    return null
  }

  function composerScope(portal) {
    for (let node = portal.parentElement; node; node = node.parentElement) {
      const root = node.querySelector(table.composerRoot)
      if (root) return root
    }
    return null
  }

  function readCurrentThread() {
    const sidebarRow = currentRow()
    const sidebarId = sidebarRow?.getAttribute(table.threadIdAttr)
    if (sidebarId) return { raw: sidebarId, source: 'sidebar' }
    const portal = activePortal()
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

  // Collapsed native sections render no rows; keep the last row class seen.
  let lastRowClass = ''
  function readChrome() {
    const sections = nativeSections()
    let section = null
    for (const key of table.sectionKeys) {
      section = sections.find(
        (candidate) => sectionKey(candidate) === key,
      )
      if (section) break
    }
    section = section ?? sections[0] ?? null
    if (!section) return null
    const toggle = section.querySelector(table.sectionToggle)
    const heading =
      section.querySelector(table.sectionHeading) ||
      (table.sectionTitleRow && toggle?.closest(table.sectionTitleRow)) ||
      null
    // Wrapper between the title row and the toggle (carries text colour/weight).
    let headingTextClass = ''
    if (heading && toggle) {
      let node = toggle.parentElement
      while (node && node.parentElement !== heading) node = node.parentElement
      headingTextClass = node?.className || ''
    }
    const inner = section.firstElementChild
    const chevron = toggle?.querySelector('svg')
    // Right side of the native header: wrapper > hover-reveal > "..." button.
    let headerActionsClass = ''
    let headerRevealClass = ''
    let headerButton = null
    let dotsSvg = ''
    if (heading) {
      const menuButton = [...heading.querySelectorAll('button[aria-haspopup="menu"]')].find((b) => b !== toggle)
      if (menuButton) {
        const reveal = menuButton.parentElement
        const actions = reveal?.parentElement
        if (actions && actions.parentElement === heading) {
          headerActionsClass = actions.className
          headerRevealClass = reveal.className
        }
        headerButton = donorButton(menuButton)
        dotsSvg = menuButton.querySelector('svg')?.outerHTML || ''
      }
    }
    lastHeaderChrome = headerButton
      ? { headerActionsClass, headerRevealClass, headerButton, dotsSvg }
      : lastHeaderChrome
    const pill = firstRowPill()
    if (pill) lastRowButton = donorButton(pill)
    const row = firstNative(table.threadRow) || firstNative(`[${table.threadIdAttr}]`)
    return {
      sectionTag: section.tagName.toLowerCase(),
      sectionClass: section.className,
      innerClass: inner && inner !== heading && heading && inner.contains(heading) ? inner.className : '',
      headingTag: (heading?.tagName || 'DIV').toLowerCase(),
      headingClass: heading?.className || '',
      headingTextClass,
      chevronSvg: chevron ? chevron.outerHTML : '',
      toggleTag: (toggle?.tagName || 'BUTTON').toLowerCase(),
      toggleClass: toggle?.className || '',
      rowTag: (row?.tagName || 'BUTTON').toLowerCase(),
      rowClass: (lastRowClass = row?.className || lastRowClass),
      ...(lastHeaderChrome ?? {}),
      rowButton: lastRowButton,
    }
  }

  let lastHeaderChrome = null
  let lastRowButton = null
  const DONOR_ATTRS = ['data-color', 'data-variant', 'data-squircle', 'data-uniform', 'data-size', 'data-pill']

  function donorButton(button) {
    const attrs = {}
    for (const name of DONOR_ATTRS) {
      if (button.hasAttribute(name)) attrs[name] = button.getAttribute(name)
    }
    return { className: button.className, attrs, innerClass: button.firstElementChild?.tagName === 'SPAN' ? button.firstElementChild.className : '' }
  }

  /** Native row hover-action container (holds pin / archive pills). */
  function rowActionContainer(row) {
    const pill = row.querySelector(table.rowHoverActions)
    return pill?.parentElement ?? null
  }

  function firstRowPill() {
    for (const row of threadNodes()) {
      const pill = row.querySelector(table.rowHoverActions)
      if (pill) return pill
    }
    return null
  }

  /** Rendered native rows that can host a 收纳 hover button. */
  function rowActionSlots() {
    const slots = []
    for (const row of threadNodes()) {
      const key = domThreadKey(row.getAttribute(table.threadIdAttr))
      if (!key) continue
      const container = rowActionContainer(row)
      const pill = container?.querySelector(table.rowHoverActions)
      if (!container || !pill) continue
      const donor = donorButton(pill)
      slots.push({ threadId: key, container, buttonClass: donor.className, buttonAttrs: donor.attrs, innerClass: donor.innerClass })
    }
    return slots
  }

  /** Stable id of the native row containing `node`, or null. */
  function threadIdFromNode(node) {
    const element = node?.nodeType === 1 ? node : node?.parentElement
    if (!element || isOurNode(element)) return null
    const row = element.closest?.(`[${table.threadIdAttr}]`)
    return row ? domThreadKey(row.getAttribute(table.threadIdAttr)) : null
  }

  /** Product of CSS zoom from the sidebar up (live builds zoom the page surface). */
  function uiZoom() {
    const win = doc.defaultView
    let zoom = 1
    for (let node = findSidebar(); node && node.nodeType === 1; node = node.parentElement) {
      const value = Number.parseFloat(win?.getComputedStyle?.(node)?.zoom || '1')
      if (Number.isFinite(value) && value > 0) zoom *= value
    }
    return zoom
  }

  function mountPoint() {
    const scroll = doc.querySelector(table.scroll)
    const parent = scroll || findSidebar()
    if (!parent) return null
    const sections = [...parent.querySelectorAll(table.section)].filter((section) => !isOurNode(section))
    const pinned = sections.find((section) => sectionKey(section) === 'pinned')
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

  /**
   * Click the native row for this id. Collapsed native sections do not render
   * their rows, so when the row is absent each collapsed section is expanded
   * in turn, searched, and collapsed again (the user's layout is restored).
   */
  async function openThread(threadId, { waitMs = 600, step = 50 } = {}) {
    const direct = findRow(threadId)
    if (direct) {
      direct.click()
      return { ok: true }
    }
    if (!domThreadKey(threadId)) return { ok: false, reason: 'not-in-sidebar' }
    const collapsedAttr = table.sectionCollapsedAttr
    const collapsed = nativeSections().filter((section) => {
      const toggle = section.querySelector(table.sectionToggle)
      return (
        toggle &&
        (section.getAttribute(collapsedAttr) === 'true' ||
          toggle.getAttribute('aria-expanded') === 'false')
      )
    })
    for (const section of collapsed) {
      const toggle = section.querySelector(table.sectionToggle)
      toggle.click()
      let row = null
      for (let waited = 0; waited <= waitMs && !row; waited += step) {
        row = findRow(threadId)
        if (!row) await sleep(step)
      }
      if (row) row.click()
      // Restore: re-query the toggle, React may have re-rendered it.
      const again = section.isConnected ? section.querySelector(table.sectionToggle) : null
      if (again && again.getAttribute('aria-expanded') === 'true') again.click()
      if (row) return { ok: true, expanded: sectionKey(section) || true }
    }
    return { ok: false, reason: 'not-in-sidebar' }
  }

  function sleep(ms) {
    const win = doc.defaultView
    return new Promise((resolve) => (win?.setTimeout ?? setTimeout)(resolve, ms))
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
        attributeFilter: [
          'aria-current',
          'aria-selected',
          table.threadIdAttr,
          'data-app-action-sidebar-thread-active',
          'data-app-action-sidebar-thread-selected',
        ],
      })
    }

    rebind()
    return () => observer.disconnect()
  }

  return {
    selectorTable: table,
    probe,
    readCurrentThread,
    /**
     * Display title of the open thread when its row is not rendered.
     * The renderer document.title is the open thread's title in live builds.
     * Used for display only, never to derive an id.
     */
    readCurrentTitle() {
      const row = currentRow()
      if (row) return rowTitle(row)
      const title = doc.title?.replace(/\s+/g, ' ').trim()
      if (!title || /^(ChatGPT|Codex)$/i.test(title)) return null
      return title
    },
    getThreadTitle(threadId) {
      const row = findRow(threadId)
      return row ? rowTitle(row) : null
    },
    isThreadListed(threadId) {
      return Boolean(findRow(threadId))
    },
    openThread,
    readChrome,
    sectionKey,
    rowActionSlots,
    threadIdFromNode,
    uiZoom,
    menuChrome: () => NATIVE_MENU_CHROME,
    mountPoint,
    onUserMessage,
    observe,
    composerContains,
  }
}
