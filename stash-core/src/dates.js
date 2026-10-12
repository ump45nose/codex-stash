/** Resume presets. Due instants are 09:00 in the runtime's local timezone. */

export const PRESETS = ['tomorrow', 'in3days', 'nextMonday']

/**
 * @param {'tomorrow' | 'in3days' | 'nextMonday'} preset
 * @param {Date} [now]
 * @returns {string} ISO timestamp
 */
export function dueAtFromPreset(preset, now = new Date()) {
  const base = new Date(now.getTime())
  if (preset === 'tomorrow') {
    base.setDate(base.getDate() + 1)
  } else if (preset === 'in3days') {
    base.setDate(base.getDate() + 3)
  } else if (preset === 'nextMonday') {
    const day = base.getDay()
    const delta = (8 - day) % 7 || 7
    base.setDate(base.getDate() + delta)
  } else {
    throw new TypeError(`unknown preset: ${preset}`)
  }
  base.setHours(9, 0, 0, 0)
  return base.toISOString()
}

/**
 * @param {string} value `YYYY-MM-DD` from `<input type="date">`
 * @returns {string} ISO timestamp at 09:00 local
 */
export function dueAtFromDateInput(value) {
  if (typeof value !== 'string') {
    throw new TypeError('date input must be a string')
  }
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim())
  if (!match) {
    throw new TypeError('date input must be YYYY-MM-DD')
  }
  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  const date = new Date(year, month - 1, day, 9, 0, 0, 0)
  if (
    date.getFullYear() !== year ||
    date.getMonth() !== month - 1 ||
    date.getDate() !== day
  ) {
    throw new TypeError('date input is not a real calendar day')
  }
  return date.toISOString()
}

/**
 * @param {unknown} value
 * @returns {string}
 */
export function normalizeDueAt(value) {
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) throw new TypeError('invalid due date')
    return value.toISOString()
  }
  if (typeof value !== 'string' || !value.trim()) {
    throw new TypeError('due date is required')
  }
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) throw new TypeError('invalid due date')
  return parsed.toISOString()
}
