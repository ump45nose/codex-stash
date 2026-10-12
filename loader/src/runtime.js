import { createAdapter } from '../../codex-adapter/src/index.js'
import {
  canonicalThreadId,
  chooseNewer,
  createLocalStorageStorage,
  createMemoryStorage,
  createStashStore,
  dueAtFromDateInput,
  dueAtFromPreset,
  normalizeSortMode,
  sortRows,
  parseState,
} from '../../stash-core/src/index.js'
import {
  NODE_PREFIX,
  STRINGS,
  formatDueLabel,
  mountMenu,
  mountPopover,
  mountRowActions,
  mountSection,
  unmountAddonNodes,
} from '../../ui/src/index.js'
import { createDisposers } from './disposers.js'
import { hotkeyConflict, hotkeyLabel, matchHotkey, parseHotkey } from './hotkey.js'
import { planReminders } from './reminders.js'
import { GUARD, VERSION } from './version.js'

export { GUARD, VERSION }

export const DEFAULT_HOTKEY = 'Mod+Shift+H'
/** 改日期 / 移出 on the hovered stash row (or the open thread's entry). Free in Codex 26.x keymap. */
export const DEFAULT_DATE_HOTKEY = 'Mod+Shift+D'
export const DEFAULT_REMOVE_HOTKEY = 'Mod+Shift+J'
const COLLAPSED_KEY = 'codex-stash:v1:collapsed'
const SORT_KEY = 'codex-stash:v1:sort'

/**
 * Install the stash section into a Codex renderer document.
 * Calling it again with the same version does not add listeners or nodes.
 *
 * @param {{
 *   window?: Window,
 *   storage?: { load: () => any, save: (state: any) => void },
 *   store?: ReturnType<typeof createStashStore>,
 *   adapter?: ReturnType<typeof createAdapter>,
 *   seed?: unknown,
 *   hotkey?: string,
 *   hotkeyDate?: string,
 *   hotkeyRemove?: string,
 *   locale?: 'zh' | 'en',
 *   isMac?: boolean,
 *   notify?: boolean,
 *   now?: () => Date,
 *   reminderIntervalMs?: number,
 *   reservedHotkeys?: string[],
 *   log?: Pick<Console, 'warn' | 'info'>,
 *   persist?: (json: string) => void,
 * }} [options]
 */
export function install(options = {}) {
  const win = options.window ?? globalThis
  const doc = win.document
  if (!doc?.body) {
    return { status: 'waiting-for-document', version: VERSION, hotkeyBound: false }
  }

  const existing = win[GUARD]
  if (existing?.version === VERSION && existing.installed) {
    existing.render()
    return {
      status: 'already-installed',
      version: VERSION,
      hotkeyBound: existing.hotkeyBound,
      hotkeyConflict: existing.hotkeyConflict,
    }
  }
  if (typeof existing?.uninstall === 'function') {
    try {
      existing.uninstall()
    } catch {
      /* a stale guard still yields to this install */
    }
  }
  unmountAddonNodes(doc, NODE_PREFIX)

  const log = options.log ?? win.console
  const locale = options.locale === 'en' ? 'en' : 'zh'
  const strings = STRINGS[locale]
  const clock = options.now ?? (() => new Date())
  const storage = options.storage ?? createPageStorage(win)
  if (options.seed) applySeed(storage, options.seed)
  const store = options.store ?? createStashStore(storage)
  const adapter =
    options.adapter ?? createAdapter(doc, { ignoreIdPrefix: NODE_PREFIX })
  const disposers = createDisposers()
  const hotkey = parseHotkey(options.hotkey ?? DEFAULT_HOTKEY)
  const isMac = options.isMac ?? /Mac|iPhone|iPad/.test(win.navigator?.platform ?? '')
  const reserved = [
    ...(options.reservedHotkeys ?? []),
    ...(Array.isArray(win.__codexHostReservedHotkeys) ? win.__codexHostReservedHotkeys : []),
  ]
  const conflict = hotkeyConflict(hotkey, reserved)
  const shortcut = hotkeyLabel(hotkey, isMac)
  // Row actions: each binds only when free (Codex keymap, CodexHost, and the stash hotkey).
  const rowKeys = {}
  for (const [name, spec] of [
    ['date', options.hotkeyDate ?? DEFAULT_DATE_HOTKEY],
    ['remove', options.hotkeyRemove ?? DEFAULT_REMOVE_HOTKEY],
  ]) {
    if (!spec) continue
    const parsed = parseHotkey(spec)
    const taken = [...reserved, hotkey.spec, ...Object.values(rowKeys).map((k) => k.hotkey.spec)]
    const clash = hotkeyConflict(parsed, taken)
    if (clash) {
      log?.warn?.('[codex-stash] row hotkey not bound', name, spec, clash)
      continue
    }
    rowKeys[name] = { hotkey: parsed, label: hotkeyLabel(parsed, isMac) }
  }
  let hotkeyBound = false
  let disabled = null
  let warned = false
  /** @type {Set<string>} */
  let notified = new Set()
  let collapsed = readCollapsed(win)
  let sortMode = readSort(win)
  let lastUnpin = null
  let lastRepin = null
  /** @type {{ close: () => void } | null} */
  let popover = null
  /** @type {{ close: () => void } | null} */
  let menu = null

  function persistMirror() {
    const persist = options.persist ?? win.codexStashPersist
    if (typeof persist !== 'function') return
    try {
      persist(JSON.stringify(store.getState()))
    } catch (error) {
      log?.warn?.('[codex-stash] persist failed', error instanceof Error ? error.message : error)
    }
  }

  function closeTransient() {
    popover?.close()
    menu?.close()
    popover = null
    menu = null
  }

  function currentThread() {
    const reading = adapter.readCurrentThread()
    if (!reading?.raw) return { ok: false, reason: 'missing', raw: null }
    try {
      return { ok: true, reason: null, id: canonicalThreadId(reading.raw), raw: reading.raw }
    } catch (error) {
      return { ok: false, reason: error.code || 'invalid', raw: reading.raw }
    }
  }

  function viewRows(now) {
    return sortRows(store.list(now), sortMode, now).map((item) => {
      const live = adapter.getThreadTitle(item.threadId)
      if (live && live !== item.title) store.refreshTitle(item.threadId, live, now)
      return {
        threadId: item.threadId,
        title: live || item.title || strings.untitled,
        dueLabel: formatDueLabel(item.dueAt, now, locale),
        due: Date.parse(item.dueAt) <= now.getTime(),
        missing: !adapter.isThreadListed(item.threadId),
      }
    })
  }

  function checkDue(now) {
    if (options.notify === false) return
    const permission = win.Notification?.permission
    const plan = planReminders(store.due(now), notified, permission)
    notified = plan.next
    if (!win.Notification || permission !== 'granted') return
    for (const item of plan.notify) {
      try {
        new win.Notification(strings.section, { body: item.title || strings.untitled })
      } catch {
        /* Electron may refuse the constructor */
      }
    }
  }

  function disable(reason) {
    if (disabled) return
    disabled = reason
    closeTransient()
    unmountAddonNodes(doc, NODE_PREFIX)
    if (!warned) {
      warned = true
      log?.warn?.('[codex-stash] disabled', reason)
    }
  }

  function render() {
    if (disabled) return
    const health = adapter.probe()
    if (health.status === 'broken') {
      disable(health.diagnostic)
      return
    }
    if (!health.ok) return
    const point = adapter.mountPoint()
    if (!point?.parent) return
    const now = clock()
    const rows = viewRows(now)
    mountSection({
      doc,
      parent: point.parent,
      before: point.before,
      chrome: adapter.readChrome(),
      prefix: NODE_PREFIX,
      strings,
      collapsed,
      rows,
      onToggle() {
        collapsed = !collapsed
        writeCollapsed(win, collapsed)
        render()
      },
      onOpen(threadId) {
        const row = rows.find((candidate) => candidate.threadId === threadId)
        if (!row) return
        Promise.resolve(adapter.openThread(threadId)).then((result) => {
          if (!result?.ok) log?.info?.('[codex-stash] thread not found in sidebar', threadId)
        })
      },
      onContext(threadId, x, y, rect) {
        openMenu(threadId, rect ?? { left: x, top: y, bottom: y })
      },
      onSectionMenu(rect) {
        openSectionMenu(rect)
      },
    })
    if (adapter.rowActionSlots) {
      mountRowActions({
        doc,
        prefix: NODE_PREFIX,
        slots: adapter.rowActionSlots(),
        label: strings.stashThis,
        shortcut,
        tooltipClass: adapter.tooltipClass?.() ?? '',
        zoom: () => adapter.uiZoom?.() ?? 1,
        onStash(threadId, rect) {
          openStashPopover(null, { threadId, anchor: rect })
        },
      })
    }
    checkDue(now)
  }

  function commit(threadId, dueAt, editing, currentTitle) {
    const now = clock()
    if (editing && store.get(threadId)) store.setDate(threadId, dueAt, now)
    else {
      const title =
        adapter.getThreadTitle(threadId) ||
        currentTitle ||
        store.get(threadId)?.title ||
        strings.untitled
      store.stash(threadId, title, dueAt, now)
      unpinAfterStash(threadId)
    }
    persistMirror()
    closeTransient()
    render()
  }

  function floatingContext() {
    return {
      zoom: adapter.uiZoom?.() ?? 1,
      chrome: adapter.menuChrome?.() ?? null,
    }
  }

  /**
   * @param {string | null} editThreadId
   * @param {{ threadId?: string, anchor?: any }} [target] a specific native row
   */
  /** Stashing a pinned chat unpins it through Codex's own pin control. */
  function unpinAfterStash(threadId) {
    if (typeof adapter.unpinThread !== 'function') return
    lastUnpin = { threadId, pending: true }
    Promise.resolve(adapter.pinPosition ? adapter.pinPosition(threadId) : null)
      .catch(() => null)
      .then(async (position) => {
        const result = await adapter.unpinThread(threadId)
        lastUnpin = { threadId, ...result, position }
        if (!result?.ok) log?.warn?.('[codex-stash] unpin failed', threadId, result?.reason)
        else if (result.wasPinned) {
          log?.info?.('[codex-stash] unpinned', threadId)
          // Remember it so any removal can put the pin back (stash-core holds it).
          if (store.get(threadId) && store.setPin(threadId, position ?? {}, clock())) persistMirror()
        }
      })
      .catch((error) => {
        lastUnpin = { threadId, ok: false, reason: String(error) }
      })
  }

  /**
   * Every removal path (移出, its hotkey, auto-unstash on a sent message)
   * comes through here: drop our record, then re-pin if it was pinned.
   */
  function removeEntry(threadId, reason) {
    const row = store.take(threadId, clock())
    if (!row) return false
    persistMirror()
    closeTransient()
    render()
    if (row.pin?.wasPinned) repinAfterRemove(row, reason)
    return true
  }

  function repinAfterRemove(row, reason) {
    if (typeof adapter.repinThread !== 'function') return
    lastRepin = { threadId: row.threadId, reason, pending: true }
    Promise.resolve(
      adapter.repinThread(row.threadId, {
        title: adapter.getThreadTitle(row.threadId) || row.title,
        index: row.pin.index,
        beforeThreadId: row.pin.beforeThreadId,
      }),
    )
      .then((result) => {
        lastRepin = { threadId: row.threadId, reason, ...result }
        if (!result?.ok) log?.warn?.('[codex-stash] re-pin failed', row.threadId, result?.reason)
        else log?.info?.('[codex-stash] re-pinned', row.threadId, result.via, JSON.stringify(result.position))
      })
      .catch((error) => {
        lastRepin = { threadId: row.threadId, reason, ok: false, reason2: String(error) }
      })
  }

  function openStashPopover(editThreadId, target = {}) {
    closeTransient()
    const health = adapter.probe()
    if (health.status === 'broken') {
      disable(health.diagnostic)
      return
    }
    let message = null
    let threadId = editThreadId
    let subject = null
    if (!editThreadId && target.threadId) {
      threadId = target.threadId
      subject = adapter.getThreadTitle(threadId)
    } else if (!editThreadId) {
      const current = currentThread()
      if (!current.ok && current.reason === 'not-persisted') message = strings.draft
      else if (!current.ok) message = strings.noThread
      else threadId = current.id
    }
    const currentTitle = editThreadId || target.threadId ? subject : adapter.readCurrentTitle?.() ?? null
    if (editThreadId) subject = store.get(editThreadId)?.title ?? null
    else if (!subject) subject = currentTitle
    popover = mountPopover({
      doc,
      strings,
      message,
      title: subject,
      heading: target.threadId ? strings.stashThis : null,
      hotkeyLabel: shortcut,
      editing: Boolean(editThreadId),
      // Hotkey: centred. Row / menu: anchored, flipped and clamped on screen.
      anchor: target.anchor ?? null,
      ...floatingContext(),
      onPreset(preset) {
        if (!threadId) return
        commit(threadId, dueAtFromPreset(preset, clock()), Boolean(editThreadId), currentTitle)
      },
      onCustom(value) {
        if (!threadId) return
        commit(threadId, dueAtFromDateInput(value), Boolean(editThreadId), currentTitle)
      },
      onClose() {
        popover = null
      },
    })
  }

  function openSectionMenu(anchor) {
    closeTransient()
    menu = mountMenu({
      doc,
      strings,
      anchor,
      ...floatingContext(),
      // Mirrors the native 置顶 header menu: sort radios with a checkmark.
      items: [
        ['due', strings.sortDue],
        ['stashed', strings.sortStashed],
        ['title', strings.sortTitle],
      ].map(([mode, label]) => ({
        id: `sort-${mode}`,
        label,
        checked: sortMode === mode,
        run() {
          closeTransient()
          sortMode = mode
          writeSort(win, mode)
          render()
        },
      })),
      onClose() {
        menu = null
      },
    })
  }

  function openMenu(threadId, anchor) {
    closeTransient()
    menu = mountMenu({
      doc,
      strings,
      anchor,
      ...floatingContext(),
      onChangeDate() {
        openStashPopover(threadId, { anchor })
      },
      changeDateShortcut: rowKeys.date?.label ?? null,
      removeShortcut: rowKeys.remove?.label ?? null,
      onRemove() {
        removeEntry(threadId, 'remove')
      },
      onClose() {
        menu = null
      },
    })
  }

  let claimedWarned = false
  /** Hovered stash row, else the open thread when it is stashed. */
  function stashTarget() {
    const hovered = hoveredStash && hoveredStash.isConnected ? hoveredStash : null
    const id = hovered?.getAttribute('data-codex-stash-thread-id')
    if (id && store.get(id)) return { threadId: store.get(id).threadId, anchor: hovered.getBoundingClientRect() }
    const current = currentThread()
    if (current.ok && store.get(current.id)) return { threadId: store.get(current.id).threadId, anchor: null }
    return null
  }

  function onRowKey(event) {
    if (disabled || event.repeat || event.defaultPrevented) return false
    const name = Object.keys(rowKeys).find((k) => matchHotkey(event, rowKeys[k].hotkey, isMac))
    if (!name) return false
    const target = stashTarget()
    if (!target) return false
    event.preventDefault()
    closeTransient()
    if (name === 'date') openStashPopover(target.threadId, { anchor: target.anchor })
    else removeEntry(target.threadId, 'hotkey')
    return true
  }

  function onKey(event) {
    if (onRowKey(event)) return
    if (disabled || conflict || event.repeat) return
    if (!matchHotkey(event, hotkey, isMac)) return
    if (event.defaultPrevented) {
      // Someone earlier (Codex, CodexHost) owns this combo; step aside, say so once.
      if (!claimedWarned) {
        claimedWarned = true
        log?.warn?.('[codex-stash] hotkey already handled by the host app; choose another with --hotkey', hotkey.spec)
      }
      return
    }
    event.preventDefault()
    if (popover || menu) {
      closeTransient()
      return
    }
    // A hovered native row is the target; otherwise the open conversation.
    const hovered = hoveredRow && hoveredRow.isConnected ? adapter.threadIdFromNode?.(hoveredRow) : null
    if (hovered) openStashPopover(null, { threadId: hovered, anchor: hoveredRow.getBoundingClientRect() })
    else openStashPopover(null)
  }

  let hoveredRow = null
  let hoveredStash = null
  function onPointerOver(event) {
    hoveredStash = event.target?.closest?.('[data-codex-stash-thread-id]') ?? null
    const id = adapter.threadIdFromNode?.(event.target)
    hoveredRow = id ? event.target.closest?.('[data-app-action-sidebar-thread-id]') ?? null : null
  }
  doc.addEventListener('pointerover', onPointerOver, true)
  disposers.add(() => doc.removeEventListener('pointerover', onPointerOver, true))

  if (conflict) log?.warn?.('[codex-stash] hotkey not bound', conflict)
  else hotkeyBound = true
  if (!conflict || Object.keys(rowKeys).length) {
    win.addEventListener('keydown', onKey)
    disposers.add(() => win.removeEventListener('keydown', onKey))
  }

  disposers.add(
    adapter.onUserMessage((raw) => {
      let threadId
      try {
        threadId = canonicalThreadId(raw)
      } catch {
        return
      }
      if (!store.get(threadId)) return
      removeEntry(threadId, 'message')
    }),
  )

  disposers.add(
    adapter.observe(() => {
      if (disabled) {
        const health = adapter.probe()
        if (!health.ok) return
        disabled = null
        warned = false
        log?.info?.('[codex-stash] selectors recovered')
      }
      render()
    }),
  )

  const interval = options.reminderIntervalMs ?? 60_000
  if (interval > 0 && typeof win.setInterval === 'function') {
    const timer = win.setInterval(() => checkDue(clock()), interval)
    disposers.add(() => win.clearInterval(timer))
  }
  function onFocus() {
    checkDue(clock())
  }
  win.addEventListener('focus', onFocus)
  disposers.add(() => win.removeEventListener('focus', onFocus))

  function uninstall() {
    closeTransient()
    disposers.run()
    unmountAddonNodes(doc, NODE_PREFIX)
    if (win[GUARD] === api) delete win[GUARD]
  }

  const api = {
    version: VERSION,
    installed: true,
    hotkeyBound,
    hotkeyConflict: conflict,
    uninstall,
    render,
    get disabled() {
      return disabled
    },
    get lastUnpin() {
      return lastUnpin
    },
    get lastRepin() {
      return lastRepin
    },
    rowHotkeys: Object.fromEntries(Object.entries(rowKeys).map(([k, v]) => [k, v.hotkey.spec])),
    get sortMode() {
      return sortMode
    },
  }
  win[GUARD] = api
  render()
  return { status: 'installed', version: VERSION, hotkeyBound, hotkeyConflict: conflict }
}

/**
 * @param {{ window?: Window }} [options]
 */
export function uninstall(options = {}) {
  const win = options.window ?? globalThis
  const existing = win[GUARD]
  if (typeof existing?.uninstall === 'function') existing.uninstall()
  else if (win.document) unmountAddonNodes(win.document, NODE_PREFIX)
  if (win[GUARD] === existing) delete win[GUARD]
}

function applySeed(storage, seed) {
  const parsed = parseState(typeof seed === 'string' ? JSON.parse(seed) : seed).state
  storage.save(chooseNewer(storage.load(), parsed))
}

function pageLocalStorage(win) {
  try {
    return win.localStorage ?? null
  } catch {
    return null
  }
}

function createPageStorage(win) {
  const local = pageLocalStorage(win)
  return local ? createLocalStorageStorage(local) : createMemoryStorage()
}

function readSort(win) {
  try {
    return normalizeSortMode(pageLocalStorage(win)?.getItem(SORT_KEY))
  } catch {
    return 'due'
  }
}
function writeSort(win, mode) {
  try {
    pageLocalStorage(win)?.setItem(SORT_KEY, mode)
  } catch {
    /* private mode */
  }
}
function readCollapsed(win) {
  try {
    return pageLocalStorage(win)?.getItem(COLLAPSED_KEY) === '1'
  } catch {
    return false
  }
}

function writeCollapsed(win, collapsed) {
  try {
    pageLocalStorage(win)?.setItem(COLLAPSED_KEY, collapsed ? '1' : '0')
  } catch {
    /* private mode */
  }
}
