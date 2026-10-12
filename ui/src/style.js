import { NODE_PREFIX } from './strings.js'

/**
 * Scoped to our ids. No `body *` rules and no global !important.
 * @param {Document} doc
 * @param {string} [prefix]
 */
export function ensureStyle(doc, prefix = NODE_PREFIX) {
  const id = `${prefix}style`
  if (doc.getElementById(id)) return
  const style = doc.createElement('style')
  style.id = id
  style.textContent = `
    #${prefix}section { color: inherit; font: inherit; position: relative; }
    #${prefix}section .codex-stash-v1-row { display: flex; align-items: baseline; gap: 8px; width: 100%; min-width: 0; }
    #${prefix}section .codex-stash-v1-title { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; text-align: left; background: transparent; color: inherit; font: inherit; border: 0; padding: 4px 8px; }
    #${prefix}section .codex-stash-v1-date { flex: none; opacity: 0.72; font-size: 12px; }
    #${prefix}section .codex-stash-v1-due { flex: none; font-size: 11px; }
    #${prefix}section .codex-stash-v1-missing { opacity: 0.45; }
    #${prefix}popover, #${prefix}menu { position: fixed; z-index: 30; display: flex; flex-direction: column; gap: 4px; padding: 8px; min-width: 180px; background: Canvas; color: CanvasText; border: 1px solid ButtonBorder; }
    #${prefix}popover button, #${prefix}menu button, #${prefix}popover input { font: inherit; color: inherit; }
  `
  ;(doc.head || doc.documentElement).append(style)
}

/**
 * @param {Document} doc
 * @param {string} prefix
 */
export function unmountAddonNodes(doc, prefix) {
  ;[...doc.querySelectorAll('[id]')].forEach((node) => {
    if (node.id.startsWith(prefix)) node.remove()
  })
}
