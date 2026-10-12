/**
 * @param {string} dueAt
 * @param {Date} [now]
 * @param {'zh' | 'en'} [locale]
 */
export function formatDueLabel(dueAt, now = new Date(), locale = 'zh') {
  const date = new Date(dueAt)
  if (Number.isNaN(date.getTime())) return ''
  if (locale === 'en') {
    return new Intl.DateTimeFormat('en', {
      month: 'short',
      day: 'numeric',
      year: date.getFullYear() === now.getFullYear() ? undefined : 'numeric',
    }).format(date)
  }
  const month = date.getMonth() + 1
  const day = date.getDate()
  if (date.getFullYear() === now.getFullYear()) return `${month}月${day}日`
  return `${date.getFullYear()}年${month}月${day}日`
}
