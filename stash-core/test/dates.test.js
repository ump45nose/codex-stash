import assert from 'node:assert/strict'
import test from 'node:test'
import { dueAtFromDateInput, dueAtFromPreset } from '../src/dates.js'

const now = new Date(2026, 9, 12, 15, 4, 0, 0) // Monday 12 Oct 2026, 15:04 local

test('tomorrow, three days, and next Monday land at 09:00 local', () => {
  const tomorrow = new Date(dueAtFromPreset('tomorrow', now))
  assert.equal(tomorrow.getFullYear(), 2026)
  assert.equal(tomorrow.getMonth(), 9)
  assert.equal(tomorrow.getDate(), 13)
  assert.equal(tomorrow.getHours(), 9)
  assert.equal(tomorrow.getMinutes(), 0)

  const in3 = new Date(dueAtFromPreset('in3days', now))
  assert.equal(in3.getDate(), 15)
  assert.equal(in3.getHours(), 9)

  const monday = new Date(dueAtFromPreset('nextMonday', now))
  assert.equal(monday.getDay(), 1)
  assert.equal(monday.getDate(), 19)
  assert.equal(monday.getHours(), 9)
})

test('next Monday skips today when today is Monday', () => {
  const monday = new Date(dueAtFromPreset('nextMonday', new Date(2026, 9, 12, 8, 0, 0)))
  assert.equal(monday.getDate(), 19)
})

test('next Monday from Sunday is the next day', () => {
  const monday = new Date(dueAtFromPreset('nextMonday', new Date(2026, 9, 11, 22, 0, 0)))
  assert.equal(monday.getDate(), 12)
  assert.equal(monday.getDay(), 1)
})

test('date input rejects impossible days', () => {
  const parsed = new Date(dueAtFromDateInput('2026-10-13'))
  assert.equal(parsed.getDate(), 13)
  assert.equal(parsed.getHours(), 9)
  assert.throws(() => dueAtFromDateInput('2026-02-31'))
  assert.throws(() => dueAtFromDateInput('13 Oct'))
})
