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

/** Remote-host (SSH) thread marker: Codex's own sidebar globe glyph. */
export const REMOTE_ICON =
  "<svg width=\"12\" height=\"12\" viewBox=\"0 0 20 20\" fill=\"currentColor\" xmlns=\"http://www.w3.org/2000/svg\" class=\"codex-stash-v1-icon codex-stash-v1-remote-icon\" aria-hidden=\"true\" focusable=\"false\"><path d=\"M10 2.125C14.3492 2.125 17.875 5.65076 17.875 10C17.875 14.3492 14.3492 17.875 10 17.875C5.65076 17.875 2.125 14.3492 2.125 10C2.125 5.65076 5.65076 2.125 10 2.125ZM7.88672 10.625C7.94334 12.3161 8.22547 13.8134 8.63965 14.9053C8.87263 15.5194 9.1351 15.9733 9.39453 16.2627C9.65437 16.5524 9.86039 16.625 10 16.625C10.1396 16.625 10.3456 16.5524 10.6055 16.2627C10.8649 15.9733 11.1274 15.5194 11.3604 14.9053C11.7745 13.8134 12.0567 12.3161 12.1133 10.625H7.88672ZM3.40527 10.625C3.65313 13.2734 5.45957 15.4667 7.89844 16.2822C7.7409 15.997 7.5977 15.6834 7.4707 15.3486C6.99415 14.0923 6.69362 12.439 6.63672 10.625H3.40527ZM13.3633 10.625C13.3064 12.439 13.0059 14.0923 12.5293 15.3486C12.4022 15.6836 12.2582 15.9969 12.1006 16.2822C14.5399 15.467 16.3468 13.2737 16.5947 10.625H13.3633ZM12.1006 3.7168C12.2584 4.00235 12.4021 4.31613 12.5293 4.65137C13.0059 5.90775 13.3064 7.56102 13.3633 9.375H16.5947C16.3468 6.72615 14.54 4.53199 12.1006 3.7168ZM10 3.375C9.86039 3.375 9.65437 3.44756 9.39453 3.7373C9.1351 4.02672 8.87263 4.48057 8.63965 5.09473C8.22547 6.18664 7.94334 7.68388 7.88672 9.375H12.1133C12.0567 7.68388 11.7745 6.18664 11.3604 5.09473C11.1274 4.48057 10.8649 4.02672 10.6055 3.7373C10.3456 3.44756 10.1396 3.375 10 3.375ZM7.89844 3.7168C5.45942 4.53222 3.65314 6.72647 3.40527 9.375H6.63672C6.69362 7.56102 6.99415 5.90775 7.4707 4.65137C7.59781 4.31629 7.74073 4.00224 7.89844 3.7168Z\"></path></svg>"
