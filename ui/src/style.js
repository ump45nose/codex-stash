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
  // :where() keeps fallbacks at zero specificity so copied native classes win.
  style.textContent = `
    :where(#${prefix}section) { color: inherit; font: inherit; position: relative; }
    :where(#${prefix}section .codex-stash-v1-row) { display: flex; align-items: center; gap: 8px; min-width: 0; min-height: var(--height-token-row, 28px); padding-inline: var(--padding-row-x, 8px); border-radius: 8px; cursor: pointer; position: relative; }
    :where(#${prefix}section .codex-stash-v1-row:hover) { background: var(--color-background-primary-ghost-hover, rgba(0, 0, 0, 0.04)); }
    #${prefix}section .codex-stash-v1-title { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; text-align: start; background: transparent; color: inherit; font: inherit; border: 0; padding: 0; cursor: inherit; }
    #${prefix}section .codex-stash-v1-date { flex: none; opacity: 0.6; font-size: 0.85em; transition: opacity 120ms; }
    #${prefix}section .codex-stash-v1-due { flex: none; font-size: 0.8em; color: var(--color-text-warning, #e25507); }
    #${prefix}section .codex-stash-v1-row-actions { position: absolute; inset-inline-end: 0; top: 0; z-index: 10; height: 100%; display: flex; align-items: center; justify-content: flex-end; gap: calc(var(--spacing, 4px) * 2); padding-inline-end: calc(var(--spacing, 4px) * 1.5); margin-inline-end: calc(var(--spacing, 4px) * 0.5); opacity: 0; pointer-events: none; }
    #${prefix}section .codex-stash-v1-row:hover .codex-stash-v1-row-actions,
    #${prefix}section .codex-stash-v1-row:focus-within .codex-stash-v1-row-actions { opacity: 1; pointer-events: auto; }
    /* Like native rows, the title gives way to the pills on hover (3 pills + gaps). */
    #${prefix}section .codex-stash-v1-row:hover,
    #${prefix}section .codex-stash-v1-row:focus-within { padding-inline-end: calc(var(--spacing, 4px) * 21); }
    /* Native rows hide their trailing info (time / env icon) on hover. */
    #${prefix}section .codex-stash-v1-row:hover .codex-stash-v1-date,
    #${prefix}section .codex-stash-v1-row:hover .codex-stash-v1-due,
    #${prefix}section .codex-stash-v1-row:focus-within .codex-stash-v1-date,
    #${prefix}section .codex-stash-v1-row:focus-within .codex-stash-v1-due { display: none; }
    :where(#${prefix}section .codex-stash-v1-header-actions) { display: flex; flex-shrink: 0; align-items: center; gap: 4px; }
    :where(#${prefix}section .codex-stash-v1-reveal) { opacity: 0; pointer-events: none; }
    :where(#${prefix}section .codex-stash-v1-heading:hover .codex-stash-v1-reveal) { opacity: 1; pointer-events: auto; }
    :where(.codex-stash-v1-dots) { background: transparent; border: 0; color: inherit; padding: 2px; border-radius: 6px; cursor: pointer; display: inline-flex; }
    #${prefix}rows-wrap { display: grid; grid-template-rows: 1fr; opacity: 1; transition: grid-template-rows 200ms cubic-bezier(0.2, 0, 0, 1), opacity 160ms ease; }
    #${prefix}rows-wrap[data-collapsed="true"] { grid-template-rows: 0fr; opacity: 0; }
    #${prefix}rows-wrap.codex-stash-v1-noanim { transition: none; }
    #${prefix}rows { min-height: 0; overflow: hidden; }
    #${prefix}toggle svg { transition: transform 200ms cubic-bezier(0.2, 0, 0, 1); }
    .codex-stash-v1-floating { position: fixed; z-index: 1000; display: flex; flex-direction: column; box-sizing: border-box; }
    :where(.codex-stash-v1-floating) { gap: 2px; padding: 4px; min-width: 220px; font-size: 14px; background: var(--color-text-primary-solid, Canvas); color: var(--color-text-primary-ghost, CanvasText); border-radius: 16px; box-shadow: 0 0 0 0.5px var(--color-border-strong, rgba(0,0,0,.1)), 0 8px 16px -4px rgba(0, 0, 0, 0.12); }
    :where(.codex-stash-v1-item) { display: flex; padding: 6px 8px; border-radius: 12px; cursor: pointer; outline: none; }
    .codex-stash-v1-item[data-highlighted], .codex-stash-v1-item:focus-visible { background: var(--color-background-primary-ghost-hover, rgba(0, 0, 0, 0.05)); }
    :where(.codex-stash-v1-item-row) { display: flex; width: 100%; align-items: center; gap: 6px; }
    :where(.codex-stash-v1-tooltip) { position: fixed; z-index: 1001; pointer-events: none; padding: 5px 12px; border-radius: 16px; font-size: 13px; background: var(--color-background-tooltip, #38342e); color: var(--color-text-tooltip, #fff); white-space: nowrap; }
    .codex-stash-v1-tooltip { position: fixed; pointer-events: none; }
    .codex-stash-v1-tooltip-kbd { opacity: 0.6; }
    .codex-stash-v1-kbd { margin-inline-start: auto; padding-inline-start: 16px; font: inherit; opacity: 0.5; font-size: 0.9em; }
    .codex-stash-v1-label { padding: 6px 8px 2px; font-size: 0.85em; opacity: 0.6; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 320px; }
    .codex-stash-v1-subject { opacity: 0.9; padding-top: 0; }
    .codex-stash-v1-sep { height: 1px; margin: 4px 8px; background: var(--color-border, rgba(0, 0, 0, 0.08)); }
    .codex-stash-v1-form { display: flex; gap: 6px; align-items: center; padding: 4px 8px 6px; }
    .codex-stash-v1-form input { font: inherit; color: inherit; background: transparent; border: 1px solid var(--color-border-strong, ButtonBorder); border-radius: 8px; padding: 3px 6px; flex: 1; min-width: 0; }
    .codex-stash-v1-form button { font: inherit; color: inherit; background: var(--color-background-primary-ghost-hover, rgba(0,0,0,.05)); border: 0; border-radius: 8px; padding: 4px 10px; cursor: pointer; }
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
