import { execFile } from 'node:child_process'
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

export const SERVICE_LABEL = 'io.github.ump45nose.codex-stash'

function xml(value) {
  return String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

/**
 * @param {{ node: string, script: string, logDir: string, label?: string, env?: Record<string, string> }} options
 */
export function launchAgentPlist(options) {
  const label = options.label ?? SERVICE_LABEL
  const env = { PATH: '/usr/bin:/bin:/usr/sbin:/sbin', ...(options.env ?? {}) }
  const envXml = Object.entries(env)
    .map(([key, value]) => `      <key>${xml(key)}</key><string>${xml(value)}</string>`)
    .join('\n')
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
  <dict>
    <key>Label</key><string>${xml(label)}</string>
    <key>ProgramArguments</key>
    <array>
      <string>${xml(options.node)}</string>
      <string>${xml(options.script)}</string>
      <string>watch</string>
    </array>
    <key>EnvironmentVariables</key>
    <dict>
${envXml}
    </dict>
    <key>RunAtLoad</key><true/>
    <key>KeepAlive</key><true/>
    <key>ThrottleInterval</key><integer>10</integer>
    <key>ProcessType</key><string>Background</string>
    <key>StandardOutPath</key><string>${xml(join(options.logDir, 'watch.log'))}</string>
    <key>StandardErrorPath</key><string>${xml(join(options.logDir, 'watch.err.log'))}</string>
  </dict>
</plist>
`
}

/**
 * @param {{ home?: string }} [options]
 */
export function servicePaths(options = {}) {
  const home = options.home ?? homedir()
  return {
    plist: join(home, 'Library', 'LaunchAgents', `${SERVICE_LABEL}.plist`),
    logDir: join(home, 'Library', 'Logs', 'codex-stash'),
  }
}

export function defaultNodePath() {
  return existsSync('/opt/homebrew/bin/node') ? '/opt/homebrew/bin/node' : process.execPath
}

export function binScriptPath() {
  return fileURLToPath(new URL('../bin/codex-stash.mjs', import.meta.url))
}

function launchctl(args) {
  return new Promise((resolve) => {
    execFile('/bin/launchctl', args, (error, stdout, stderr) =>
      resolve({ code: error ? (error.code ?? 1) : 0, stdout, stderr }),
    )
  })
}

/**
 * @param {'install' | 'uninstall'} action
 * @param {{ home?: string, node?: string, uid?: number, launchctl?: typeof launchctl, env?: Record<string, string> }} [deps]
 */
export async function service(action, deps = {}) {
  const paths = servicePaths(deps.home ? { home: deps.home } : {})
  const run = deps.launchctl ?? launchctl
  const domain = `gui/${deps.uid ?? process.getuid()}`
  await run(['bootout', `${domain}/${SERVICE_LABEL}`])
  if (action === 'uninstall') {
    rmSync(paths.plist, { force: true })
    return { plist: paths.plist, loaded: false }
  }
  mkdirSync(paths.logDir, { recursive: true })
  mkdirSync(join(paths.plist, '..'), { recursive: true })
  writeFileSync(
    paths.plist,
    launchAgentPlist({ node: deps.node ?? defaultNodePath(), script: binScriptPath(), logDir: paths.logDir, env: deps.env }),
  )
  // bootout returns before the old job is fully gone; bootstrap then fails
  // with EIO (5). Retry briefly.
  let result
  for (let attempt = 0; attempt < (deps.retries ?? 6); attempt += 1) {
    result = await run(['bootstrap', domain, paths.plist])
    if (result.code === 0) break
    await new Promise((resolve) => setTimeout(resolve, deps.retryDelayMs ?? 500))
  }
  if (result.code !== 0) throw new Error(`launchctl bootstrap failed: ${result.stderr || result.code}`)
  return { plist: paths.plist, logDir: paths.logDir, loaded: true }
}
