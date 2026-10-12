import { mkdirSync, readFileSync, renameSync, statSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import { emptyState, parseState } from './state.js'

/**
 * Atomic JSON file for stash state. This is codex-stash's own file.
 * It is not Codex's state database, config.toml, or archive folder.
 *
 * @param {string} filePath
 */
export function createJsonFileStorage(filePath) {
  return {
    load() {
      let raw
      try {
        raw = readFileSync(filePath, 'utf8')
      } catch (error) {
        if (/** @type {NodeJS.ErrnoException} */ (error).code === 'ENOENT') return emptyState()
        throw error
      }
      try {
        return parseState(JSON.parse(raw)).state
      } catch {
        const backup = `${filePath}.corrupt-${Date.now()}`
        renameSync(filePath, backup)
        return emptyState()
      }
    },
    save(state) {
      mkdirSync(dirname(filePath), { recursive: true })
      const tmp = `${filePath}.tmp`
      writeFileSync(tmp, `${JSON.stringify(state, null, 2)}\n`, { mode: 0o600 })
      renameSync(tmp, filePath)
    },
  }
}

/**
 * @param {string} filePath
 */
export function fileMode(filePath) {
  return statSync(filePath).mode & 0o777
}
