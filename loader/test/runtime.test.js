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
  window.dispatchEvent(new window.KeyboardEvent('keydown', { key: 's', metaKey: true, shiftKey: true, bubbles: true }))
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
  ;[...menu.querySelectorAll('button')].find((button) => button.textContent === '移出').click()
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

test('a stashed row greys out when the thread disappears and a draft cannot be stashed', () => {
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
  assert.equal(button.disabled, true)
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
  ;[...window.document.querySelectorAll('#codex-stash-v1-menu button')].find((button) => button.textContent === '改日期').click()
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
  window.__codexHostReservedHotkeys = ['Mod+Shift+S']
  const installed = install({
    window,
    isMac: true,
    reminderIntervalMs: 0,
    log: { warn: () => {}, info() {} },
  })
  assert.equal(installed.hotkeyBound, false)
  assert.match(installed.hotkeyConflict, /Mod\+Shift\+S/)
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
