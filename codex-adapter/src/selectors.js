/**
 * Selector table for the Codex Desktop sidebar after the 26.623 layout.
 *
 * Sources (facts, not copied implementation):
 * - Explodex docs/codex-architecture.md — sidebar data-app-action attributes.
 *   Explodex has no license; this table records attribute names only.
 * - Codex App HUD (MIT) — active row is
 *   [data-app-action-sidebar-thread-id][aria-current="page"], value `local:<id>`.
 * - Public Codex route notes — local threads use /local/<id>.
 *
 * Generated class names and nth-child are intentionally absent.
 * CodexHost reuses this native sidebar for harness sessions; extra nodes are
 * ignored as long as these attributes still exist. See SELECTORS.md.
 */
export const SELECTOR_TABLE = {
  id: 'codex-desktop-26.623',
  sidebar: [
    'aside[data-testid="app-shell-floating-left-panel"]',
    'aside.app-shell-left-panel',
    '[data-pip-obstacle="app-shell-floating-left-panel"] aside',
  ],
  scroll: '[data-app-action-sidebar-scroll]',
  section: '[data-app-action-sidebar-section]',
  sectionHeading: '[data-app-action-sidebar-section-heading]',
  sectionToggle: '[data-app-action-sidebar-section-toggle]',
  // Live 26.x builds leave data-app-action-sidebar-section empty and put the
  // English key (Pinned / Projects / Recents) on the section's own
  // data-app-action-sidebar-section-heading attribute.
  sectionKeyAttrs: ['data-app-action-sidebar-section', 'data-app-action-sidebar-section-heading'],
  sectionCollapsedAttr: 'data-app-action-sidebar-section-collapsed',
  sectionTitleRow: '.group\\/nav-section-title',
  threadRow: '[data-app-action-sidebar-thread-row]',
  threadIdAttr: 'data-app-action-sidebar-thread-id',
  threadTitleAttr: 'data-app-action-sidebar-thread-title',
  threadActive: '[data-app-action-sidebar-thread-active="true"]',
  threadSelected: '[data-app-action-sidebar-thread-selected="true"]',
  rowHoverActions: '[class*="group-hover:opacity-100"] button[data-pill]',
  rowHoverGroup: '[class*="group-hover:opacity-100"]',
  threadPinnedAttr: 'data-app-action-sidebar-thread-pinned',
  projectIdAttr: 'data-app-action-sidebar-project-id',
  projectRow: '[data-app-action-sidebar-project-row]',
  current: '[aria-current="page"]',
  selected: '[aria-selected="true"]',
  composerRoot: '[data-codex-composer-root]',
  composer: '.ProseMirror, textarea, [contenteditable="true"]',
  threadFooter: '[data-thread-scroll-footer="true"]',
  conversationId: '[data-above-composer-conversation-id]',
  appShell: '[data-app-shell-main-content-layout]',
  sectionKeys: ['pinned', 'projects', 'recent', 'chats', 'threads', 'cloud'],
}

/** Standalone probe the loader can evaluate before the bundle runs. */
export const MAIN_RENDERER_PROBE = `(() => {
  const shell = document.querySelector('${SELECTOR_TABLE.appShell}');
  const scroll = document.querySelector('${SELECTOR_TABLE.scroll}');
  const sidebar = document.querySelector(${JSON.stringify(SELECTOR_TABLE.sidebar[0])});
  return {
    hasShell: Boolean(shell || scroll || sidebar),
    href: location.href,
    title: document.title,
  };
})()`
