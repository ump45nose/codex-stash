import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import { chooseNewer, emptyState, parseState } from '../../stash-core/src/index.js'
import { createJsonFileStorage } from '../../stash-core/src/file-storage.js'
import {
  READ_STATE_EXPRESSION,
  UNINSTALL_EXPRESSION,
  connectCdp,
  debuggerPort,
  evaluate,
  installExpression,
  isAttachablePage,
  probeRenderer,
  writeStateExpression,
} from './cdp.js'
import { stashHome, stashPaths } from './paths.js'

const HELP = `codex-stash — Codex Desktop 收纳箱

Usage:
  codex-stash install [--port 9222] [--hotkey Mod+Shift+H] [--locale zh|en]
  codex-stash uninstall [--port 9222]
  codex-stash status [--port 9222]
  codex-stash export [--port 9222]
  codex-stash import [--port 9222]
  codex-stash watch [--port 9222]
  codex-stash help

The debugger must already be listening on 127.0.0.1. This tool never writes
~/.codex and never archives or deletes conversations.

安装、卸载、状态、导入导出和热键说明见仓库 README。
`

/**
 * @param {string[]} argv
 * @param {NodeJS.ProcessEnv} [env]
 */
export function parseArgs(argv, env = process.env) {
  const args = argv.slice(2)
  const command = args[0] && !args[0].startsWith('-') ? args[0] : 'help'
  let port = env.CODEX_STASH_CDP_PORT || '9222'
  let hotkey = null
  let locale = null
  for (let index = 0; index < args.length; index += 1) {
    const token = args[index]
    if (token === '--port') port = required(args, ++index, '--port')
    else if (token === '--hotkey') hotkey = required(args, ++index, '--hotkey')
    else if (token === '--locale') locale = required(args, ++index, '--locale')
    else if (token === '--help' || token === '-h') return { command: 'help', port: null, hotkey, locale }
    else if (token.startsWith('-')) throw new TypeError(`unknown argument: ${token}`)
  }
  if (!['install', 'uninstall', 'status', 'export', 'import', 'watch', 'help'].includes(command)) {
    throw new TypeError(`unknown command: ${command}`)
  }
  return {
    command,
    port: command === 'help' ? null : debuggerPort(port),
    hotkey,
    locale,
  }
}

/**
 * @param {string[]} argv
 * @param {{
 *   env?: NodeJS.ProcessEnv,
 *   home?: string,
 *   io?: { log: (...args: unknown[]) => void, error: (...args: unknown[]) => void },
 *   listTargets?: (port: number) => Promise<object[]>,
 *   connect?: (wsUrl: string) => any,
 *   bundleSource?: string,
 *   stop?: Promise<void>,
 * }} [deps]
 */
export async function run(argv, deps = {}) {
  const io = deps.io ?? { log: console.log, error: console.error }
  let parsed
  try {
    parsed = parseArgs(argv, deps.env ?? process.env)
  } catch (error) {
    io.error(error instanceof Error ? error.message : error)
    return { exitCode: 1 }
  }
  if (parsed.command === 'help') {
    io.log(HELP)
    return { exitCode: 0 }
  }

  const home = stashHome(deps.env ?? process.env, deps.home)
  const paths = stashPaths(home)
  const storage = createJsonFileStorage(paths.state)
  try {
    if (parsed.command === 'status') {
      const targets = await targetsOf(parsed.port, deps)
      const rows = []
      for (const target of targets) {
        const client = await openClient(deps, target)
        try {
          const probe = await probeRenderer(client)
          rows.push({ targetId: target.id ?? null, title: target.title ?? '', url: target.url ?? '', probe })
        } finally {
          client.close()
        }
      }
      io.log(JSON.stringify({ port: parsed.port, targets: rows }, null, 2))
      return { exitCode: rows.some((row) => row.probe?.hasShell) ? 0 : 1 }
    }

    if (parsed.command === 'export' || parsed.command === 'import' || parsed.command === 'install' || parsed.command === 'uninstall' || parsed.command === 'watch') {
      const shells = await shellClients(parsed.port, deps)
      if (!shells.length) {
        io.error('no Codex main renderer found on 127.0.0.1:' + parsed.port)
        return { exitCode: 1 }
      }
      if (parsed.command === 'export') {
        let newest = emptyState()
        for (const shell of shells) {
          newest = chooseNewer(newest, await readPageState(shell.client))
        }
        storage.save(newest)
        io.log(paths.state)
        closeAll(shells)
        return { exitCode: 0 }
      }
      if (parsed.command === 'import') {
        const fileState = storage.load()
        for (const shell of shells) {
          await evaluate(shell.client, writeStateExpression(JSON.stringify(fileState)))
        }
        io.log(paths.state)
        closeAll(shells)
        return { exitCode: 0 }
      }
      if (parsed.command === 'uninstall') {
        const records = readScriptRecords(paths.scripts)
        for (const shell of shells) {
          await removeScripts(shell.client, records[String(parsed.port)] ?? [], shell.target.id)
          await evaluate(shell.client, UNINSTALL_EXPRESSION)
        }
        records[String(parsed.port)] = []
        writeScriptRecords(paths.scripts, records)
        io.log('uninstalled')
        closeAll(shells)
        return { exitCode: 0 }
      }

      const bundleSource = deps.bundleSource ?? readBundle()
      const config = readConfig(paths.config, parsed)
      if (parsed.command === 'install') {
        const records = readScriptRecords(paths.scripts)
        const next = []
        for (const shell of shells) {
          await removeScripts(shell.client, records[String(parsed.port)] ?? [], shell.target.id)
          await evaluate(shell.client, UNINSTALL_EXPRESSION)
          await syncState(shell.client, storage)
          const source = installExpression(bundleSource, config)
          const added = await shell.client.send('Page.addScriptToEvaluateOnNewDocument', { source })
          await evaluate(shell.client, source)
          if (added?.identifier) next.push({ targetId: shell.target.id ?? null, identifier: added.identifier })
        }
        records[String(parsed.port)] = next
        writeScriptRecords(paths.scripts, records)
        io.log(`installed ${next.length} renderer(s)`)
        closeAll(shells)
        return { exitCode: 0 }
      }

      for (const shell of shells) {
        await shell.client.send('Runtime.addBinding', { name: 'codexStashPersist' })
        shell.client.onEvent?.((message) => {
          if (message.method !== 'Runtime.bindingCalled') return
          if (message.params?.name !== 'codexStashPersist') return
          try {
            acceptPersist(message.params.payload, storage)
          } catch (error) {
            io.error(error instanceof Error ? error.message : error)
          }
        })
      }
      io.log('watching')
      await (deps.stop ?? sigint())
      closeAll(shells)
      return { exitCode: 0 }
    }
  } catch (error) {
    io.error(error instanceof Error ? error.message : error)
    return { exitCode: 1 }
  }
  io.log(HELP)
  return { exitCode: 1 }
}

/**
 * @param {string} payload
 * @param {{ save: (state: any) => void }} storage
 */
export function acceptPersist(payload, storage) {
  const state = parseState(JSON.parse(payload)).state
  storage.save(state)
}

async function shellClients(port, deps) {
  const targets = await targetsOf(port, deps)
  const shells = []
  for (const target of targets) {
    const client = await openClient(deps, target)
    const probe = await probeRenderer(client)
    if (probe?.hasShell) shells.push({ client, target, probe })
    else client.close()
  }
  return shells
}

async function targetsOf(port, deps) {
  if (deps.listTargets) return (await deps.listTargets(port)).filter(isAttachablePage)
  const response = await fetch(`http://127.0.0.1:${debuggerPort(port)}/json/list`)
  if (!response.ok) throw new Error(`debugger returned HTTP ${response.status}`)
  const body = await response.json()
  if (!Array.isArray(body)) throw new Error('debugger target list was not an array')
  return body.filter(isAttachablePage)
}

async function openClient(deps, target) {
  const connect = deps.connect ?? connectCdp
  const client = await connect(target.webSocketDebuggerUrl)
  if (client.ready) await client.ready
  return client
}

async function readPageState(client) {
  const raw = await evaluate(client, READ_STATE_EXPRESSION)
  if (typeof raw !== 'string' || !raw) return emptyState()
  try {
    return parseState(JSON.parse(raw)).state
  } catch {
    return emptyState()
  }
}

async function syncState(client, storage) {
  const pageState = await readPageState(client)
  const winner = chooseNewer(pageState, storage.load())
  storage.save(winner)
  if (JSON.stringify(winner) !== JSON.stringify(pageState)) {
    await evaluate(client, writeStateExpression(JSON.stringify(winner)))
  }
  return winner
}

async function removeScripts(client, records, targetId) {
  for (const record of records) {
    if (targetId && record.targetId && record.targetId !== targetId) continue
    try {
      await client.send('Page.removeScriptToEvaluateOnNewDocument', { identifier: record.identifier })
    } catch {
      /* identifier belonged to a previous browser session */
    }
  }
}

function readConfig(file, parsed) {
  let stored = {}
  try {
    stored = JSON.parse(readFileSync(file, 'utf8'))
  } catch {
    stored = {}
  }
  const config = {}
  const hotkey = parsed.hotkey || stored.hotkey
  const locale = parsed.locale || stored.locale
  if (hotkey) config.hotkey = hotkey
  if (locale === 'zh' || locale === 'en') config.locale = locale
  if (typeof stored.notify === 'boolean') config.notify = stored.notify
  return config
}

function readScriptRecords(file) {
  try {
    const parsed = JSON.parse(readFileSync(file, 'utf8'))
    return parsed.byPort ?? {}
  } catch {
    return {}
  }
}

function writeScriptRecords(file, byPort) {
  mkdirSync(dirname(file), { recursive: true })
  writeFileSync(file, `${JSON.stringify({ version: 1, byPort }, null, 2)}\n`, { mode: 0o600 })
}

function readBundle() {
  const file = new URL('../dist/inject.js', import.meta.url)
  return readFileSync(file, 'utf8')
}

function closeAll(shells) {
  for (const shell of shells) {
    try {
      shell.client.close()
    } catch {
      /* already closed */
    }
  }
}

function sigint() {
  return new Promise((resolve) => {
    process.once('SIGINT', () => resolve())
  })
}

function required(args, index, flag) {
  const value = args[index]
  if (!value || value.startsWith('-')) throw new TypeError(`${flag} needs a value`)
  return value
}
