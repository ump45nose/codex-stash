import { emptyState, parseState } from './state.js'

/**
 * @returns {{ load: () => ReturnType<typeof emptyState>, save: (state: ReturnType<typeof emptyState>) => void }}
 */
export function createMemoryStorage(initial) {
  let snapshot = initial ? parseState(initial).state : emptyState()
  return {
    load() {
      return parseState(JSON.parse(JSON.stringify(snapshot))).state
    },
    save(state) {
      snapshot = parseState(JSON.parse(JSON.stringify(state))).state
    },
  }
}

/**
 * @param {{ getItem: (key: string) => string | null, setItem: (key: string, value: string) => void }} storage
 * @param {string} [key]
 */
export function createLocalStorageStorage(storage, key = 'codex-stash:v1') {
  return {
    load() {
      const raw = storage.getItem(key)
      if (!raw) return emptyState()
      try {
        return parseState(JSON.parse(raw)).state
      } catch {
        return emptyState()
      }
    },
    save(state) {
      storage.setItem(key, JSON.stringify(state))
    },
  }
}
