import assert from 'node:assert/strict'
import test from 'node:test'
import { hotkeyConflict, matchHotkey, parseHotkey } from '../src/hotkey.js'
import { planReminders } from '../src/reminders.js'
import { assertIndependentHome, stashHome } from '../src/paths.js'
import { join } from 'node:path'

test('default hotkey matches Cmd on mac and Ctrl elsewhere', () => {
  const hotkey = parseHotkey('Mod+Shift+S')
  assert.equal(matchHotkey({ key: 's', metaKey: true, shiftKey: true }, hotkey, true), true)
  assert.equal(matchHotkey({ key: 's', ctrlKey: true, shiftKey: true }, hotkey, true), false)
  assert.equal(matchHotkey({ key: 's', ctrlKey: true, shiftKey: true }, hotkey, false), true)
  assert.equal(matchHotkey({ key: 'S', metaKey: true, shiftKey: true, repeat: true }, hotkey, true), false)
  assert.equal(matchHotkey({ key: 's', metaKey: true, shiftKey: false }, hotkey, true), false)
})

test('Codex search and plan shortcuts are refused, including CodexHost reservations', () => {
  assert.equal(hotkeyConflict(parseHotkey('Mod+Shift+F')), 'codex:search-threads')
  assert.equal(hotkeyConflict(parseHotkey('Mod+Shift+P')), 'codex:plan-mode')
  assert.equal(hotkeyConflict(parseHotkey('Mod+Shift+S')), null)
  assert.equal(hotkeyConflict(parseHotkey('Mod+Shift+S'), ['Ctrl+Shift+S']), 'reserved:Ctrl+Shift+S')
})

test('reminders fire once per thread and due instant', () => {
  const due = [{ threadId: 'abc12345', title: 'A', dueAt: '2026-10-13T01:00:00.000Z' }]
  const first = planReminders(due, new Set(), 'granted')
  assert.equal(first.notify.length, 1)
  const second = planReminders(due, first.next, 'granted')
  assert.equal(second.notify.length, 0)
  assert.deepEqual(planReminders(due, new Set(), 'default'), { notify: [], next: new Set() })
})

test('stash home is not Codex config', () => {
  const home = '/tmp/home'
  assert.equal(stashHome({}, home), join(home, '.codex-stash'))
  assert.throws(() => assertIndependentHome(join(home, '.codex'), home), /refuses/)
  assert.throws(() => assertIndependentHome(join(home, '.codex', 'stash'), home), /refuses/)
  assert.equal(stashHome({ CODEX_STASH_HOME: '/tmp/codex-stash-data' }, home), '/tmp/codex-stash-data')
})
