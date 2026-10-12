/** @typedef {{ key: string, mod: boolean, shift: boolean, alt: boolean, spec: string }} Hotkey */

/** Codex Desktop shortcuts this addon must not bind. */
export const CODEX_RESERVED = [
  { id: 'codex:search-threads', spec: 'Mod+Shift+F' },
  { id: 'codex:plan-mode', spec: 'Mod+Shift+P' },
  // Observed live (2026-10-12, Codex Desktop + CodexHost): a window-capture
  // handler already calls preventDefault for these, so they never reach us.
  { id: 'codex:claimed-mod-shift-s', spec: 'Mod+Shift+S' },
  { id: 'codex:claimed-mod-alt-s', spec: 'Mod+Alt+S' },
  { id: 'codex:claimed-mod-shift-b', spec: 'Mod+Shift+B' },
  { id: 'codex:claimed-mod-shift-u', spec: 'Mod+Shift+U' },
]

/**
 * @param {string} spec
 * @returns {Hotkey}
 */
export function parseHotkey(spec) {
  if (typeof spec !== 'string' || !spec.trim()) throw new TypeError('hotkey is required')
  const parts = spec.split('+').map((part) => part.trim().toLowerCase()).filter(Boolean)
  const key = parts.at(-1)
  if (!key || ['mod', 'cmd', 'ctrl', 'meta', 'shift', 'alt', 'option'].includes(key)) {
    throw new TypeError(`invalid hotkey: ${spec}`)
  }
  return {
    key,
    mod: parts.some((part) => ['mod', 'cmd', 'ctrl', 'meta'].includes(part)),
    shift: parts.includes('shift'),
    alt: parts.includes('alt') || parts.includes('option'),
    spec,
  }
}

/**
 * @param {KeyboardEvent} event
 * @param {Hotkey} hotkey
 * @param {boolean} isMac
 */
export function matchHotkey(event, hotkey, isMac) {
  if (!event || event.repeat) return false
  if (String(event.key || '').toLowerCase() !== hotkey.key) return false
  if (Boolean(event.shiftKey) !== hotkey.shift) return false
  if (Boolean(event.altKey) !== hotkey.alt) return false
  const platformMod = isMac ? Boolean(event.metaKey) : Boolean(event.ctrlKey)
  return platformMod === hotkey.mod
}

/**
 * @param {Hotkey} hotkey
 * @param {string[]} [extraSpecs] CodexHost or caller reservations, as `Mod+Shift+H` strings
 * @returns {string | null} conflicting id, or null
 */
export function hotkeyConflict(hotkey, extraSpecs = []) {
  const reserved = [
    ...CODEX_RESERVED.map((entry) => ({ id: entry.id, hotkey: parseHotkey(entry.spec) })),
    ...extraSpecs.filter((spec) => typeof spec === 'string' && spec.trim()).map((spec) => ({
      id: `reserved:${spec}`,
      hotkey: parseHotkey(spec),
    })),
  ]
  return reserved.find((entry) => sameHotkey(entry.hotkey, hotkey))?.id ?? null
}

/**
 * @param {Hotkey} left
 * @param {Hotkey} right
 */
export function sameHotkey(left, right) {
  return left.key === right.key && left.mod === right.mod && left.shift === right.shift && left.alt === right.alt
}
