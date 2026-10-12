import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { MAIN_RENDERER_PROBE } from '../../codex-adapter/src/index.js'
import { parseDebugPorts, discoverDebugPorts } from '../src/discover.js'
import { GUARD_CHECK_EXPRESSION, createSupervisor } from '../src/supervise.js'
import { SERVICE_LABEL, launchAgentPlist, service } from '../src/service.js'
import { parseArgs } from '../src/cli.js'

const PS = `
79768 /Applications/ChatGPT.app/Contents/MacOS/ChatGPT --remote-debugging-address=127.0.0.1 --remote-debugging-port=56583
79816 /Applications/ChatGPT.app/Contents/Frameworks/Codex Framework.framework/Helpers/Codex (Renderer).app/Contents/MacOS/Codex (Renderer) --type=renderer --remote-debugging-port=1111
 4242 /Applications/Other.app/Contents/MacOS/Other --remote-debugging-port=9333
 4343 /Applications/Codex.app/Contents/MacOS/Codex --remote-debugging-address=0.0.0.0 --remote-debugging-port=9444
 4444 /Applications/Codex.app/Contents/MacOS/Codex --remote-debugging-port=9555
`

test('debugger port is read from the Codex main process, not helpers or other apps', async () => {
  assert.deepEqual(parseDebugPorts(PS), [56583, 9555])
  assert.deepEqual(await discoverDebugPorts({ ps: async () => PS }), [56583, 9555])
  assert.deepEqual(parseDebugPorts(''), [])
})

test('watch without --port defers to discovery; other commands keep an explicit port', () => {
  assert.equal(parseArgs(['n', 'c', 'watch'], {}).port, null)
  assert.equal(parseArgs(['n', 'c', 'watch', '--port', '9222'], {}).port, 9222)
  assert.equal(parseArgs(['n', 'c', 'status'], { CODEX_STASH_CDP_PORT: '9333' }).port, 9333)
  assert.equal(parseArgs(['n', 'c', 'service', 'install'], {}).action, 'install')
  assert.throws(() => parseArgs(['n', 'c', 'service', 'bogus'], {}))
})

/** Fake browser: pages lose the guard on reload; ports can change. */
function browser() {
  const state = { port: 56583, pages: new Map(), clients: 0, closed: 0, scripts: 0 }
  const addPage = (id, shell = true) =>
    state.pages.set(id, { id, shell, mounted: false, injections: 0 })
  addPage('main')
  addPage('overlay', false)
  const target = (page) => ({
    id: page.id,
    type: 'page',
    title: page.id,
    url: 'app://-/index.html',
    webSocketDebuggerUrl: `ws://127.0.0.1:${state.port}/devtools/page/${page.id}`,
  })
  const deps = {
    discoverPorts: async () => (state.port ? [state.port] : []),
    listTargets: async (port) => {
      if (port !== state.port) throw new Error('ECONNREFUSED')
      return [...state.pages.values()].map(target)
    },
    openClient: async (t) => {
      state.clients += 1
      const page = state.pages.get(t.id)
      return {
        async send(method, params) {
          if (method === 'Page.addScriptToEvaluateOnNewDocument') {
            state.scripts += 1
            return { identifier: '1' }
          }
          if (method !== 'Runtime.evaluate') return {}
          const e = params.expression
          if (e === MAIN_RENDERER_PROBE) return { result: { value: { hasShell: page.shell } } }
          if (e === GUARD_CHECK_EXPRESSION) return { result: { value: page.mounted } }
          if (e.includes('__CODEX_STASH_AUTORUN')) {
            page.injections += 1
            page.mounted = true
          }
          return { result: { value: null } }
        },
        onEvent() {},
        close() {
          state.closed += 1
        },
      }
    },
  }
  return { state, deps, addPage }
}

function supervisor(deps, port = null) {
  const dir = mkdtempSync(join(tmpdir(), 'codex-stash-watch-'))
  let saved = null
  return createSupervisor({
    port,
    ...deps,
    bundleSource: '/*bundle*/',
    config: {},
    storage: { load: () => null, save: (s) => (saved = s) },
    acceptPersist() {},
    io: { log() {}, error() {} },
    timeoutMs: 200,
    dir,
    get saved() {
      return saved
    },
  })
}

test('watch injects once, stays idle while mounted, and re-injects after reload', async () => {
  const { state, deps } = browser()
  const sup = supervisor(deps)
  const first = await sup.tick()
  assert.equal(first.port, 56583)
  assert.deepEqual(first.attached, ['main'])
  assert.equal(state.pages.get('main').injections, 1)
  assert.equal(state.pages.get('overlay').injections, 0)
  await sup.tick()
  await sup.tick()
  assert.equal(state.pages.get('main').injections, 1, 'no duplicate injection while mounted')
  state.pages.get('main').mounted = false // Page.reload
  const after = await sup.tick()
  assert.deepEqual(after.reinjected, ['main'])
  assert.equal(state.pages.get('main').injections, 2)
  sup.close()
})

test('watch follows a new port after Codex restarts and a new window', async () => {
  const { state, deps, addPage } = browser()
  const sup = supervisor(deps)
  await sup.tick()
  state.port = 0 // Codex quit
  const gone = await sup.tick()
  assert.equal(gone.port, null)
  assert.equal(sup.sessions.size, 0)
  state.port = 61000 // relaunched by CodexHost on a new port
  state.pages.get('main').mounted = false
  addPage('second')
  const back = await sup.tick()
  assert.equal(back.port, 61000)
  assert.deepEqual(back.attached.sort(), ['main', 'second'])
  sup.close()
})

test('a fixed port is never replaced by discovery', async () => {
  const { deps } = browser()
  const sup = supervisor({ ...deps, discoverPorts: async () => [1] }, 56583)
  assert.equal((await sup.tick()).port, 56583)
  sup.close()
})

test('LaunchAgent plist runs watch with absolute node, RunAtLoad and KeepAlive', async () => {
  const plist = launchAgentPlist({ node: '/opt/homebrew/bin/node', script: '/x/codex-stash.mjs', logDir: '/L/codex-stash' })
  assert.match(plist, /<string>\/opt\/homebrew\/bin\/node<\/string>\s*<string>\/x\/codex-stash.mjs<\/string>\s*<string>watch<\/string>/)
  assert.match(plist, /<key>RunAtLoad<\/key><true\/>/)
  assert.match(plist, /<key>KeepAlive<\/key><true\/>/)
  assert.match(plist, /\/L\/codex-stash\/watch\.log/)
  assert.doesNotMatch(plist, /--port/)

  const home = mkdtempSync(join(tmpdir(), 'codex-stash-svc-'))
  const calls = []
  const lc = async (args) => (calls.push(args), { code: 0, stdout: '', stderr: '' })
  const installed = await service('install', { home, uid: 501, launchctl: lc, node: '/n' })
  assert.match(readFileSync(installed.plist, 'utf8'), new RegExp(SERVICE_LABEL))
  assert.deepEqual(calls.map((c) => c[0]), ['bootout', 'bootstrap'])
  assert.equal(calls[1][1], 'gui/501')
  await service('uninstall', { home, uid: 501, launchctl: lc })
  assert.throws(() => readFileSync(installed.plist))
})

test('service install retries bootstrap while the old job is still unloading', async () => {
  const home = mkdtempSync(join(tmpdir(), 'codex-stash-svc2-'))
  let boots = 0
  const lc = async (args) => {
    if (args[0] === 'bootstrap') {
      boots += 1
      return boots < 3 ? { code: 5, stdout: '', stderr: 'Input/output error' } : { code: 0, stdout: '', stderr: '' }
    }
    return { code: 0, stdout: '', stderr: '' }
  }
  const result = await service('install', { home, uid: 501, launchctl: lc, node: '/n', retryDelayMs: 1 })
  assert.equal(result.loaded, true)
  assert.equal(boots, 3)
})
