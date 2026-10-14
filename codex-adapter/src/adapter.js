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

/** Native compact tooltip classes (captured live from 归档聊天). Presentation only. */
export const NATIVE_TOOLTIP_CLASS =
  'w-fit text-sm whitespace-normal break-words min-h-min select-none z-50 _textTheme_8iuk0_2 text-center rounded-2xl border border-(color:--color-border-tooltip) bg-(--color-background-tooltip) text-(color:--color-text-tooltip) leading-4.5 font-(weight:--tooltip-compact-font-weight) tracking-(--tracking-tooltip) shadow-(--shadow-tooltip) px-3 py-1.25 pointer-events-none'

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

  /**
   * Stable thread id of a native row. Codex 26.1007 keeps freshly created
   * chats in the sidebar as `local:client-new-thread:<uuid>` even after the
   * conversation is persisted; the real id is then only on the row's React
   * props (`conversationId`). Pending ids are never used as stash keys.
   */
  function rowKey(row) {
    const direct = domThreadKey(row.getAttribute(table.threadIdAttr))
    if (direct) return direct
    return conversationIdFromProps(row)
  }

  function conversationIdFromProps(node) {
    const fiberKey = Object.keys(node).find((k) => k.startsWith('__reactFiber'))
    let fiber = fiberKey ? node[fiberKey] : null
    for (let depth = 0; fiber && depth < 25; depth++, fiber = fiber.return) {
      const value = fiber.memoizedProps?.conversationId
      if (typeof value === 'string') {
        const key = domThreadKey(value)
        if (key) return key
      }
    }
    return null
  }

  const HOST_ATTR = 'data-app-action-sidebar-thread-host-id'

  /**
   * Codex host of a row: `local`, or e.g. `remote-ssh-discovered:<host>` for
   * threads on a remote machine. Those rows use the same `local:<id>` id
   * scheme, so the host is part of the thread's identity for navigation.
   */
  function rowHost(row) {
    const attr = row?.getAttribute?.(HOST_ATTR)?.trim()
    if (attr) return attr
    const fiberKey = row && Object.keys(row).find((k) => k.startsWith('__reactFiber'))
    let fiber = fiberKey ? row[fiberKey] : null
    for (let depth = 0; fiber && depth < 25; depth++, fiber = fiber.return) {
      const value = fiber.memoizedProps?.hostId
      if (typeof value === 'string' && value) return value
    }
    return null
  }

  function hostFor(threadId) {
    return rowHost(findRow(threadId))
  }

  function currentHost() {
    const reading = readCurrentThread()
    if (reading.hostId) return reading.hostId
    if (reading.source === 'composer') return null
    const row = currentRow()
    if (row) return rowHost(row)
    try {
      return new URL(doc.defaultView?.location?.href ?? '').searchParams.get('hostId') || null
    } catch {
      return null
    }
  }

  /** navigate-to-route path for a typed identity (same form Codex's own search uses). */
  function routeFor(key, hostId) {
    const path = `/local/${key}`
    return hostId && hostId !== 'local' ? `${path}?hostId=${encodeURIComponent(hostId)}` : path
  }

  function findRow(threadId) {
    const key = domThreadKey(threadId)
    if (!key) return null
    return (
      threadNodes().find((node) => rowKey(node) === key) ??
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
    const sidebarAttr = sidebarRow?.getAttribute(table.threadIdAttr) ?? null
    const hostId = sidebarRow ? rowHost(sidebarRow) : null
    // The chat actually on screen wins: the visible composer's conversation
    // id. The sidebar's active mark can lag (seen after host-scoped routes),
    // so it is only a fallback when no visible thread view is found.
    const shownId = domThreadKey(activePortal()?.getAttribute('data-above-composer-conversation-id') ?? '')
    if (shownId) {
      const sidebarKey = sidebarRow ? rowKey(sidebarRow) : null
      const shownHost = sidebarKey === shownId ? hostId : hostFor(shownId)
      return { raw: shownId, source: 'composer', ...(shownHost ? { hostId: shownHost } : {}) }
    }
    if (sidebarAttr && domThreadKey(sidebarAttr)) return { raw: sidebarAttr, source: 'sidebar', ...(hostId ? { hostId } : {}) }
    // Pending client id on the row: prefer the resolved conversation id.
    const resolved = sidebarRow ? conversationIdFromProps(sidebarRow) : null
    if (resolved) return { raw: resolved, source: 'sidebar-props', ...(hostId ? { hostId } : {}) }
    const portal = activePortal()
    const portalId = portal?.getAttribute('data-above-composer-conversation-id')
    if (portalId) return { raw: portalId, source: 'composer' }
    const route = readRouteThreadId(doc)
    if (route) return { raw: route, source: 'route' }
    // Still a draft: hand back the raw client id so callers can say so.
    if (sidebarAttr) return { raw: sidebarAttr, source: 'sidebar' }
    return { raw: null, source: null }
  }

  function readCurrentTitle() {
    const row = currentRow()
    if (row) return rowTitle(row)
    const title = doc.title?.replace(/\s+/g, ' ').trim()
    if (!title || /^(ChatGPT|Codex)$/i.test(title)) return null
    return title
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

  function nativePills(row) {
    return [...row.querySelectorAll(table.rowHoverActions)].filter((node) => !isOurNode(node))
  }

  /**
   * Native row hover group (the element matching `[class*=group-hover:opacity-100]`
   * that holds pin / archive). Each pill sits inside a Radix tooltip trigger
   * span; we return the group plus the first direct child to insert before.
   */
  function rowActionContainer(row) {
    const pill = nativePills(row)[0]
    if (!pill) return null
    const group = pill.closest(table.rowHoverGroup)
    if (!group || !row.contains(group)) return null
    let first = pill
    while (first.parentElement && first.parentElement !== group) first = first.parentElement
    return { group, before: first }
  }

  function firstRowPill() {
    for (const row of threadNodes()) {
      const pill = nativePills(row)[0]
      if (pill) return pill
    }
    return null
  }

  /** The row's native pin/unpin pill: labelled 置顶/pin, else the first pill. */
  function pinPill(row) {
    const pills = nativePills(row)
    return pills.find((p) => /置顶|pin/i.test(p.getAttribute('aria-label') || '')) ?? pills[0] ?? null
  }

  function rowsFor(threadId) {
    const key = domThreadKey(threadId)
    if (!key) return []
    return threadNodes().filter((node) => rowKey(node) === key)
  }

  /** true / false when a row is rendered, null when unknown. */
  function isPinned(threadId) {
    const rows = rowsFor(threadId)
    if (!rows.length) return null
    return rows.some((row) => row.getAttribute(table.threadPinnedAttr) === 'true')
  }

  async function waitFor(check, waitMs, step) {
    for (let waited = 0; waited <= waitMs; waited += step) {
      const value = check()
      if (value) return value
      await sleep(step)
    }
    return check()
  }

  /**
   * Unpin through Codex's own pin pill for that row, by thread id. Expands
   * the collapsed Pinned section temporarily if the row is not rendered, and
   * confirms by waiting until no row for the id reports pinned="true".
   * @returns {Promise<{ ok: boolean, wasPinned: boolean | null, reason?: string }>}
   */
  async function unpinThread(threadId, { waitMs = 1500, step = 50 } = {}) {
    let restore = null
    let pinned = isPinned(threadId)
    if (pinned === null) {
      const pinnedSection = nativeSections().find((s) => sectionKey(s) === 'pinned')
      const toggle = pinnedSection?.querySelector(table.sectionToggle)
      if (toggle && toggle.getAttribute('aria-expanded') === 'false') {
        toggle.click()
        restore = pinnedSection
        await waitFor(() => rowsFor(threadId).length > 0, 600, step)
      }
      pinned = isPinned(threadId)
    }
    try {
      if (!pinned) return { ok: true, wasPinned: pinned }
      const row = rowsFor(threadId).find((r) => r.getAttribute(table.threadPinnedAttr) === 'true')
      const pill = row && pinPill(row)
      if (!pill) return { ok: false, wasPinned: true, reason: 'no-pin-control' }
      pill.click()
      const done = await waitFor(() => isPinned(threadId) !== true, waitMs, step)
      return done ? { ok: true, wasPinned: true } : { ok: false, wasPinned: true, reason: 'still-pinned' }
    } finally {
      if (restore?.isConnected) {
        const toggle = restore.querySelector(table.sectionToggle)
        if (toggle?.getAttribute('aria-expanded') === 'true') toggle.click()
      }
    }
  }

  /** Expand a collapsed native section for the duration of `fn`, then restore. */
  async function withSectionOpen(key, fn, step = 50) {
    const section = nativeSections().find((s) => sectionKey(s) === key)
    const toggle = section?.querySelector(table.sectionToggle)
    let opened = false
    if (toggle && toggle.getAttribute('aria-expanded') === 'false') {
      toggle.click()
      opened = true
      await sleep(step * 4)
    }
    try {
      return await fn(section)
    } finally {
      if (opened && section?.isConnected) {
        const again = section.querySelector(table.sectionToggle)
        if (again?.getAttribute('aria-expanded') === 'true') again.click()
      }
    }
  }

  /**
   * The Pinned list's own React props: `keys` (codex:thread:<id>, in display
   * order) and `onOrderChange(nextKeys)`, the same handler a drag-drop calls.
   * Only present while the section is expanded.
   */
  function pinnedListProps() {
    const section = nativeSections().find((s) => sectionKey(s) === 'pinned')
    const row = section?.querySelector(`[${table.threadIdAttr}]`)
    if (!row) return null
    const fiberKey = Object.keys(row).find((k) => k.startsWith('__reactFiber'))
    for (let fiber = fiberKey ? row[fiberKey] : null, depth = 0; fiber && depth < 80; fiber = fiber.return, depth++) {
      const props = fiber.memoizedProps
      if (props && Array.isArray(props.keys) && typeof props.onOrderChange === 'function') return props
    }
    return null
  }

  function keyToId(key) {
    const raw = String(key).replace(/^codex:thread:/, '')
    if (raw.startsWith('content-tab:')) return null
    const direct = domThreadKey(raw)
    if (direct) return direct
    // Pending client id: resolve through the rendered row's conversationId.
    const row = threadNodes().find((node) => node.getAttribute(table.threadIdAttr) === raw)
    return row ? rowKey(row) : null
  }

  /** Pinned thread ids in display order (expands the section briefly). */
  async function pinnedOrder() {
    return withSectionOpen('pinned', (section) => {
      const props = pinnedListProps()
      if (props) return props.keys.map(keyToId).filter(Boolean)
      if (!section) return []
      return [...section.querySelectorAll(`[${table.threadIdAttr}]`)]
        .filter((r) => r.getAttribute(table.threadPinnedAttr) === 'true')
        .map((r) => rowKey(r))
        .filter(Boolean)
    })
  }

  /** Where `threadId` sits in 置顶: { index, beforeThreadId } or null. */
  async function pinPosition(threadId) {
    const id = domThreadKey(threadId)
    const order = await pinnedOrder()
    const index = order.indexOf(id)
    if (index < 0) return null
    return { index, beforeThreadId: order[index + 1] ?? null }
  }

  function pressPointer(element) {
    const win = doc.defaultView
    const Ctor = win?.PointerEvent ?? win?.MouseEvent
    const init = { bubbles: true, cancelable: true, button: 0, pointerType: 'mouse', isPrimary: true }
    element.dispatchEvent(new Ctor('pointerdown', init))
  }

  function pressEscape(target) {
    const win = doc.defaultView
    target?.dispatchEvent(new win.KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', bubbles: true, cancelable: true }))
  }

  /** Open a native Radix dropdown trigger and return its menu node. */
  async function openNativeMenu(trigger, step = 50) {
    pressPointer(trigger)
    return waitFor(() => {
      const id = trigger.getAttribute('aria-controls')
      const menu = id ? doc.getElementById(id) : null
      return menu && menu.getAttribute('role') === 'menu' ? menu : null
    }, 800, step)
  }

  /** 'manual' | 'updated' | null — read from the native 置顶 header menu. */
  async function pinnedSortMode() {
    const section = nativeSections().find((s) => sectionKey(s) === 'pinned')
    const trigger = section && [...section.querySelectorAll('button[aria-haspopup="menu"]')].find((b) => !b.closest(`[${table.threadIdAttr}]`))
    if (!trigger) return null
    const menu = await openNativeMenu(trigger)
    if (!menu) return null
    const checked = [...menu.querySelectorAll('[role="menuitemradio"][aria-checked="true"]')].map((i) => i.textContent.trim())
    pressEscape(menu)
    if (checked.some((t) => /手动|manual/i.test(t))) return 'manual'
    if (checked.some((t) => /最近|updated|recent/i.test(t))) return 'updated'
    return null
  }

  /** Pinned per Codex's own list (expands briefly); null when unreadable. */
  async function pinnedNow(threadId) {
    const id = domThreadKey(threadId)
    const order = await pinnedOrder()
    return order.includes(id)
  }

  /**
   * Open a thread by id through Codex's command menu (搜索): results carry
   * data-value="command-menu-async-result:<id>", so the match is by id, not
   * by title. `query` only narrows the search.
   */
  async function openViaSearch(threadId, query, step = 50) {
    const id = domThreadKey(threadId)
    const button = doc.querySelector(table.searchButton)
    if (!button || !id || !query) return false
    button.click()
    const input = await waitFor(() => {
      const el = doc.activeElement
      return el && el.tagName === 'INPUT' && el.closest('[cmdk-root], [role="dialog"]') ? el : null
    }, 800, step)
    if (!input) return false
    const win = doc.defaultView
    const setter = Object.getOwnPropertyDescriptor(win.HTMLInputElement.prototype, 'value')?.set
    setter ? setter.call(input, query) : (input.value = query)
    input.dispatchEvent(new win.Event('input', { bubbles: true }))
    const option = await waitFor(
      () => [...doc.querySelectorAll('[cmdk-item][data-value]')].find((o) => domThreadKey(o.getAttribute('data-value').replace(/^command-menu-async-result:/, '')) === id) ?? null,
      3000,
      step,
    )
    if (!option) {
      pressEscape(input)
      return false
    }
    option.click()
    return Boolean(await waitFor(() => currentId() === id, 2000, step))
  }

  function currentId() {
    const raw = readCurrentThread().raw
    return raw ? domThreadKey(raw) : null
  }

  /** 聊天操作 (header) → 置顶 for the open thread. */
  async function pinOpenThreadViaHeader(step = 50) {
    const trigger = doc.querySelector(table.threadActionsButton)
    if (!trigger) return false
    const menu = await openNativeMenu(trigger, step)
    if (!menu) return false
    const item = [...menu.querySelectorAll('[role^="menuitem"]')].find((i) => /^\s*(置顶|Pin)(?!.*(取消|Unpin))/i.test(i.textContent || ''))
    if (!item) {
      pressEscape(menu)
      return false
    }
    item.click()
    return true
  }

  /**
   * Re-pin through Codex's own controls, by thread id, and optionally restore
   * its place in a manually sorted 置顶 via the list's own onOrderChange.
   * 1. Row rendered anywhere (collapsed sections expanded briefly) → its pin pill.
   * 2. Otherwise open the thread via 搜索 (matched by id), 聊天操作 → 置顶,
   *    then return to the previously open thread.
   * @param {string} threadId
   * @param {{ title?: string, index?: number | null, beforeThreadId?: string | null, returnTitle?: string | null, waitMs?: number, step?: number }} [opts]
   */
  async function repinThread(threadId, opts = {}) {
    const { waitMs = 2000, step = 50 } = opts
    const id = domThreadKey(threadId)
    if (!id) return { ok: false, reason: 'invalid-id' }
    let via = 'already'
    if (!(await pinnedNow(id))) {
      via = null
      const viaPill = async () => {
        const row = rowsFor(id)[0]
        const pill = row && pinPill(row)
        if (!pill) return false
        pill.click()
        return true
      }
      if (await viaPill()) via = 'row'
      else {
        for (const section of nativeSections()) {
          const key = sectionKey(section)
          if (!key || key === 'pinned') continue
          if (await withSectionOpen(key, () => viaPill(), step)) {
            via = 'row'
            break
          }
        }
      }
      if (!via) {
        const previous = currentId()
        const previousTitle = opts.returnTitle ?? readCurrentTitle()
        const previousHost = currentHost()
        if (previous !== id && !(await openThread(id, { hostId: opts.hostId })).ok && !(await openViaSearch(id, opts.title, step))) return { ok: false, reason: 'not-reachable' }
        if (!(await pinOpenThreadViaHeader(step))) return { ok: false, reason: 'no-pin-control' }
        via = 'header'
        await waitFor(() => isPinned(id) === true, 600, step)
        if (previous && previous !== id) {
          const back = await openThread(previous, { hostId: previousHost })
          if (!back?.ok) await openViaSearch(previous, previousTitle, step)
        }
      }
      let confirmed = false
      for (let waited = 0; waited <= waitMs && !confirmed; waited += step * 6) {
        confirmed = await pinnedNow(id)
        if (!confirmed) await sleep(step * 6)
      }
      if (!confirmed) return { ok: false, via, reason: 'not-pinned' }
    }
    const position = await restorePinPosition(id, opts)
    return { ok: true, via, position }
  }

  /** Move `id` back to its remembered slot when 置顶 is manually sorted. */
  async function restorePinPosition(id, { index = null, beforeThreadId = null } = {}) {
    if (index == null && !beforeThreadId) return { restored: false, reason: 'no-memory' }
    return withSectionOpen('pinned', async () => {
      const mode = await pinnedSortMode()
      if (mode !== 'manual') return { restored: false, reason: `sort-${mode ?? 'unknown'}` }
      const props = pinnedListProps()
      if (!props) return { restored: false, reason: 'no-reorder-api' }
      const keys = props.keys.slice()
      const mine = keys.findIndex((k) => keyToId(k) === id)
      if (mine < 0) return { restored: false, reason: 'not-in-list' }
      const [key] = keys.splice(mine, 1)
      const before = beforeThreadId ? keys.findIndex((k) => keyToId(k) === domThreadKey(beforeThreadId)) : -1
      const target = before >= 0 ? before : Math.min(index ?? keys.length, keys.length)
      keys.splice(target, 0, key)
      if (keys.every((k, i) => k === props.keys[i])) return { restored: true, index: target, moved: false }
      props.onOrderChange(keys)
      const ok = await waitFor(() => {
        const now = pinnedListProps()
        return now && now.keys.findIndex((k) => keyToId(k) === id) === target
      }, 1500, 50)
      return ok ? { restored: true, index: target, moved: true } : { restored: false, reason: 'order-not-saved' }
    })
  }

  /** Rendered native rows that can host a 收纳 hover button. */
  function rowActionSlots() {
    const slots = []
    for (const row of threadNodes()) {
      const key = rowKey(row)
      if (!key) continue
      const place = rowActionContainer(row)
      const pill = place && nativePills(row)[0]
      if (!place || !pill) continue
      const donor = donorButton(pill)
      slots.push({ threadId: key, container: place.group, before: place.before, buttonClass: donor.className, buttonAttrs: donor.attrs, innerClass: donor.innerClass })
    }
    return slots
  }

  /** Stable id of the native row containing `node`, or null. */
  function threadIdFromNode(node) {
    const element = node?.nodeType === 1 ? node : node?.parentElement
    if (!element || isOurNode(element)) return null
    const row = element.closest?.(`[${table.threadIdAttr}]`)
    return row ? rowKey(row) : null
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
    // Last in the list: right after 最近 (Recents). Its rows (and "show more"
    // growth) live inside the Recents <section>, so a sibling placed after
    // that section stays below the whole list. Fallback: after the last
    // native section.
    const anchor =
      sections.find((section) => sectionKey(section) === 'recent') ?? sections[sections.length - 1]
    if (anchor?.parentElement) {
      return { parent: anchor.parentElement, before: nextHostNode(anchor.nextSibling), after: anchor, gap: sectionGap(anchor) }
    }
    if (sections[0]?.parentElement) {
      return { parent: sections[0].parentElement, before: sections[0] }
    }
    return { parent, before: nextHostNode(parent.firstChild) }
  }

  /**
   * Native sections are separated by the row-gap of the flex list that holds
   * their wrappers (16px live). Sharing 最近's wrapper loses that gap, so the
   * mount point reports it for the UI to apply as a top margin.
   */
  function sectionGap(anchor) {
    const win = doc.defaultView
    for (let node = anchor.parentElement; node && node.nodeType === 1; node = node.parentElement) {
      const style = win?.getComputedStyle?.(node)
      if (!style) return null
      if (style.display === 'contents') continue
      if (style.display.includes('flex') || style.display.includes('grid')) {
        return /^\d/.test(style.rowGap) ? style.rowGap : null
      }
      if (node !== anchor.parentElement) return null
    }
    return null
  }

  function nextHostNode(node) {
    let current = node
    while (current && (current.nodeType !== 1 || isOurNode(current))) current = current.nextSibling
    return current
  }

  /**
   * Navigate to a thread without touching the sidebar. Codex's own UI (fork,
   * menus) navigates by posting a host message `{ type: 'navigate-to-route',
   * path: '/local/<id>' }` to its window message bus; a same-origin
   * window.postMessage is accepted by that bus. No section is expanded or
   * collapsed. Fallback: click the row only when it is already rendered.
   * @returns {Promise<{ ok: boolean, via?: string, reason?: string }>}
   */
  async function openThread(threadId, { waitMs = 1500, step = 50, hostId = null } = {}) {
    const key = domThreadKey(threadId)
    if (!key) return { ok: false, reason: 'invalid-id' }
    // Without the host a remote (SSH) thread opens as a local thread.
    const host = hostId || hostFor(key)
    const sameHost = () => !host || (currentHost() ?? 'local') === host
    if (currentId() === key && sameHost()) return { ok: true, via: 'already' }
    const win = doc.defaultView
    try {
      win?.postMessage({ type: 'navigate-to-route', path: routeFor(key, host) }, '*')
    } catch {
      /* opaque origin in tests */
    }
    if (await waitFor(() => currentId() === key && sameHost(), waitMs, step)) return { ok: true, via: 'route' }
    const direct = findRow(key)
    if (direct) {
      direct.click()
      return { ok: true, via: 'row' }
    }
    return { ok: false, reason: 'not-navigated' }
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
    // Self-heal: Codex can swap the sidebar subtree deep below <body>, which
    // the body childList watch never sees. Poll cheaply for a new sidebar.
    const win = doc.defaultView
    const timer = win?.setInterval?.(() => {
      const next = findSidebar()
      if (next === sidebar && (!sidebar || sidebar.isConnected)) return
      sidebar = next
      rebind()
      handler()
    }, 1500)
    return () => {
      observer.disconnect()
      if (timer != null) win.clearInterval(timer)
    }
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
    readCurrentTitle,
    getThreadTitle(threadId) {
      const row = findRow(threadId)
      return row ? rowTitle(row) : null
    },
    hostFor,
    currentHost,
    routeFor,
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
    tooltipClass: () => NATIVE_TOOLTIP_CLASS,
    isPinned,
    unpinThread,
    repinThread,
    pinPosition,
    pinnedOrder,
    mountPoint,
    onUserMessage,
    observe,
    composerContains,
  }
}
