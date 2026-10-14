/**
 * @param {Array<{ threadId: string, title: string, dueAt: string }>} dueItems
 * @param {Set<string>} already
 * @param {NotificationPermission | string | undefined} permission
 */
export function planReminders(dueItems, already, permission) {
  if (permission !== 'granted') return { notify: [], next: already }
  const next = new Set(already)
  const notify = []
  for (const item of dueItems) {
    const key = `${item.threadId}@${item.dueAt}`
    if (next.has(key)) continue
    next.add(key)
    notify.push({ threadId: item.threadId, title: item.title, dueAt: item.dueAt })
  }
  return { notify, next }
}
