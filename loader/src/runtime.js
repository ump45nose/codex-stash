import { createAdapter } from '../../codex-adapter/src/index.js'
import {
  canonicalThreadId,
  chooseNewer,
  createLocalStorageStorage,
  createMemoryStorage,
  createStashStore,
  dueAtFromDateInput,
  dueAtFromPreset,
  parseState,
} from '../../stash-core/src/index.js'
import {
  NODE_PREFIX,
  STRINGS,
  formatDueLabel,
  mountMenu,
  mountPopover,
  mountSection,
  unmountAddonNodes,
} from '../../ui/src/index.js'
import { createDisposers } from './disposers.js'
import { hotkeyConflict, matchHotkey, parseHotkey } from './hotkey.js'
import { planReminders } from './reminders.js'
import { GUARD, VERSION } from './version.js'

export { GUARD, VERSION }

export const DEFAULT_HOTKEY = 'Mod+Shift+H'
const COLLAPSED_KEY = 'codex-stash:v1:collapsed'

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
  let hotkeyBound = false
  let disabled = null
  let warned = false
  /** @type {Set<string>} */
  let notified = new Set()
  let collapsed = readCollapsed(win)
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
    return store.list(now).map((item) => {
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
      onContext(threadId, x, y) {
        openMenu(threadId, x, y)
      },
    })
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
    }
    persistMirror()
    closeTransient()
    render()
  }

  function openStashPopover(editThreadId) {
    closeTransient()
    const health = adapter.probe()
    if (health.status === 'broken') {
      disable(health.diagnostic)
      return
    }
    let message = null
    let threadId = editThreadId
    if (!editThreadId) {
      const current = currentThread()
      if (!current.ok && current.reason === 'not-persisted') message = strings.draft
      else if (!current.ok) message = strings.noThread
      else threadId = current.id
    }
    const currentTitle = editThreadId ? null : adapter.readCurrentTitle?.() ?? null
    const toggle = doc.getElementById(`${NODE_PREFIX}toggle`)
    const rect = toggle?.getBoundingClientRect?.()
    popover = mountPopover({
      doc,
      strings,
      message,
      hotkeyLabel: hotkey.spec,
      editing: Boolean(editThreadId),
      left: rect ? rect.left : 16,
      top: rect ? rect.bottom + 4 : 72,
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

  function openMenu(threadId, x, y) {
    closeTransient()
    menu = mountMenu({
      doc,
      strings,
      left: x,
      top: y,
      onChangeDate() {
        openStashPopover(threadId)
      },
      onRemove() {
        store.unstash(threadId, clock())
        persistMirror()
        closeTransient()
        render()
      },
      onClose() {
        menu = null
      },
    })
  }

  let claimedWarned = false
  function onKey(event) {
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
    openStashPopover(null)
  }

  if (conflict) {
    log?.warn?.('[codex-stash] hotkey not bound', conflict)
  } else {
    win.addEventListener('keydown', onKey)
    disposers.add(() => win.removeEventListener('keydown', onKey))
    hotkeyBound = true
  }

  disposers.add(
    adapter.onUserMessage((raw) => {
      let threadId
      try {
        threadId = canonicalThreadId(raw)
      } catch {
        return
      }
      if (!store.onUserMessage(threadId, clock())) return
      closeTransient()
      persistMirror()
      render()
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
