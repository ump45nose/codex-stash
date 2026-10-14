import { homedir } from 'node:os'
import { join, resolve, sep } from 'node:path'

/**
 * Stash files live in their own directory. `~/.codex` is Codex's, and this
 * function refuses to point at it.
 *
 * @param {NodeJS.ProcessEnv} [env]
 * @param {string} [home]
 */
export function stashHome(env = process.env, home = homedir()) {
  const dir = env.CODEX_STASH_HOME ? resolve(env.CODEX_STASH_HOME) : join(home, '.codex-stash')
  assertIndependentHome(dir, home)
  return dir
}

/**
 * @param {string} dir
 * @param {string} home
 */
export function assertIndependentHome(dir, home) {
  const resolved = resolve(dir)
  const codex = resolve(join(home, '.codex'))
  if (resolved === codex || resolved.startsWith(codex + sep)) {
    throw new Error('codex-stash refuses to store state inside ~/.codex')
  }
}

/**
 * @param {string} home
 */
export function stashPaths(home) {
  return {
    home,
    state: join(home, 'stash.json'),
    config: join(home, 'config.json'),
    scripts: join(home, 'cdp-scripts.json'),
  }
}
