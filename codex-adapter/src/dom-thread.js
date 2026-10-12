/**
 * DOM form of a thread id. Kept in lockstep with `canonicalThreadId`
 * (loader tests assert the shared examples). Returns null instead of throwing
 * so a bad attribute cannot take down the sidebar.
 *
 * Titles contain whitespace and are rejected. Draft `client-new-thread` ids
 * are rejected. Nothing in here reads row text.
 */

/**
 * @param {unknown} input
 * @returns {string | null}
 */
export function domThreadKey(input) {
  if (typeof input !== 'string') return null
  let value = input.trim()
  if (!value) return null
  if (/^local:/i.test(value)) value = value.slice(value.indexOf(':') + 1).trim()
  if (!value || /\s/.test(value) || /client-new-thread/i.test(value)) return null
  if (value.length < 8 || value.length > 200) return null
  if (!/^[A-Za-z0-9:._~-]+$/.test(value)) return null
  return value
}

/**
 * @param {Document} doc
 * @returns {string | null}
 */
export function readRouteThreadId(doc) {
  const location = doc.defaultView?.location
  if (!location) return null
  const paths = [location.pathname || '', location.hash || '']
  for (const path of paths) {
    const match = /\/local\/([^/?#]+)/.exec(path)
    if (!match) continue
    try {
      return decodeURIComponent(match[1])
    } catch {
      return match[1]
    }
  }
  return null
}

/**
 * @param {KeyboardEvent | { key?: string, shiftKey?: boolean, altKey?: boolean, isComposing?: boolean }} event
 */
export function isSendKey(event) {
  if (!event || event.isComposing) return false
  if (event.key !== 'Enter' || event.shiftKey || event.altKey) return false
  return true
}

/**
 * @param {Element | null | undefined} element
 */
export function isSendButton(element) {
  if (!element || element.tagName !== 'BUTTON') return false
  const label = `${element.getAttribute('aria-label') || ''} ${element.textContent || ''}`
  if (/feedback|反馈/i.test(label)) return false
  return /send|发送/i.test(label)
}
