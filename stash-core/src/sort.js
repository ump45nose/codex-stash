import { isDue } from './dates.js'

export const SORT_MODES = ['due', 'stashed', 'title']

/**
 * Order stash rows for display. Pure; does not mutate.
 * - due: due rows first, then earliest resume date (store default)
 * - stashed: most recently stashed first
 * - title: by title (locale-aware), ties by due date
 *
 * @template {{ title?: string | null, dueAt: string | null, stashedAt?: string }} T
 * @param {T[]} rows
 * @param {string} mode
 * @param {Date} [now]
 * @returns {T[]}
 */
export function sortRows(rows, mode, now = new Date()) {
  const list = [...rows]
  const clock = now.getTime()
  const byDue = (a, b) => {
    const aDue = isDue(a.dueAt, clock)
    const bDue = isDue(b.dueAt, clock)
    if (aDue !== bDue) return aDue ? -1 : 1
    // Undated (不设时间) after every dated row.
    if (!a.dueAt || !b.dueAt) return a.dueAt ? -1 : b.dueAt ? 1 : 0
    return Date.parse(a.dueAt) - Date.parse(b.dueAt)
  }
  if (mode === 'stashed') {
    return list.sort((a, b) => Date.parse(b.stashedAt ?? 0) - Date.parse(a.stashedAt ?? 0) || byDue(a, b))
  }
  if (mode === 'title') {
    return list.sort((a, b) => String(a.title ?? '').localeCompare(String(b.title ?? ''), 'zh-Hans-CN') || byDue(a, b))
  }
  return list.sort(byDue)
}

/** @param {unknown} value */
export function normalizeSortMode(value) {
  return SORT_MODES.includes(/** @type {string} */ (value)) ? /** @type {string} */ (value) : 'due'
}
