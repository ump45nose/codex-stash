import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { JSDOM } from 'jsdom'
import { createAdapter } from '../src/adapter.js'
import { domThreadKey } from '../src/dom-thread.js'
import { SELECTOR_TABLE } from '../src/selectors.js'

const here = dirname(fileURLToPath(import.meta.url))
const UUID = '11111111-1111-1111-1111-111111111111'
const OTHER = '22222222-2222-2222-2222-222222222222'

function sidebarHtml({ current = UUID, draft = false, extra = '', route = '/' } = {}) {
  const currentAttr = draft ? 'local:client-new-thread:abc12345' : `local:${current}`
  return `<!doctype html>
    <html><body>
      <aside data-testid="app-shell-floating-left-panel" class="app-shell-left-panel">
        <div data-app-action-sidebar-scroll>
          <section data-app-action-sidebar-section="pinned" class="native-section">
            <div data-app-action-sidebar-section-heading class="native-heading">
              <button data-app-action-sidebar-section-toggle class="native-toggle" aria-expanded="true">Pinned</button>
            </div>
          </section>
          <section data-app-action-sidebar-section="projects" class="native-section">
            <div data-app-action-sidebar-section-heading class="native-heading">
              <button data-app-action-sidebar-section-toggle class="native-toggle">Projects</button>
            </div>
          </section>
          <a class="native-row" data-app-action-sidebar-thread-row data-app-action-sidebar-thread-id="local:${OTHER}"
             data-app-action-sidebar-thread-pinned="false">Other title</a>
          <a class="native-row" data-app-action-sidebar-thread-row data-app-action-sidebar-thread-id="${currentAttr}"
             data-app-action-sidebar-thread-pinned="false" aria-current="page">
            Current title
            <button aria-label="Pin" data-app-action-sidebar-thread-pinned="false">pin</button>
          </a>
          ${extra}
        </div>
      </aside>
      <div data-app-shell-main-content-layout="thread-edge-scroll">
        <div data-codex-composer-root>
          <div class="ProseMirror" contenteditable="true">hello</div>
          <button aria-label="Send message">Send</button>
          <button aria-label="Send feedback">Feedback</button>
        </div>
      </div>
    </body></html>`
}

function dom(html = sidebarHtml(), url = 'https://codex.local/') {
  return new JSDOM(html, { url, runScripts: 'outside-only' }).window.document
}

test('every selector table string is documented', () => {
  const markdown = readFileSync(join(here, '../SELECTORS.md'), 'utf8')
  const values = []
  JSON.stringify(SELECTOR_TABLE, (_key, value) => {
    if (typeof value === 'string') values.push(value)
    return value
  })
  for (const value of values) {
    assert.equal(markdown.includes(value), true, value)
  }
})

test('adapter sources do not import stash-core', () => {
  const sourceDir = join(here, '../src')
  const combined = readdirSync(sourceDir)
    .filter((name) => name.endsWith('.js'))
    .map((name) => readFileSync(join(sourceDir, name), 'utf8'))
    .join('\n')
  assert.equal(combined.includes('stash-core'), false)
  assert.equal(combined.includes('createStashStore'), false)
  assert.equal(combined.includes('localStorage'), false)
})

test('probe is healthy and chrome is cloned from the native section', () => {
  const adapter = createAdapter(dom(), { ignoreIdPrefix: 'codex-stash-v1-' })
  const health = adapter.probe()
  assert.equal(health.status, 'healthy')
  assert.equal(health.tableId, 'codex-desktop-26.623')
  const chrome = adapter.readChrome()
  assert.equal(chrome.sectionClass, 'native-section')
  assert.equal(chrome.toggleClass, 'native-toggle')
  assert.equal(chrome.rowClass, 'native-row')
  const point = adapter.mountPoint()
  assert.equal(point.after.getAttribute('data-app-action-sidebar-section'), 'projects', 'last native section in this fixture')
})

test('current thread id comes from the row attribute, not the title', () => {
  const adapter = createAdapter(dom())
  assert.deepEqual(adapter.readCurrentThread(), { raw: `local:${UUID}`, source: 'sidebar' })
  assert.equal(adapter.getThreadTitle(UUID), 'Current title')
  assert.equal(adapter.getThreadTitle('Current title'), null)
  assert.equal(domThreadKey('Current title'), null)
})

test('route and portal are fallbacks and a draft id is still returned raw', () => {
  const quiet = dom(`<!doctype html><body>
    <div data-app-shell-main-content-layout></div>
    <div data-above-composer-conversation-id="local:${OTHER}"></div>
  </body></html>`)
  assert.equal(createAdapter(quiet).readCurrentThread().source, 'composer')

  const routed = new JSDOM('<!doctype html><body><div data-app-shell-main-content-layout></div></body></html>', {
    url: `https://codex.local/local/${UUID}`,
  }).window.document
  assert.deepEqual(createAdapter(routed).readCurrentThread(), { raw: UUID, source: 'route' })

  const draft = createAdapter(dom(sidebarHtml({ draft: true })))
  assert.equal(draft.readCurrentThread().raw, 'local:client-new-thread:abc12345')
  assert.equal(domThreadKey(draft.readCurrentThread().raw), null)
})

test('openThread: already-open is a no-op, rendered row is a fallback, pin state untouched', async () => {
  const document = dom()
  let opened = null
  let pinnedClicks = 0
  const row = document.querySelector(`[data-app-action-sidebar-thread-id="local:${UUID}"]`)
  row.addEventListener('click', () => {
    opened = row.getAttribute('data-app-action-sidebar-thread-id')
  })
  row.querySelector('button').addEventListener('click', () => {
    pinnedClicks += 1
  })
  const adapter = createAdapter(document)
  // Already open → nothing to do. Another rendered row with no router → row click fallback.
  assert.deepEqual(await adapter.openThread(`local:${UUID}`), { ok: true, via: 'already' })
  assert.equal(opened, null)
  const other = document.querySelector(`[data-app-action-sidebar-thread-id="local:${OTHER}"]`)
  let otherOpened = 0
  other?.addEventListener('click', () => (otherOpened += 1))
  const res = await adapter.openThread(OTHER, { waitMs: 20, step: 10 })
  assert.equal(res.ok, Boolean(other))
  if (other) assert.equal(otherOpened, 1)
  assert.equal(pinnedClicks, 0)
  assert.equal(row.getAttribute('data-app-action-sidebar-thread-pinned'), 'false')
  assert.deepEqual(await adapter.openThread('99999999-9999-9999-9999-999999999999', { waitMs: 0 }), {
    ok: false,
    reason: 'not-navigated',
  })
})

test('user send is detected from the composer and from an explicit thread id event', () => {
  const document = dom()
  const adapter = createAdapter(document)
  const seen = []
  const stop = adapter.onUserMessage((raw) => seen.push(raw))
  const editor = document.querySelector('.ProseMirror')
  editor.dispatchEvent(new document.defaultView.KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
  editor.dispatchEvent(
    new document.defaultView.KeyboardEvent('keydown', { key: 'Enter', shiftKey: true, bubbles: true }),
  )
  document.querySelector('[aria-label="Send feedback"]').click()
  document.body.dispatchEvent(new document.defaultView.KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
  document.querySelector('[aria-label="Send message"]').click()
  document.defaultView.dispatchEvent(
    new document.defaultView.CustomEvent('codexhost:user-message', {
      detail: { threadId: `local:${OTHER}`, title: 'do not use this' },
    }),
  )
  assert.deepEqual(seen, [`local:${UUID}`, `local:${UUID}`, `local:${OTHER}`])
  stop()
  document.querySelector('[aria-label="Send message"]').click()
  assert.equal(seen.length, 3)
})

test('a sidebar full of unlabeled controls fails closed', () => {
  const document = dom(`<!doctype html><body>
    <div data-app-shell-main-content-layout></div>
    <aside data-testid="app-shell-floating-left-panel">
      <div data-app-action-sidebar-scroll>
        <button>One</button>
        <button>Two</button>
      </div>
    </aside>
  </body></html>`)
  const health = createAdapter(document).probe()
  assert.equal(health.status, 'broken')
  assert.match(health.diagnostic, /data-app-action-sidebar-thread-id/)
})

test('CodexHost extra nodes do not hide a healthy native sidebar', () => {
  const document = dom(
    sidebarHtml({
      extra: '<div class="codexhost-toolbar"><button>Pi</button><button>Claude</button></div>',
    }),
  )
  assert.equal(createAdapter(document).probe().status, 'healthy')
})

test('an empty sidebar is loading, and a non-shell document is no-window', () => {
  const loading = dom(`<!doctype html><body>
    <aside data-testid="app-shell-floating-left-panel"><div data-app-action-sidebar-scroll></div></aside>
  </body></html>`)
  assert.equal(createAdapter(loading).probe().status, 'loading')
  assert.equal(createAdapter(dom('<!doctype html><body><p>avatar</p></body></html>')).probe().status, 'no-window')
})
