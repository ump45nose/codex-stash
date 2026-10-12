import assert from 'node:assert/strict'
import test from 'node:test'
import {
  UNINSTALL_EXPRESSION,
  assertLoopbackWebSocket,
  debuggerPort,
  installExpression,
  isAttachablePage,
  writeStateExpression,
} from '../src/cdp.js'

test('debugger urls must be loopback and pages must be real documents', () => {
  assert.doesNotThrow(() => assertLoopbackWebSocket('ws://127.0.0.1:9222/devtools/page/1'))
  assert.throws(() => assertLoopbackWebSocket('ws://10.0.0.8:9222/devtools/page/1'), /non-loopback/)
  assert.throws(() => debuggerPort(0), TypeError)
  assert.equal(debuggerPort('9222'), 9222)
  assert.equal(isAttachablePage({ type: 'page', url: 'app://-/index.html', webSocketDebuggerUrl: 'ws://127.0.0.1:9222/devtools/page/1' }), true)
  assert.equal(isAttachablePage({ type: 'page', url: 'devtools://devtools/bundled/inspector.html', webSocketDebuggerUrl: 'ws://127.0.0.1/devtools/page/2' }), false)
  assert.equal(isAttachablePage({ type: 'worker', url: 'app://worker', webSocketDebuggerUrl: 'ws://127.0.0.1/devtools/page/3' }), false)
})

test('install and uninstall expressions are explicit and do not carry a raw seed into the persistent script by accident', () => {
  const source = installExpression('globalThis.__stashBundle = 1;', { hotkey: 'Mod+Shift+S', locale: 'zh' })
  assert.match(source, /__CODEX_STASH_AUTORUN = true/)
  assert.match(source, /Mod\+Shift\+S/)
  assert.match(source, /__stashBundle = 1/)
  assert.doesNotMatch(source, /<script/)
  assert.match(UNINSTALL_EXPRESSION, /__codexStash_v1/)
  assert.match(UNINSTALL_EXPRESSION, /codex-stash-v1-/)
  assert.equal(writeStateExpression('{"version":1}'), `localStorage.setItem('codex-stash:v1', ${JSON.stringify('{"version":1}')})`)
})
