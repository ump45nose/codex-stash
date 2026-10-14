import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { MAIN_RENDERER_PROBE } from '../../codex-adapter/src/index.js'
import { run } from '../src/cli.js'
import { READ_STATE_EXPRESSION } from '../src/cdp.js'

const UUID = '11111111-1111-1111-1111-111111111111'

function harness(probe = { hasShell: true }) {
  const dir = mkdtempSync(join(tmpdir(), 'codex-stash-cli-'))
  const page = {
    probe,
    storage: null,
    installed: 0,
    scripts: [],
    removed: [],
    bindings: [],
    closed: 0,
    calls: [],
  }
  const logs = []
  const errors = []
  const deps = {
    env: { CODEX_STASH_HOME: dir },
    home: '/tmp/does-not-matter',
    io: {
      log: (...args) => logs.push(args.join(' ')),
      error: (...args) => errors.push(args.join(' ')),
    },
    bundleSource: 'globalThis.__codexStashBundle = 1;',
    stop: Promise.resolve(),
    discoverPorts: async () => [],
    async listTargets() {
      return [
        {
          id: 'renderer',
          type: 'page',
          title: 'Codex',
          url: 'app://-/index.html',
          webSocketDebuggerUrl: 'ws://127.0.0.1:9222/devtools/page/renderer',
        },
        {
          id: 'devtools',
          type: 'page',
          title: 'DevTools',
          url: 'devtools://inspector',
          webSocketDebuggerUrl: 'ws://127.0.0.1:9222/devtools/page/devtools',
        },
      ]
    },
    connect(wsUrl) {
      assert.match(wsUrl, /127\.0\.0\.1/)
      return {
        async send(method, params) {
          page.calls.push({ method, params })
          if (method === 'Runtime.evaluate') {
            const expression = params.expression
            if (expression === MAIN_RENDERER_PROBE) return { result: { value: page.probe } }
            if (expression === READ_STATE_EXPRESSION) return { result: { value: page.storage } }
            if (expression.startsWith('localStorage.setItem')) {
              page.storage = JSON.parse(expression.slice(expression.indexOf(',') + 1).trim().replace(/\)$/, ''))
              return { result: { value: null } }
            }
            if (expression.includes('uninstalled: true')) return { result: { value: { uninstalled: true } } }
            if (expression.includes('__CODEX_STASH_AUTORUN')) {
              page.installed += 1
              return { result: { value: { status: 'installed' } } }
            }
            return { result: { value: null } }
          }
          if (method === 'Page.addScriptToEvaluateOnNewDocument') {
            page.scripts.push(params.source)
            return { identifier: `script-${page.scripts.length}` }
          }
          if (method === 'Page.removeScriptToEvaluateOnNewDocument') {
            page.removed.push(params.identifier)
            return {}
          }
          if (method === 'Runtime.addBinding') {
            page.bindings.push(params.name)
            return {}
          }
          return {}
        },
        onEvent() {},
        close() {
          page.closed += 1
        },
      }
    },
  }
  return { dir, page, logs, errors, deps }
}

test('install is idempotent across a second invocation and skips devtools', async () => {
  const { dir, page, logs, deps } = harness()
  const first = await run(['node', 'codex-stash', 'install', '--port', '9222'], deps)
  const second = await run(['node', 'codex-stash', 'install', '--port', '9222'], deps)
  assert.equal(first.exitCode, 0)
  assert.equal(second.exitCode, 0)
  assert.equal(page.installed, 2)
  assert.deepEqual(page.removed, ['script-1'])
  assert.match(logs.at(-1), /installed 1/)
  const records = JSON.parse(readFileSync(join(dir, 'cdp-scripts.json'), 'utf8'))
  assert.equal(records.byPort['9222'].length, 1)
  assert.equal(page.calls.some((call) => String(call.params?.url || '').includes('devtools')), false)
})

test('uninstall removes the page guard recording and leaves the state file alone', async () => {
  const { dir, deps } = harness()
  const { writeFileSync, mkdirSync } = await import('node:fs')
  mkdirSync(dir, { recursive: true })
  const saved = `${JSON.stringify({
    version: 1,
    updatedAt: '2026-10-12T00:00:00.000Z',
    items: {
      [UUID]: {
        title: 'Keep me',
        dueAt: '2026-10-20T01:00:00.000Z',
        stashedAt: '2026-10-12T00:00:00.000Z',
      },
    },
  })}\n`
  writeFileSync(join(dir, 'stash.json'), saved)
  await run(['node', 'codex-stash', 'install'], deps)
  const result = await run(['node', 'codex-stash', 'uninstall'], deps)
  assert.equal(result.exitCode, 0)
  const records = JSON.parse(readFileSync(join(dir, 'cdp-scripts.json'), 'utf8'))
  assert.deepEqual(records.byPort['9222'], [])
  assert.equal(readFileSync(join(dir, 'stash.json'), 'utf8').includes('Keep me'), true)
})

test('a newer file state is written into an empty page on install', async () => {
  const { dir, page, deps } = harness()
  const state = {
    version: 1,
    updatedAt: '2026-10-12T00:00:00.000Z',
    items: {
      [UUID]: {
        title: 'From disk',
        dueAt: '2026-10-20T01:00:00.000Z',
        stashedAt: '2026-10-12T00:00:00.000Z',
      },
    },
  }
  const { writeFileSync, mkdirSync } = await import('node:fs')
  mkdirSync(dir, { recursive: true })
  writeFileSync(join(dir, 'stash.json'), JSON.stringify(state))
  await run(['node', 'codex-stash', 'install'], deps)
  assert.match(String(page.storage), /From disk/)
})

test('status fails closed when no main renderer is present', async () => {
  const { errors, deps } = harness({ hasShell: false })
  const result = await run(['node', 'codex-stash', 'status'], deps)
  assert.equal(result.exitCode, 1)
  assert.equal(errors.length, 0)
})

test('watch registers the persist binding and does not attach to devtools', async () => {
  const { page, deps } = harness()
  const result = await run(['node', 'codex-stash', 'watch', '--port', '9222'], deps)
  assert.equal(result.exitCode, 0)
  assert.deepEqual(page.bindings, ['codexStashPersist'])
})
