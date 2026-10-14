import { install } from './runtime.js'

if (globalThis.__CODEX_STASH_AUTORUN !== false) {
  install(globalThis.__CODEX_STASH_OPTIONS ?? {})
}
