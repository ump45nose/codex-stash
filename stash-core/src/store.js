import { canonicalThreadId } from './thread-id.js'
import { normalizeDueAt } from './dates.js'
import { emptyState, parseState } from './state.js'

/**
 * @typedef {{ title: string, dueAt: string, stashedAt: string }} StashItem
 * @typedef {{ threadId: string } & StashItem} StashRow
 */

/**
 * Pure stash store. `unstash` removes our record only — it does not archive,
 * unpin, or delete a Codex thread or workspace.
 *
 * @param {{ load: () => any, save: (state: any) => void }} storage
 */
export function createStashStore(storage) {
  let state = parseState(storage.load()).state

  function persist(now) {
    state.updatedAt = now.toISOString()
    state.version = 1
    storage.save(state)
  }

  function copy(threadId, item) {
    return {
      threadId,
      title: item.title,
      dueAt: item.dueAt,
      stashedAt: item.stashedAt,
    }
  }

  return {
    /**
     * @param {string} threadId
     * @param {string} title display cache only
     * @param {string | Date} dueDate
     * @param {Date} [now]
     */
    stash(threadId, title, dueDate, now = new Date()) {
      const id = canonicalThreadId(threadId)
      if (typeof title !== 'string') throw new TypeError('title must be a string')
      const dueAt = normalizeDueAt(dueDate)
      const previous = state.items[id]
      state.items[id] = {
        title,
        dueAt,
        stashedAt: previous?.stashedAt ?? now.toISOString(),
      }
      persist(now)
      return copy(id, state.items[id])
    },

    /**
     * @param {string} threadId
     * @param {string | Date} dueDate
     * @param {Date} [now]
     */
    setDate(threadId, dueDate, now = new Date()) {
      const id = canonicalThreadId(threadId)
      const item = state.items[id]
      if (!item) return false
      item.dueAt = normalizeDueAt(dueDate)
      persist(now)
      return true
    },

    /**
     * @param {string} threadId
     * @param {Date} [now]
     */
    unstash(threadId, now = new Date()) {
      const id = canonicalThreadId(threadId)
      if (!state.items[id]) return false
      delete state.items[id]
      persist(now)
      return true
    },

    /**
     * Due rows first, then earliest resume date.
     * @param {Date} [now]
     * @returns {StashRow[]}
     */
    list(now = new Date()) {
      const clock = now.getTime()
      return Object.entries(state.items)
        .map(([threadId, item]) => copy(threadId, item))
        .sort((a, b) => {
          const aDue = Date.parse(a.dueAt) <= clock
          const bDue = Date.parse(b.dueAt) <= clock
          if (aDue !== bDue) return aDue ? -1 : 1
          return Date.parse(a.dueAt) - Date.parse(b.dueAt)
        })
    },

    /**
     * @param {Date} [now]
     * @returns {StashRow[]}
     */
    due(now = new Date()) {
      const clock = now.getTime()
      return this.list(now).filter((item) => Date.parse(item.dueAt) <= clock)
    },

    /**
     * Drop the row when the user sends a message in that thread.
     * @param {string} threadId
     * @param {Date} [now]
     */
    onUserMessage(threadId, now = new Date()) {
      const id = canonicalThreadId(threadId)
      if (!state.items[id]) return false
      return this.unstash(id, now)
    },

    /**
     * Update the cached label. Does not invent an id from the title.
     * @param {string} threadId
     * @param {string} title
     */
    refreshTitle(threadId, title, now = new Date()) {
      const id = canonicalThreadId(threadId)
      const item = state.items[id]
      if (!item || typeof title !== 'string' || title === item.title) return false
      item.title = title
      persist(now)
      return true
    },

    /**
     * @param {string} threadId
     * @returns {StashRow | null}
     */
    get(threadId) {
      let id
      try {
        id = canonicalThreadId(threadId)
      } catch {
        return null
      }
      const item = state.items[id]
      return item ? copy(id, item) : null
    },

    getState() {
      return parseState(JSON.parse(JSON.stringify(state))).state
    },
  }
}

export { emptyState }
