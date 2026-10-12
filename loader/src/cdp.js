import { MAIN_RENDERER_PROBE } from '../../codex-adapter/src/index.js'

/**
 * @param {string} wsUrl
 */
export function assertLoopbackWebSocket(wsUrl) {
  const url = new URL(wsUrl)
  if (url.protocol !== 'ws:' && url.protocol !== 'wss:') {
    throw new Error(`refusing debugger protocol ${url.protocol}`)
  }
  if (!['127.0.0.1', 'localhost', '::1'].includes(url.hostname)) {
    throw new Error(`refusing non-loopback debugger host ${url.hostname}`)
  }
}

/**
 * @param {number | string} port
 */
export function debuggerPort(port) {
  const value = Number(port)
  if (!Number.isInteger(value) || value < 1 || value > 65535) {
    throw new TypeError(`invalid debugger port: ${port}`)
  }
  return value
}

/**
 * @param {{ type?: string, url?: string, webSocketDebuggerUrl?: string }} target
 */
export function isAttachablePage(target) {
  if (!target || target.type !== 'page' || typeof target.webSocketDebuggerUrl !== 'string') return false
  const url = target.url || ''
  if (url.startsWith('devtools://') || url.startsWith('chrome-extension://')) return false
  return true
}

/**
 * @param {string} wsUrl
 */
export function connectCdp(wsUrl) {
  assertLoopbackWebSocket(wsUrl)
  const ws = new WebSocket(wsUrl)
  let nextId = 0
  /** @type {Map<number, { resolve: (value: any) => void, reject: (error: Error) => void }>} */
  const pending = new Map()
  /** @type {Set<(message: any) => void>} */
  const listeners = new Set()
  const ready = new Promise((resolve, reject) => {
    ws.addEventListener('open', () => resolve(undefined))
    ws.addEventListener('error', () => reject(new Error(`CDP connection failed for ${wsUrl}`)))
  })
  ws.addEventListener('message', (event) => {
    const message = JSON.parse(String(event.data))
    if (message.id && pending.has(message.id)) {
      const waiter = pending.get(message.id)
      pending.delete(message.id)
      if (message.error) waiter.reject(new Error(message.error.message || 'CDP error'))
      else waiter.resolve(message.result)
      return
    }
    for (const listener of listeners) listener(message)
  })
  return {
    ready,
    send(method, params = {}) {
      const id = ++nextId
      return new Promise((resolve, reject) => {
        pending.set(id, { resolve, reject })
        ws.send(JSON.stringify({ id, method, params }))
      })
    },
    onEvent(listener) {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    close() {
      ws.close()
    },
  }
}

/**
 * @param {{ send: (method: string, params?: object) => Promise<any> }} client
 * @param {string} expression
 */
export async function evaluate(client, expression) {
  const result = await client.send('Runtime.evaluate', {
    expression,
    returnByValue: true,
    awaitPromise: true,
  })
  if (result.exceptionDetails) {
    const text = result.exceptionDetails.text || result.exceptionDetails.exception?.description || 'evaluate failed'
    throw new Error(text)
  }
  return result.result?.value
}

/**
 * @param {{ send: (method: string, params?: object) => Promise<any> }} client
 */
export async function probeRenderer(client) {
  return evaluate(client, MAIN_RENDERER_PROBE)
}

/**
 * @param {string} bundleSource
 * @param {object} [pageOptions]
 */
export function installExpression(bundleSource, pageOptions) {
  const prelude = pageOptions
    ? `globalThis.__CODEX_STASH_OPTIONS = ${JSON.stringify(pageOptions)};`
    : 'globalThis.__CODEX_STASH_OPTIONS = globalThis.__CODEX_STASH_OPTIONS || {};'
  return `${prelude}\nglobalThis.__CODEX_STASH_AUTORUN = true;\n${bundleSource}\n`
}

export const UNINSTALL_EXPRESSION = `(() => {
  const guard = globalThis.__codexStash_v1;
  if (guard && typeof guard.uninstall === 'function') guard.uninstall();
  document.querySelectorAll('[id]').forEach((node) => {
    if (node.id.startsWith('codex-stash-v1-')) node.remove();
  });
  return { uninstalled: true };
})()`

export const READ_STATE_EXPRESSION = `localStorage.getItem('codex-stash:v1')`

/**
 * @param {string | null | undefined} raw
 */
export function writeStateExpression(raw) {
  return `localStorage.setItem('codex-stash:v1', ${JSON.stringify(raw ?? '')})`
}
