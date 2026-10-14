// Fixture trimmed from a live Codex Desktop + CodexHost renderer (2026-10-12).
// Section keys live on data-app-action-sidebar-section-heading, collapsed
// sections render no rows, and the active row is marked by
// data-app-action-sidebar-thread-active instead of aria-current.
import assert from 'node:assert/strict'
import test from 'node:test'
import { JSDOM } from 'jsdom'
import { createAdapter } from '../src/adapter.js'

const A = '01a13021-139f-73f0-8dfc-691f42ce29d6'
const B = '01a12f6e-faee-7553-830b-96488188b1ea'

function section(key, label, collapsed) {
  return `<section class="relative px-row-x group/nav-section" data-app-action-sidebar-section=""
      data-app-action-sidebar-section-collapsed="${collapsed}" data-app-action-sidebar-section-heading="${key}">
    <div class="group/nav-section flex flex-col">
      <div class="group/nav-section-title flex items-center">
        <div class="min-w-0 flex-1 text-base font-medium text-tertiary"><div class="flex min-w-0 flex-1">
          <button data-app-action-sidebar-section-toggle="" type="button" class="group/section-toggle" aria-expanded="${!collapsed}">
            <span class="min-w-0 truncate">${label}</span><svg class="icon-disclosure${collapsed ? ' -rotate-90' : ''}"></svg>
          </button></div></div>
      </div>
      <div data-rows></div>
    </div></section>`
}

function live() {
  const html = `<!doctype html><body>
    <aside class="app-shell-left-panel"><div data-app-action-sidebar-scroll>
      <button aria-current="page" data-sidebar-destination="builtin:home">首页</button>
      ${section('Pinned', '置顶', true)}${section('Projects', '项目', true)}${section('Recents', '最近', true)}
    </div></aside>
    <div data-app-shell-main-content-layout><div data-above-composer-conversation-id="${B}"></div></div>
  </body>`
  const doc = new JSDOM(html, { url: 'app://-/index.html', runScripts: 'outside-only' }).window.document
  // Emulate React: expanding Recents renders rows, collapsing removes them.
  const recents = doc.querySelector('[data-app-action-sidebar-section-heading="Recents"]')
  const toggle = recents.querySelector('[data-app-action-sidebar-section-toggle]')
  const clicks = []
  toggle.addEventListener('click', () => {
    const open = toggle.getAttribute('aria-expanded') !== 'true'
    toggle.setAttribute('aria-expanded', String(open))
    recents.setAttribute('data-app-action-sidebar-section-collapsed', String(!open))
    const rows = recents.querySelector('[data-rows]')
    rows.innerHTML = open
      ? `<div data-app-action-sidebar-thread-row data-app-action-sidebar-thread-id="local:${A}"
           data-app-action-sidebar-thread-active="false" data-app-action-sidebar-thread-title="查找 CPA" role="button">查找 CPA<button>置顶聊天</button></div>`
      : ''
    rows.querySelector('[data-app-action-sidebar-thread-id]')?.addEventListener('click', () => clicks.push(A))
  })
  return { doc, recents, clicks }
}

test('live layout: section keys come from the heading attribute and stash goes after Recents (last)', () => {
  const { doc } = live()
  const adapter = createAdapter(doc)
  assert.equal(adapter.probe().ok, true)
  const pinned = doc.querySelector('[data-app-action-sidebar-section-heading="Pinned"]')
  assert.equal(adapter.sectionKey(pinned), 'pinned')
  assert.equal(adapter.sectionKey(doc.querySelector('[data-app-action-sidebar-section-heading="Recents"]')), 'recent')
  const point = adapter.mountPoint()
  const recents = doc.querySelector('[data-app-action-sidebar-section-heading="Recents"]')
  assert.equal(point.after, recents)
  assert.equal(point.parent, recents.parentElement)
  const chrome = adapter.readChrome()
  assert.match(chrome.headingClass, /nav-section-title/)
  assert.match(chrome.headingTextClass, /text-tertiary/)
  assert.match(chrome.innerClass, /flex-col/)
  assert.match(chrome.chevronSvg, /icon-disclosure/)
})

test('live layout: the home button aria-current is not a thread; composer id is used', () => {
  const { doc } = live()
  assert.deepEqual(createAdapter(doc).readCurrentThread(), { raw: B, source: 'composer' })
})

test('live layout: the visible thread view wins over a lagging sidebar mark; mark is the fallback', async () => {
  const { doc, recents } = live()
  recents.querySelector('[data-app-action-sidebar-section-toggle]').click()
  const row = doc.querySelector('[data-app-action-sidebar-thread-row]')
  row.setAttribute('data-app-action-sidebar-thread-active', 'true')
  row.setAttribute('data-app-action-sidebar-thread-host-id', 'remote-ssh-discovered:box')
  const adapter = createAdapter(doc)
  const portal = doc.querySelector('[data-above-composer-conversation-id]')
  const shown = portal.getAttribute('data-above-composer-conversation-id')
  // Visible composer shows another chat → it is the current one.
  if (shown && !shown.endsWith(A)) {
    const reading = adapter.readCurrentThread()
    assert.equal(reading.source, 'composer')
    assert.equal(reading.raw, shown.replace(/^local:/, ''))
  }
  // Visible composer agrees with the row → host comes from the row.
  portal.setAttribute('data-above-composer-conversation-id', A)
  assert.deepEqual(adapter.readCurrentThread(), { raw: A, source: 'composer', hostId: 'remote-ssh-discovered:box' })
  // No visible thread view → the sidebar mark is the fallback.
  portal.remove()
  assert.equal(adapter.readCurrentThread().raw, `local:${A}`)
  assert.equal(adapter.getThreadTitle(A), '查找 CPA')
})

test('live layout: openThread navigates via Codex route message and never touches section collapse', async () => {
  const { doc, clicks } = live()
  const win = doc.defaultView
  const paths = []
  // Stand-in for Codex's router: the message bus switches the open conversation.
  win.addEventListener('message', (event) => {
    if (event.data?.type !== 'navigate-to-route') return
    paths.push(event.data.path)
    const id = event.data.path.replace('/local/', '')
    if (id !== '99999999-9999-9999-9999-999999999999') doc.querySelector('[data-above-composer-conversation-id]').setAttribute('data-above-composer-conversation-id', id)
  })
  const toggles = []
  for (const t of doc.querySelectorAll('[data-app-action-sidebar-section-toggle]')) t.addEventListener('click', () => toggles.push(t))
  const before = [...doc.querySelectorAll('[data-app-action-sidebar-section]')].map((s) => s.getAttribute('data-app-action-sidebar-section-collapsed'))
  const adapter = createAdapter(doc)
  assert.equal(adapter.isThreadListed(A), false, 'row not rendered: section collapsed')
  const result = await adapter.openThread(A, { waitMs: 300, step: 10 })
  assert.deepEqual(result, { ok: true, via: 'route' })
  assert.deepEqual(paths, [`/local/${A}`])
  assert.deepEqual(clicks, [])
  const miss = await adapter.openThread('99999999-9999-9999-9999-999999999999', { waitMs: 50, step: 10 })
  assert.equal(miss.ok, false)
  assert.equal(toggles.length, 0, 'no section toggle clicked')
  assert.deepEqual([...doc.querySelectorAll('[data-app-action-sidebar-section]')].map((s) => s.getAttribute('data-app-action-sidebar-section-collapsed')), before)
})

test('live layout: current title falls back to document.title for display only', () => {
  const { doc } = live()
  const adapter = createAdapter(doc)
  assert.equal(adapter.readCurrentTitle(), null)
  doc.title = '搭建 CLI 骨架'
  assert.equal(adapter.readCurrentTitle(), '搭建 CLI 骨架')
  assert.equal(adapter.readCurrentThread().raw, B)
})

test('live layout: a stale portal from a hidden cached thread view is ignored', () => {
  const html = `<!doctype html><body>
    <aside class="app-shell-left-panel"><div data-app-action-sidebar-scroll>${section('Recents', '最近', true)}</div></aside>
    <div data-app-shell-main-content-layout>
      <div class="workspace" style="display:none"><div data-above-composer-conversation-id="${B}" style="display:none"></div>
        <div data-codex-composer-root><div class="ProseMirror" contenteditable="true"></div></div></div>
      <div class="workspace"><div data-above-composer-conversation-id="${A}" style="display:none"></div>
        <div data-codex-composer-root><div class="ProseMirror" contenteditable="true"></div></div></div>
    </div></body>`
  const doc = new JSDOM(html, { url: 'app://-/index.html' }).window.document
  const adapter = createAdapter(doc)
  assert.deepEqual(adapter.readCurrentThread(), { raw: A, source: 'composer' })
  const editors = doc.querySelectorAll('.ProseMirror')
  assert.equal(adapter.composerContains(editors[1]), true)
})
