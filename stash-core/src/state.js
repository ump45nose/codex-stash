import { canonicalThreadId } from './thread-id.js'
import { normalizeDueAt } from './dates.js'

export const SCHEMA_VERSION = 1

export function emptyState() {
  return { version: SCHEMA_VERSION, updatedAt: null, items: Object.create(null) }
}

/**
 * @param {unknown} raw
 * @returns {{ state: ReturnType<typeof emptyState>, dropped: number }}
 */
export function parseState(raw) {
  const state = emptyState()
  let dropped = 0
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return { state, dropped }
  }
  const record = /** @type {Record<string, unknown>} */ (raw)
  if (record.version !== SCHEMA_VERSION || !record.items || typeof record.items !== 'object') {
    return { state, dropped }
  }
  if (typeof record.updatedAt === 'string' && !Number.isNaN(Date.parse(record.updatedAt))) {
    state.updatedAt = record.updatedAt
  }
  for (const [key, value] of Object.entries(record.items)) {
    if (!value || typeof value !== 'object') {
      dropped += 1
      continue
    }
    let threadId
    try {
      threadId = canonicalThreadId(key)
    } catch {
      dropped += 1
      continue
    }
    const item = /** @type {Record<string, unknown>} */ (value)
    if (typeof item.title !== 'string') {
      dropped += 1
      continue
    }
    let dueAt
    let stashedAt
    try {
      dueAt = normalizeDueAt(item.dueAt)
      stashedAt = normalizeDueAt(item.stashedAt)
    } catch {
      dropped += 1
      continue
    }
    state.items[threadId] = { title: item.title, dueAt, stashedAt }
  }
  return { state, dropped }
}

/**
 * @param {unknown} state
 * @returns {number}
 */
export function stateTime(state) {
  if (!state || typeof state !== 'object') return 0
  const updatedAt = /** @type {{ updatedAt?: unknown }} */ (state).updatedAt
  const time = typeof updatedAt === 'string' ? Date.parse(updatedAt) : NaN
  return Number.isFinite(time) ? time : 0
}

/**
 * Prefer the snapshot that was written later. Empty clocks lose to real ones.
 * @param {ReturnType<typeof emptyState>} left
 * @param {ReturnType<typeof emptyState>} right
 */
export function chooseNewer(left, right) {
  return stateTime(right) > stateTime(left) ? right : left
}
