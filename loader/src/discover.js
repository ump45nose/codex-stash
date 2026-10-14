import { execFile } from 'node:child_process'

/**
 * Debugger ports from `ps -axo pid=,command=` output.
 *
 * CodexHost launches the Codex Desktop main process with
 * `--remote-debugging-port=<n>` and picks a new port per launch. Only the main
 * app process counts: helper processes (`--type=renderer` etc.) are skipped,
 * and a non-loopback `--remote-debugging-address` is refused.
 *
 * @param {string} text
 * @returns {number[]}
 */
export function parseDebugPorts(text) {
  const ports = []
  for (const line of String(text).split('\n')) {
    if (!/--remote-debugging-port=\d+/.test(line)) continue
    if (/\s--type=/.test(line)) continue
    if (!/\/(ChatGPT|Codex)\.app\/Contents\/MacOS\//.test(line)) continue
    const address = /--remote-debugging-address=(\S+)/.exec(line)?.[1]
    if (address && !['127.0.0.1', 'localhost', '::1'].includes(address)) continue
    const port = Number(/--remote-debugging-port=(\d+)/.exec(line)[1])
    if (port > 0 && port < 65536 && !ports.includes(port)) ports.push(port)
  }
  return ports
}

/**
 * @param {{ ps?: () => Promise<string> }} [deps]
 * @returns {Promise<number[]>}
 */
export async function discoverDebugPorts(deps = {}) {
  const ps =
    deps.ps ??
    (() =>
      new Promise((resolve) => {
        execFile('/bin/ps', ['-axww', '-o', 'pid=,command='], { maxBuffer: 16 * 1024 * 1024 }, (error, stdout) =>
          resolve(error ? '' : stdout),
        )
      }))
  return parseDebugPorts(await ps())
}
