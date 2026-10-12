import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { JSDOM } from 'jsdom'
import { formatDueLabel } from '../src/format.js'
import { mountMenu, mountPopover } from '../src/popover.js'
import { mountSection } from '../src/section.js'
import { STRINGS } from '../src/strings.js'

const here = dirname(fileURLToPath(import.meta.url))
const strings = STRINGS.zh

function document() {
  return new JSDOM('<!doctype html><html><body><div id="host"></div></body></html>').window.document
}

test('ui sources do not mention Codex sidebar selectors', () => {
  const sourceDir = join(here, '../src')
  const combined = readdirSync(sourceDir)
    .filter((name) => name.endsWith('.js'))
    .map((name) => readFileSync(join(sourceDir, name), 'utf8'))
    .join('\n')
  assert.equal(combined.includes('data-app-action'), false)
  assert.equal(combined.includes('aria-current'), false)
  assert.equal(combined.includes('ProseMirror'), false)
})

test('a row shows title and date only', () => {
  const doc = document()
  const host = doc.getElementById('host')
  let opened = null
  mountSection({
    doc,
    parent: host,
    chrome: { sectionClass: 'native-section', toggleClass: 'native-toggle', rowClass: 'native-row' },
    strings,
    collapsed: false,
    rows: [
      {
        threadId: '11111111-1111-1111-1111-111111111111',
        title: 'Waiting on review',
        dueLabel: '10月20日',
        due: true,
        missing: false,
      },
    ],
    onToggle() {},
    onOpen(threadId) {
      opened = threadId
    },
    onContext() {},
  })
  const section = doc.getElementById('codex-stash-v1-section')
  assert.equal(section.className, 'native-section')
  assert.equal(section.textContent.includes('Waiting on review'), true)
  assert.equal(section.textContent.includes('10月20日'), true)
  assert.equal(section.textContent.includes('到期'), true)
  assert.equal(section.textContent.includes('reason'), false)
  assert.equal(section.querySelector('input'), null)
  section.querySelector('.codex-stash-v1-title').click()
  assert.equal(opened, '11111111-1111-1111-1111-111111111111')
})

test('collapsed section hides rows and a missing row does not open', () => {
  const doc = document()
  const host = doc.getElementById('host')
  let toggled = 0
  let opened = 0
  mountSection({
    doc,
    parent: host,
    strings,
    collapsed: true,
    rows: [{ threadId: 'aaaaaaaa', title: 'Gone', dueLabel: '10月1日', due: false, missing: true }],
    onToggle() {
      toggled += 1
    },
    onOpen() {
      opened += 1
    },
    onContext() {},
  })
  assert.equal(doc.getElementById('codex-stash-v1-rows'), null)
  assert.equal(doc.getElementById('codex-stash-v1-toggle').getAttribute('aria-expanded'), 'false')
  doc.getElementById('codex-stash-v1-toggle').click()
  assert.equal(toggled, 1)
  assert.equal(opened, 0)
})

test('context actions are change-date and remove', () => {
  const doc = document()
  let changed = 0
  let removed = 0
  const menu = mountMenu({
    doc,
    strings,
    left: 12,
    top: 16,
    onChangeDate() {
      changed += 1
    },
    onRemove() {
      removed += 1
    },
    onClose() {},
  })
  const labels = [...menu.node.querySelectorAll('button')].map((button) => button.textContent)
  assert.deepEqual(labels, ['改日期', '移出'])
  menu.node.querySelector('button').click()
  assert.equal(changed, 1)
  menu.close()
  assert.equal(removed, 0)
})

test('popover presets and custom date', () => {
  const doc = document()
  const chosen = []
  const pop = mountPopover({
    doc,
    strings,
    left: 4,
    top: 4,
    hotkeyLabel: 'Mod+Shift+S',
    onPreset(preset) {
      chosen.push(preset)
    },
    onCustom(value) {
      chosen.push(value)
    },
    onClose() {},
  })
  assert.match(pop.node.textContent, /收纳当前会话/)
  pop.node.querySelector('[data-preset="nextMonday"]').click()
  const input = pop.node.querySelector('input[type="date"]')
  input.value = '2026-10-20'
  input.form.dispatchEvent(new doc.defaultView.Event('submit', { bubbles: true, cancelable: true }))
  assert.deepEqual(chosen, ['nextMonday', '2026-10-20'])
  pop.close()
})

test('formatDueLabel stays in the local calendar', () => {
  const label = formatDueLabel('2026-10-13T01:00:00.000Z', new Date(2026, 9, 12), 'zh')
  assert.match(label, /月/)
  const english = formatDueLabel(new Date(2026, 9, 13, 9).toISOString(), new Date(2026, 9, 12), 'en')
  assert.match(english, /Oct/)
})
