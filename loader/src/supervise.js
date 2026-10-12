import { chooseNewer, emptyState, parseState } from '../../stash-core/src/index.js'
import { READ_STATE_EXPRESSION, evaluate, installExpression, probeRenderer, writeStateExpression } from './cdp.js'

export const GUARD_CHECK_EXPRESSION =
  '(() => { const g = globalThis.__codexStash_v1; return Boolean(g && g.installed) })()'

/**
 * Long-running injector behind `codex-stash watch`.
 *
 * Each tick: resolve the debugger port (fixed, or discovered from the running
 * Codex process), keep one CDP session per main renderer, and re-inject when
 * the page lost the guard (reload, Codex restart, new window). The session is
 * kept open on purpose: Page.addScriptToEvaluateOnNewDocument and
 * Runtime.addBinding only live as long as the session that registered them.
 *
 * @param {{
 *   port?: number | null,
 *   discoverPorts: () => Promise<number[]>,
 *   listTargets: (port: number) => Promise<any[]>,
 *   openClient: (target: any) => Promise<any>,
 *   bundleSource: string,
 *   config: object,
 *   storage: { load: () => any, save: (state: any) => void },
 *   acceptPersist: (payload: string) => void,
 *   io: { log: (...a: unknown[]) => void, error: (...a: unknown[]) => void },
 *   timeoutMs?: number,
 * }} options
 */
export function createSupervisor(options) {
  const { io } = options
  const timeoutMs = options.timeoutMs ?? 5000
  /** @type {Map<string, { client: any, target: any }>} */
  const sessions = new Map()
  /** non-shell targets, re-probed every tick in case they become a shell */
  let currentPort = null

  function withTimeout(promise) {
    let timer
    return Promise.race([
      promise,
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error('CDP timeout')), timeoutMs)
      }),
    ]).finally(() => clearTimeout(timer))
  }

  function drop(id) {
    const session = sessions.get(id)
    sessions.delete(id)
    try {
      session?.client.close()
    } catch {
      /* already closed */
    }
  }

  function dropAll() {
    for (const id of [...sessions.keys()]) drop(id)
  }

  async function resolvePort() {
    if (options.port) return options.port
    const candidates = await options.discoverPorts()
    if (currentPort && candidates.includes(currentPort)) return currentPort
    return candidates[0] ?? null
  }

  async function syncState(client) {
    const raw = await evaluate(client, READ_STATE_EXPRESSION)
    let pageState = emptyState()
    if (typeof raw === 'string' && raw) {
      try {
        pageState = parseState(JSON.parse(raw)).state
      } catch {
        /* keep empty */
      }
    }
    const winner = chooseNewer(pageState, options.storage.load())
    options.storage.save(winner)
    if (JSON.stringify(winner) !== JSON.stringify(pageState)) {
      await evaluate(client, writeStateExpression(JSON.stringify(winner)))
    }
  }

  async function attach(target) {
    const client = await withTimeout(options.openClient(target))
    try {
      const probe = await withTimeout(probeRenderer(client))
      if (!probe?.hasShell) {
        client.close()
        return false
      }
      const source = installExpression(options.bundleSource, options.config)
      await withTimeout(client.send('Runtime.addBinding', { name: 'codexStashPersist' }))
      client.onEvent?.((message) => {
        if (message.method !== 'Runtime.bindingCalled' || message.params?.name !== 'codexStashPersist') return
        try {
          options.acceptPersist(message.params.payload)
        } catch (error) {
          io.error(error instanceof Error ? error.message : error)
        }
      })
      await withTimeout(syncState(client))
      await withTimeout(client.send('Page.addScriptToEvaluateOnNewDocument', { source }))
      const already = await withTimeout(evaluate(client, GUARD_CHECK_EXPRESSION))
      if (!already) await withTimeout(evaluate(client, source))
      sessions.set(target.id, { client, target, source })
      io.log(`[codex-stash] attached ${target.id} (${target.title ?? ''})${already ? ' already mounted' : ' injected'}`)
      return true
    } catch (error) {
      try {
        client.close()
      } catch {
        /* ignore */
      }
      throw error
    }
  }

  async function ensure(id) {
    const session = sessions.get(id)
    const mounted = await withTimeout(evaluate(session.client, GUARD_CHECK_EXPRESSION))
    if (mounted) return 'ok'
    // Document replaced before our new-document script ran, or the shell was
    // still loading: inject only once the page is a Codex shell.
    const probe = await withTimeout(probeRenderer(session.client))
    if (!probe?.hasShell) return 'waiting'
    await withTimeout(evaluate(session.client, session.source))
    io.log(`[codex-stash] re-injected ${id}`)
    return 'reinjected'
  }

  async function tick() {
    const report = { port: null, attached: [], reinjected: [], dropped: [] }
    let port
    try {
      port = await resolvePort()
    } catch (error) {
      io.error('[codex-stash] port discovery failed', error instanceof Error ? error.message : error)
      return report
    }
    if (port !== currentPort) {
      if (currentPort) io.log(`[codex-stash] debugger port ${currentPort} -> ${port ?? 'none'}`)
      dropAll()
      currentPort = port
    }
    report.port = port
    if (!port) return report
    let targets
    try {
      targets = await withTimeout(options.listTargets(port))
    } catch {
      dropAll()
      return report
    }
    const live = new Set(targets.map((target) => target.id))
    for (const id of [...sessions.keys()]) {
      if (!live.has(id)) {
        drop(id)
        report.dropped.push(id)
      }
    }
    for (const target of targets) {
      try {
        if (sessions.has(target.id)) {
          if ((await ensure(target.id)) === 'reinjected') report.reinjected.push(target.id)
        } else if (await attach(target)) {
          report.attached.push(target.id)
        }
      } catch (error) {
        drop(target.id)
        report.dropped.push(target.id)
        io.error(`[codex-stash] ${target.id}:`, error instanceof Error ? error.message : error)
      }
    }
    return report
  }

  return { tick, close: dropAll, sessions }
}
