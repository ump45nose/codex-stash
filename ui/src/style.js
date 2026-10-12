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
    #${prefix}section .codex-stash-v1-row { display: flex; align-items: center; gap: 8px; min-width: 0; min-height: var(--height-token-row, 28px); padding-inline: var(--padding-row-x, 8px); border-radius: 8px; cursor: pointer; font-size: 13px; }
    #${prefix}section .codex-stash-v1-row:hover { background: var(--color-background-primary-ghost-hover, rgba(0, 0, 0, 0.04)); }
    #${prefix}section .codex-stash-v1-title { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; text-align: left; background: transparent; color: inherit; font: inherit; border: 0; padding: 0; cursor: inherit; }
    #${prefix}section .codex-stash-v1-date { flex: none; opacity: 0.72; font-size: 12px; }
    #${prefix}section .codex-stash-v1-due { flex: none; font-size: 11px; }
    #${prefix}popover, #${prefix}menu { position: fixed; z-index: 1000; display: flex; flex-direction: column; gap: 2px; padding: 6px; min-width: 200px; font-size: 13px; background: var(--color-text-primary-solid, Canvas); color: var(--color-text-primary-ghost, CanvasText); border: 1px solid var(--color-border-strong, ButtonBorder); border-radius: 10px; box-shadow: 0 8px 24px rgba(0, 0, 0, 0.14); }
    #${prefix}popover p { margin: 2px 6px 4px; opacity: 0.6; font-size: 12px; }
    #${prefix}popover button, #${prefix}menu button { font: inherit; color: inherit; background: transparent; border: 0; border-radius: 6px; padding: 5px 8px; text-align: left; cursor: pointer; }
    #${prefix}popover button:hover, #${prefix}menu button:hover { background: var(--color-background-primary-ghost-hover, rgba(0, 0, 0, 0.05)); }
    #${prefix}popover form { display: flex; gap: 4px; align-items: center; padding: 2px 0 0 6px; }
    #${prefix}popover input { font: inherit; color: inherit; background: transparent; border: 1px solid var(--color-border-strong, ButtonBorder); border-radius: 6px; padding: 3px 6px; flex: 1; min-width: 0; }
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
