import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { JSDOM } from 'jsdom'
import { domThreadKey } from '../../codex-adapter/src/index.js'
import { canonicalThreadId } from '../../stash-core/src/index.js'
import { GUARD, install, uninstall } from '../src/runtime.js'

const here = dirname(fileURLToPath(import.meta.url))
const UUID = '11111111-1111-1111-1111-111111111111'
const OTHER = '22222222-2222-2222-2222-222222222222'
const THIRD_ID = '33333333-3333-3333-3333-333333333333'

function page() {
  const html = `<!doctype html><html><body>
    <aside data-testid="app-shell-floating-left-panel" class="app-shell-left-panel">
      <div data-app-action-sidebar-scroll>
        <section data-app-action-sidebar-section="pinned" class="native-section">
          <div data-app-action-sidebar-section-heading class="native-heading">
            <button data-app-action-sidebar-section-toggle class="native-toggle" aria-expanded="true">Pinned</button>
          </div>
        </section>
        <section data-app-action-sidebar-section="projects" class="native-section projects">
          <div data-app-action-sidebar-section-heading class="native-heading">
            <button data-app-action-sidebar-section-toggle class="native-toggle">Projects</button>
          </div>
        </section>
        <a class="native-row" data-app-action-sidebar-thread-row data-app-action-sidebar-thread-id="local:${UUID}"
           data-app-action-sidebar-thread-pinned="false" aria-current="page">Current title
          <button aria-label="Pin">pin</button>
        </a>
      </div>
    </aside>
    <div data-app-shell-main-content-layout="thread-edge-scroll">
      <div data-codex-composer-root>
        <div class="ProseMirror" contenteditable="true"></div>
        <button aria-label="Send message">Send</button>
      </div>
    </div>
    <div id="codex-stash-v1-stale">stale</div>
  </body></html>`
  const window = new JSDOM(html, { url: 'https://codex.local/', pretendToBeVisual: true }).window
  let opened = 0
  window.document.querySelector(`[data-app-action-sidebar-thread-id="local:${UUID}"]`).addEventListener('click', () => {
    opened += 1
  })
  return {
    window,
    opened: () => opened,
  }
}

function pressStash(window) {
  window.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'h', metaKey: true, shiftKey: true, bubbles: true, cancelable: true }))
}

test('dom thread keys and stash-core canonical ids agree', () => {
  const samples = [
    `local:${UUID}`,
    UUID,
    'local:client-new-thread:abc12345',
    'Fix the sidebar',
    'local:harness.pi_abc12345',
    '',
    'short',
  ]
  for (const sample of samples) {
    let canonical = null
    try {
      canonical = canonicalThreadId(sample)
    } catch {
      canonical = null
    }
    assert.equal(domThreadKey(sample), canonical, sample)
  }
})

test('install is idempotent, stashes by id, opens the row, and uninstalls cleanly', () => {
  const { window, opened } = page()
  const warnings = []
  const first = install({
    window,
    isMac: true,
    reminderIntervalMs: 0,
    log: { warn: (message) => warnings.push(message), info() {} },
    now: () => new Date(2026, 9, 12, 15, 0, 0),
  })
  assert.equal(first.status, 'installed')
  assert.equal(first.hotkeyBound, true)
  assert.equal(window.document.getElementById('codex-stash-v1-stale'), null)
  assert.equal(window.document.querySelectorAll('#codex-stash-v1-section').length, 1)
  const section = window.document.getElementById('codex-stash-v1-section')
  assert.equal(section.className, 'native-section')
  assert.equal(section.nextElementSibling.classList.contains('projects'), true)
  assert.match(section.textContent, /收纳箱/)

  const second = install({ window, isMac: true, reminderIntervalMs: 0 })
  assert.equal(second.status, 'already-installed')
  assert.equal(window.document.querySelectorAll('#codex-stash-v1-section').length, 1)

  pressStash(window)
  const popover = window.document.getElementById('codex-stash-v1-popover')
  assert.ok(popover)
  popover.querySelector('[data-preset="tomorrow"]').click()
  const row = window.document.querySelector('.codex-stash-v1-row')
  assert.match(row.textContent, /Current title/)
  assert.equal(row.textContent.includes('reason'), false)
  assert.equal(row.querySelector('input'), null)
  row.querySelector('button').click()
  assert.equal(opened(), 1)
  assert.equal(
    window.document.querySelector(`[data-app-action-sidebar-thread-id="local:${UUID}"]`).getAttribute('data-app-action-sidebar-thread-pinned'),
    'false',
  )

  row.dispatchEvent(new window.MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 12, clientY: 20 }))
  const menu = window.document.getElementById('codex-stash-v1-menu')
  ;[...menu.querySelectorAll('[role=menuitem]')].find((button) => button.textContent.startsWith('移出')).click()
  assert.equal(window.document.querySelector('.codex-stash-v1-row'), null)

  pressStash(window)
  window.document.querySelector('[data-preset="in3days"]').click()
  assert.ok(window.document.querySelector('.codex-stash-v1-row'))
  window.document.querySelector('[aria-label="Send message"]').click()
  assert.equal(window.document.querySelector('.codex-stash-v1-row'), null)

  const nativeRows = window.document.querySelectorAll('[data-app-action-sidebar-thread-row]').length
  uninstall({ window })
  assert.equal(window[GUARD], undefined)
  assert.equal(window.document.getElementById('codex-stash-v1-section'), null)
  assert.equal(window.document.querySelectorAll('[data-app-action-sidebar-thread-row]').length, nativeRows)
  pressStash(window)
  assert.equal(window.document.getElementById('codex-stash-v1-popover'), null)
  assert.equal(warnings.length, 0)
})

test('a stashed row stays clickable when its native row is not rendered and a draft cannot be stashed', () => {
  const { window } = page()
  install({
    window,
    isMac: true,
    reminderIntervalMs: 0,
    log: { warn() {}, info() {} },
    now: () => new Date(2026, 9, 12, 15, 0, 0),
  })
  pressStash(window)
  window.document.querySelector('[data-preset="tomorrow"]').click()
  window.document.querySelector(`[data-app-action-sidebar-thread-id="local:${UUID}"]`).remove()
  window[GUARD].render()
  const button = window.document.querySelector('.codex-stash-v1-title')
  assert.equal(button.disabled, false)
  assert.match(button.title, /不在侧栏/)
  assert.equal(window.document.querySelector('[data-app-action-sidebar-thread-id]'), null)
  uninstall({ window })

  const { window: draftWindow } = page()
  draftWindow.document
    .querySelector(`[data-app-action-sidebar-thread-id="local:${UUID}"]`)
    .setAttribute('data-app-action-sidebar-thread-id', 'local:client-new-thread:abc12345')
  install({
    window: draftWindow,
    isMac: true,
    reminderIntervalMs: 0,
    log: { warn() {}, info() {} },
  })
  pressStash(draftWindow)
  const popover = draftWindow.document.getElementById('codex-stash-v1-popover')
  assert.match(popover.textContent, /稳定的 thread id/)
  assert.equal(popover.querySelector('[data-preset]'), null)
  assert.equal(draftWindow.document.querySelector('.codex-stash-v1-row'), null)
  uninstall({ window: draftWindow })
})

test('changing the date keeps the thread and a due reminder notifies once', () => {
  const { window } = page()
  const notes = []
  window.Notification = class Notification {
    static permission = 'granted'
    constructor(title, options) {
      notes.push({ title, body: options.body })
    }
  }
  let now = new Date(2026, 9, 12, 15, 0, 0)
  install({
    window,
    isMac: true,
    reminderIntervalMs: 0,
    now: () => now,
    log: { warn() {}, info() {} },
  })
  pressStash(window)
  window.document.querySelector('[data-preset="tomorrow"]').click()
  const row = window.document.querySelector('.codex-stash-v1-row')
  row.dispatchEvent(new window.MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 8, clientY: 8 }))
  ;[...window.document.querySelectorAll('#codex-stash-v1-menu [role=menuitem]')].find((button) => button.textContent.startsWith('改日期')).click()
  window.document.querySelector('[data-preset="nextMonday"]').click()
  assert.equal(window.document.querySelectorAll('.codex-stash-v1-row').length, 1)

  now = new Date(2026, 9, 20, 12, 0, 0)
  window[GUARD].render()
  window[GUARD].render()
  assert.equal(notes.length, 1)
  assert.equal(notes[0].title, '收纳箱')
  assert.equal(notes[0].body, 'Current title')
  uninstall({ window })
})

test('a broken sidebar disables the section and a reserved hotkey is not stolen', () => {
  const warnings = []
  const broken = new JSDOM(`<!doctype html><body>
    <div data-app-shell-main-content-layout></div>
    <aside data-testid="app-shell-floating-left-panel">
      <div data-app-action-sidebar-scroll><button>One</button><button>Two</button></div>
    </aside>
  </body></html>`).window
  const result = install({
    window: broken,
    isMac: true,
    reminderIntervalMs: 0,
    log: { warn: (...args) => warnings.push(args.join(' ')), info() {} },
  })
  assert.equal(result.status, 'installed')
  assert.equal(broken.document.getElementById('codex-stash-v1-section'), null)
  assert.match(warnings.join('\n'), /disabled/)
  uninstall({ window: broken })

  const { window } = page()
  window.__codexHostReservedHotkeys = ['Mod+Shift+H']
  const installed = install({
    window,
    isMac: true,
    reminderIntervalMs: 0,
    log: { warn: () => {}, info() {} },
  })
  assert.equal(installed.hotkeyBound, false)
  assert.match(installed.hotkeyConflict, /Mod\+Shift\+H/)
  pressStash(window)
  assert.equal(window.document.getElementById('codex-stash-v1-popover'), null)
  assert.ok(window.document.getElementById('codex-stash-v1-section'))
  uninstall({ window })
})

test('an older guard is uninstalled and stash-core stays DOM-free', () => {
  const { window } = page()
  let called = 0
  window[GUARD] = { version: '0.0.0', installed: true, uninstall: () => { called += 1 } }
  install({ window, isMac: true, reminderIntervalMs: 0, log: { warn() {}, info() {} } })
  assert.equal(called, 1)
  assert.equal(window[GUARD].version, '0.1.0')
  uninstall({ window })

  const sourceDir = join(here, '../../stash-core/src')
  const combined = readdirSync(sourceDir)
    .filter((name) => name.endsWith('.js') && name !== 'file-storage.js')
    .map((name) => readFileSync(join(sourceDir, name), 'utf8'))
    .join('\n')
  assert.equal(combined.includes('querySelector'), false)
  assert.equal(combined.includes('document.'), false)
  assert.doesNotMatch(combined, /function archive|archiveThread|deleteThread|pinThread/)
})

test('sending in another thread does not drop a different stash row', () => {
  const { window } = page()
  install({
    window,
    isMac: true,
    reminderIntervalMs: 0,
    log: { warn() {}, info() {} },
    now: () => new Date(2026, 9, 12, 15, 0, 0),
  })
  pressStash(window)
  window.document.querySelector('[data-preset="tomorrow"]').click()
  window.document.querySelector(`[data-app-action-sidebar-thread-id="local:${UUID}"]`).removeAttribute('aria-current')
  const scroll = window.document.querySelector('[data-app-action-sidebar-scroll]')
  const other = window.document.createElement('a')
  other.setAttribute('data-app-action-sidebar-thread-row', '')
  other.setAttribute('data-app-action-sidebar-thread-id', `local:${OTHER}`)
  other.setAttribute('aria-current', 'page')
  other.textContent = 'Other title'
  scroll.append(other)
  window.document.querySelector('[aria-label="Send message"]').click()
  assert.match(window.document.querySelector('.codex-stash-v1-row').textContent, /Current title/)
  uninstall({ window })
})

test('a hotkey the host already handled is skipped and warned once', () => {
  const { window } = page()
  const warnings = []
  install({ window, isMac: true, reminderIntervalMs: 0, log: { warn: (...a) => warnings.push(a.join(' ')), info() {} } })
  const claim = (e) => e.preventDefault()
  window.addEventListener('keydown', claim, true)
  pressStash(window)
  pressStash(window)
  window.removeEventListener('keydown', claim, true)
  assert.equal(window.document.getElementById('codex-stash-v1-popover'), null)
  assert.equal(warnings.filter((w) => /already handled/.test(w)).length, 1)
  pressStash(window)
  assert.ok(window.document.getElementById('codex-stash-v1-popover'))
  uninstall({ window })
})

function addNativeRow(window, id, title, { pinned = false } = {}) {
  const scroll = window.document.querySelector('[data-app-action-sidebar-scroll]')
  const pinnedSection = window.document.querySelector('[data-app-action-sidebar-section="pinned"]')
  const home = pinned ? pinnedSection : scroll
  // Mirrors live DOM: each pill sits in a Radix tooltip trigger span.
  home.insertAdjacentHTML(
    'beforeend',
    `<div class="group native-row" data-app-action-sidebar-thread-row data-app-action-sidebar-thread-id="local:${id}"
       data-app-action-sidebar-thread-pinned="${pinned}" data-app-action-sidebar-thread-title="${title}" role="button">${title}
       <div class="flex items-center gap-2 opacity-0 group-hover:opacity-100">
         <span data-state="closed" class="contents"><button type="button" class="pill" data-pill="" data-size="3xs" aria-label="${pinned ? '取消置顶聊天' : '置顶聊天'}"><span class="inner"><svg class="pin-icon"></svg></span></button></span>
         <span data-state="closed" class="contents"><button type="button" class="pill" data-pill="" data-size="3xs" aria-label="归档聊天">archive</button></span>
       </div></div>`,
  )
  const row = home.lastElementChild
  // Like Codex: pinning moves the row to the end of 置顶, unpinning moves it out.
  row.querySelector('[aria-label$="置顶聊天"]').addEventListener('click', (event) => {
    event.stopPropagation()
    const next = row.getAttribute('data-app-action-sidebar-thread-pinned') !== 'true'
    setTimeout(() => {
      row.setAttribute('data-app-action-sidebar-thread-pinned', String(next))
      ;(next ? pinnedSection : scroll).append(row)
    }, 5)
  })
  return row
}

test('native rows get a 收纳聊天 button outside the native tooltip trigger, own icon and tooltip', () => {
  const { window } = page()
  const row = addNativeRow(window, OTHER, 'Other thread')
  let navigated = 0
  row.addEventListener('click', () => (navigated += 1))
  install({ window, isMac: true, reminderIntervalMs: 0, log: { warn() {}, info() {} } })
  const button = row.querySelector('[id^="codex-stash-v1-act-"]')
  assert.ok(button, 'stash button injected')
  const group = row.querySelector('.group-hover\\:opacity-100')
  assert.equal(button.parentElement, group, 'direct child of the hover group, not inside a tooltip span')
  assert.equal(button.closest('[data-state]'), null)
  assert.equal(button.className, 'pill')
  assert.equal(button.getAttribute('aria-label'), '收纳聊天')
  assert.equal(button.hasAttribute('title'), false)
  assert.ok(button.querySelector('svg.codex-stash-v1-icon'))
  assert.equal(button.querySelector('.pin-icon'), null)
  button.dispatchEvent(new window.MouseEvent('focus'))
  button.focus()
  return new Promise((resolve) => setTimeout(resolve, 350)).then(() => {
    const tip = window.document.getElementById('codex-stash-v1-tooltip')
    assert.ok(tip)
    assert.equal(tip.textContent, '收纳聊天⇧⌘H')
    button.click()
    assert.equal(navigated, 0, 'clicking the action does not open the row')
    const pop = window.document.getElementById('codex-stash-v1-popover')
    assert.match(pop.textContent, /^收纳聊天 \(⇧⌘H\)Other thread/)
    pop.querySelector('[data-preset="tomorrow"]').click()
    const stashed = [...window.document.querySelectorAll('.codex-stash-v1-row')].map((r) => r.getAttribute('data-codex-stash-thread-id'))
    assert.deepEqual(stashed, [OTHER])
    uninstall({ window })
    assert.equal(window.document.querySelector('[id^="codex-stash-v1-"]'), null)
  })
})

test('stashing a pinned chat unpins it through the native pin control and confirms', async () => {
  const { window } = page()
  const pinned = addNativeRow(window, OTHER, 'Pinned thread', { pinned: true })
  const other = addNativeRow(window, '33333333-3333-3333-3333-333333333333', 'Untouched', { pinned: true })
  let archived = 0
  pinned.querySelector('[aria-label="归档聊天"]').addEventListener('click', () => (archived += 1))
  install({ window, isMac: true, reminderIntervalMs: 0, log: { warn() {}, info() {} } })
  pinned.querySelector('[id^="codex-stash-v1-act-"]').click()
  window.document.querySelector('[data-preset="tomorrow"]').click()
  await new Promise((resolve) => setTimeout(resolve, 200))
  assert.equal(pinned.getAttribute('data-app-action-sidebar-thread-pinned'), 'false')
  assert.equal(other.getAttribute('data-app-action-sidebar-thread-pinned'), 'true')
  assert.equal(archived, 0)
  assert.deepEqual(window[GUARD].lastUnpin, { threadId: OTHER, ok: true, wasPinned: true, position: { index: 0, beforeThreadId: THIRD_ID } })
  // An unpinned chat is left alone.
  pressStash(window)
  window.document.querySelector('[data-preset="tomorrow"]').click()
  await new Promise((resolve) => setTimeout(resolve, 50))
  assert.equal(window[GUARD].lastUnpin.wasPinned, false)
  uninstall({ window })
})

test('the hotkey targets a hovered native row, otherwise the open conversation', () => {
  const { window } = page()
  const row = addNativeRow(window, OTHER, 'Hovered thread')
  install({ window, isMac: true, reminderIntervalMs: 0, log: { warn() {}, info() {} } })
  row.dispatchEvent(new window.MouseEvent('pointerover', { bubbles: true }))
  pressStash(window)
  assert.match(window.document.getElementById('codex-stash-v1-popover').textContent, /Hovered thread/)
  window.document.querySelector('[data-preset="tomorrow"]').click()
  window.document.body.dispatchEvent(new window.MouseEvent('pointerover', { bubbles: true }))
  pressStash(window)
  window.document.querySelector('[data-preset="in3days"]').click()
  const ids = [...window.document.querySelectorAll('.codex-stash-v1-row')].map((r) => r.getAttribute('data-codex-stash-thread-id')).sort()
  assert.deepEqual(ids, [UUID, OTHER].sort())
  uninstall({ window })
})

test('section header "..." is a sort menu like native 置顶; choice is checked, persisted and applied', () => {
  const { window } = page()
  addNativeRow(window, OTHER, 'Alpha')
  install({ window, isMac: true, reminderIntervalMs: 0, log: { warn() {}, info() {} }, now: () => new Date(2026, 9, 12, 15) })
  pressStash(window)
  window.document.querySelector('[data-preset="nextMonday"]').click()
  window.document.querySelector(`[id="codex-stash-v1-act-${OTHER}"]`).click()
  window.document.querySelector('[data-preset="tomorrow"]').click()
  const order = () => [...window.document.querySelectorAll('.codex-stash-v1-title')].map((b) => b.textContent)
  assert.deepEqual(order(), ['Alpha', 'Current title'])
  window.document.getElementById('codex-stash-v1-section-more').click()
  const items = [...window.document.querySelectorAll('#codex-stash-v1-menu [role=menuitemradio]')]
  assert.deepEqual(items.map((i) => i.textContent), ['按到期日期', '按收纳时间', '按标题'])
  assert.deepEqual(items.map((i) => i.getAttribute('aria-checked')), ['true', 'false', 'false'])
  assert.ok(items[0].querySelector('svg'), 'checkmark on the current mode')
  assert.equal(window.document.querySelector('#codex-stash-v1-menu').textContent.includes('收纳当前会话'), false)
  items[1].click()
  assert.deepEqual(order(), ['Alpha', 'Current title'])
  window.document.getElementById('codex-stash-v1-section-more').click()
  window.document.querySelector('[data-action="sort-title"]').click()
  assert.equal(window.localStorage.getItem('codex-stash:v1:sort'), 'title')
  assert.equal(window[GUARD].sortMode, 'title')
  uninstall({ window })
})

test('collapse is applied in place for animation; row "..." opens 改日期/移出', () => {
  const { window } = page()
  install({ window, isMac: true, reminderIntervalMs: 0, log: { warn() {}, info() {} } })
  pressStash(window)
  window.document.querySelector('[data-preset="tomorrow"]').click()
  const section = window.document.getElementById('codex-stash-v1-section')
  const wrap = window.document.getElementById('codex-stash-v1-rows-wrap')
  window.document.getElementById('codex-stash-v1-toggle').click()
  assert.equal(window.document.getElementById('codex-stash-v1-section'), section, 'same node, not rebuilt')
  assert.equal(wrap.getAttribute('data-collapsed'), 'true')
  window.document.getElementById('codex-stash-v1-toggle').click()
  assert.equal(wrap.getAttribute('data-collapsed'), 'false')
  window.document.querySelector('.codex-stash-v1-row-more').click()
  const labels = [...window.document.querySelectorAll('#codex-stash-v1-menu [role=menuitem]')].map((i) => i.textContent)
  assert.deepEqual(labels, ['改日期⇧⌘D', '移出⇧⌘J'])
  uninstall({ window })
})

const THIRD = '33333333-3333-3333-3333-333333333333'
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
const key = (window, k) =>
  window.dispatchEvent(new window.KeyboardEvent('keydown', { key: k, metaKey: true, shiftKey: true, bubbles: true, cancelable: true }))

test('stash remembers the pin; 移出 re-pins through the native pill and reports the position', async () => {
  const { window } = page()
  const row = addNativeRow(window, OTHER, 'Pinned thread', { pinned: true })
  addNativeRow(window, THIRD, 'Next pinned', { pinned: true })
  install({ window, isMac: true, reminderIntervalMs: 0, log: { warn() {}, info() {} } })
  row.querySelector('[id^="codex-stash-v1-act-"]').click()
  window.document.querySelector('[data-preset="tomorrow"]').click()
  await wait(150)
  assert.equal(row.getAttribute('data-app-action-sidebar-thread-pinned'), 'false')
  const saved = JSON.parse(window.localStorage.getItem('codex-stash:v1:state') ?? 'null')
  const pin = saved ? saved.items[`local:${OTHER}`]?.pin : null
  if (saved) assert.deepEqual(pin, { wasPinned: true, index: 0, beforeThreadId: THIRD })
  window.document.querySelector(`[data-codex-stash-thread-id="local:${OTHER}"] .codex-stash-v1-row-more, [data-codex-stash-thread-id="${OTHER}"] .codex-stash-v1-row-more`).click()
  window.document.querySelector('[data-action="remove"]').click()
  await wait(400)
  assert.equal(row.getAttribute('data-app-action-sidebar-thread-pinned'), 'true')
  const repin = window[GUARD].lastRepin
  assert.equal(repin.ok, true)
  assert.equal(repin.via, 'row')
  assert.equal(repin.reason, 'remove')
  // The fixture has no native 置顶 sort menu: position is reported, not forced.
  assert.equal(repin.position.restored, false)
  uninstall({ window })
})

test('改日期 / 移出 hotkeys target the hovered stash row, else the open thread; menu shows hints', async () => {
  const { window } = page()
  addNativeRow(window, OTHER, 'Other thread')
  const result = install({ window, isMac: true, reminderIntervalMs: 0, log: { warn() {}, info() {} } })
  assert.equal(result.status, 'installed')
  assert.deepEqual(window[GUARD].rowHotkeys, { date: 'Mod+Shift+D', remove: 'Mod+Shift+J' })
  pressStash(window)
  window.document.querySelector('[data-preset="tomorrow"]').click()
  window.document.querySelector(`[id="codex-stash-v1-act-${OTHER}"]`).click()
  window.document.querySelector('[data-preset="tomorrow"]').click()
  const rowFor = (id) => [...window.document.querySelectorAll('.codex-stash-v1-row')].find((r) => r.getAttribute('data-codex-stash-thread-id').endsWith(id))
  rowFor(OTHER).querySelector('.codex-stash-v1-row-more').click()
  const kbds = [...window.document.querySelectorAll('#codex-stash-v1-menu .codex-stash-v1-kbd')].map((k) => k.textContent)
  assert.deepEqual(kbds, ['⇧⌘D', '⇧⌘J'])
  window.document.body.dispatchEvent(new window.MouseEvent('pointerdown', { bubbles: true }))
  window.document.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
  // Hovered stash row → 改日期 opens the editor for that row.
  rowFor(OTHER).dispatchEvent(new window.MouseEvent('pointerover', { bubbles: true }))
  key(window, 'd')
  assert.match(window.document.getElementById('codex-stash-v1-popover').textContent, /Other thread/)
  window.document.querySelector('[data-preset="nextMonday"]').click()
  // Hovered → 移出 removes exactly that row.
  rowFor(OTHER).dispatchEvent(new window.MouseEvent('pointerover', { bubbles: true }))
  key(window, 'j')
  assert.equal(rowFor(OTHER), undefined)
  assert.ok(rowFor(UUID))
  // Nothing hovered → the open thread's entry.
  window.document.body.dispatchEvent(new window.MouseEvent('pointerover', { bubbles: true }))
  key(window, 'j')
  assert.equal(rowFor(UUID), undefined)
  // Not stashed → the key is left to Codex.
  const event = new window.KeyboardEvent('keydown', { key: 'j', metaKey: true, shiftKey: true, bubbles: true, cancelable: true })
  window.dispatchEvent(event)
  assert.equal(event.defaultPrevented, false)
  uninstall({ window })
})

test('row hotkeys are configurable and never bind over a reserved combo', () => {
  const { window } = page()
  const warnings = []
  install({ window, isMac: true, reminderIntervalMs: 0, hotkeyDate: 'Mod+Shift+K', hotkeyRemove: 'Mod+Shift+U', log: { warn: (...a) => warnings.push(a.join(' ')), info() {} } })
  assert.deepEqual(window[GUARD].rowHotkeys, { date: 'Mod+Shift+K' })
  assert.ok(warnings.some((w) => w.includes('Mod+Shift+U')))
  uninstall({ window })
})

test('auto-unstash on a sent message also restores the pin', async () => {
  const { window } = page()
  const row = addNativeRow(window, OTHER, 'Pinned thread', { pinned: true })
  install({ window, isMac: true, reminderIntervalMs: 0, log: { warn() {}, info() {} } })
  row.querySelector('[id^="codex-stash-v1-act-"]').click()
  window.document.querySelector('[data-preset="tomorrow"]').click()
  await wait(150)
  assert.equal(row.getAttribute('data-app-action-sidebar-thread-pinned'), 'false')
  // Open that thread and send.
  window.document.querySelector('[aria-current="page"]').removeAttribute('aria-current')
  row.setAttribute('aria-current', 'page')
  window.document.querySelector('[aria-label="Send message"]').click()
  await wait(400)
  assert.equal(row.getAttribute('data-app-action-sidebar-thread-pinned'), 'true')
  assert.equal(window[GUARD].lastRepin.reason, 'message')
  uninstall({ window })
})
