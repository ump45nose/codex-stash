/**
 * 收纳 glyph: a tray with an arrow dropping in. 16×16, 1.33 stroke, round
 * joins, matching the weight of Codex's sidebar row icons.
 */
export const STASH_ICON =
  '<svg aria-hidden="true" focusable="false" width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg" class="codex-stash-v1-icon"><path d="M8 2.33v6" stroke="currentColor" stroke-width="1.33" stroke-linecap="round"/><path d="M5.67 6.33 8 8.67l2.33-2.34" stroke="currentColor" stroke-width="1.33" stroke-linecap="round" stroke-linejoin="round"/><path d="M2.33 9.33v2.34c0 .92.75 1.66 1.67 1.66h8c.92 0 1.67-.74 1.67-1.66V9.33h-2.84l-.66 1.34H5.83l-.66-1.34H2.33Z" stroke="currentColor" stroke-width="1.33" stroke-linejoin="round"/></svg>'

/** 改日期: calendar with a small clock hand, same 16×16 / 1.33 stroke. */
export const DATE_ICON =
  '<svg aria-hidden="true" focusable="false" width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg" class="codex-stash-v1-icon"><path d="M13.33 7V4.67c0-.92-.74-1.67-1.66-1.67H4.33c-.92 0-1.66.75-1.66 1.67v6.66c0 .92.74 1.67 1.66 1.67H7" stroke="currentColor" stroke-width="1.33" stroke-linecap="round" stroke-linejoin="round"/><path d="M5.33 1.67V4M10.67 1.67V4M2.67 6.33h10.66" stroke="currentColor" stroke-width="1.33" stroke-linecap="round"/><circle cx="11.33" cy="11.33" r="3" stroke="currentColor" stroke-width="1.33"/><path d="M11.33 10v1.5l.9.67" stroke="currentColor" stroke-width="1.33" stroke-linecap="round" stroke-linejoin="round"/></svg>'

/** 移出: the stash tray with the arrow leaving (inverse of STASH_ICON). */
export const UNSTASH_ICON =
  '<svg aria-hidden="true" focusable="false" width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg" class="codex-stash-v1-icon"><path d="M8 8.67v-6" stroke="currentColor" stroke-width="1.33" stroke-linecap="round"/><path d="M5.67 4.67 8 2.33l2.33 2.34" stroke="currentColor" stroke-width="1.33" stroke-linecap="round" stroke-linejoin="round"/><path d="M2.33 9.33v2.34c0 .92.75 1.66 1.67 1.66h8c.92 0 1.67-.74 1.67-1.66V9.33h-2.84l-.66 1.34H5.83l-.66-1.34H2.33Z" stroke="currentColor" stroke-width="1.33" stroke-linejoin="round"/></svg>'

export const CHECK_ICON =
  '<svg aria-hidden="true" focusable="false" width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg" class="codex-stash-v1-check"><path d="m3.33 8.33 3 3 6.34-6.66" stroke="currentColor" stroke-width="1.33" stroke-linecap="round" stroke-linejoin="round"/></svg>'

/** @param {Document} doc @param {string} markup */
export function svgFrom(doc, markup) {
  const tpl = doc.createElement('template')
  tpl.innerHTML = markup
  return tpl.content.firstElementChild
}
