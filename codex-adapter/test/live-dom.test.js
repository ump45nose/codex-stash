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

test('live layout: section keys come from the heading attribute and stash goes after Pinned', () => {
  const { doc } = live()
  const adapter = createAdapter(doc)
  assert.equal(adapter.probe().ok, true)
  const pinned = doc.querySelector('[data-app-action-sidebar-section-heading="Pinned"]')
  assert.equal(adapter.sectionKey(pinned), 'pinned')
  assert.equal(adapter.sectionKey(doc.querySelector('[data-app-action-sidebar-section-heading="Recents"]')), 'recent')
  const point = adapter.mountPoint()
  assert.equal(point.before, pinned.nextElementSibling)
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

test('live layout: active row attribute wins and the title attribute is used', async () => {
  const { doc, recents } = live()
  recents.querySelector('[data-app-action-sidebar-section-toggle]').click()
  doc.querySelector('[data-app-action-sidebar-thread-row]').setAttribute('data-app-action-sidebar-thread-active', 'true')
  const adapter = createAdapter(doc)
  assert.equal(adapter.readCurrentThread().raw, `local:${A}`)
  assert.equal(adapter.getThreadTitle(A), '查找 CPA')
})

test('live layout: openThread expands a collapsed section, clicks, and restores collapse', async () => {
  const { doc, recents, clicks } = live()
  const adapter = createAdapter(doc)
  assert.equal(adapter.isThreadListed(A), false)
  const result = await adapter.openThread(A, { waitMs: 100, step: 10 })
  assert.equal(result.ok, true)
  assert.deepEqual(clicks, [A])
  assert.equal(recents.getAttribute('data-app-action-sidebar-section-collapsed'), 'true')
  const miss = await adapter.openThread('99999999-9999-9999-9999-999999999999', { waitMs: 20, step: 10 })
  assert.equal(miss.reason, 'not-in-sidebar')
  for (const s of doc.querySelectorAll('[data-app-action-sidebar-section]')) {
    assert.equal(s.getAttribute('data-app-action-sidebar-section-collapsed'), 'true')
  }
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
