import assert from 'node:assert/strict'
import test from 'node:test'
import { createStashStore } from '../src/store.js'
import { createMemoryStorage } from '../src/storage.js'
import { ThreadIdError } from '../src/thread-id.js'

const UUID = '11111111-1111-1111-1111-111111111111'
const OTHER = '22222222-2222-2222-2222-222222222222'
const now = new Date('2026-10-12T07:00:00.000Z')

test('stash, list, setDate, and unstash round-trip by thread id', () => {
  const store = createStashStore(createMemoryStorage())
  store.stash(`local:${UUID}`, 'Waiting on review', '2026-10-20T09:00:00.000Z', now)
  store.stash(OTHER, 'Later', '2026-10-13T09:00:00.000Z', now)

  const listed = store.list(now)
  assert.deepEqual(
    listed.map((row) => row.threadId),
    [OTHER, UUID],
  )
  assert.equal(listed[0].title, 'Later')
  assert.equal(store.setDate(UUID, '2026-10-12T08:00:00.000Z', now), true)
  assert.deepEqual(
    store.list(now).map((row) => row.threadId),
    [UUID, OTHER],
  )
  assert.equal(store.unstash(`local:${UUID}`, now), true)
  assert.equal(store.get(UUID), null)
  assert.equal(store.unstash(UUID, now), false)
  assert.equal(store.setDate(UUID, '2026-10-21T09:00:00.000Z', now), false)
})

test('due rows sort ahead of upcoming rows', () => {
  const store = createStashStore(createMemoryStorage())
  store.stash(UUID, 'overdue', '2026-10-01T09:00:00.000Z', now)
  store.stash(OTHER, 'future', '2026-11-01T09:00:00.000Z', now)
  const third = '33333333-3333-3333-3333-333333333333'
  store.stash(third, 'more overdue', '2026-09-01T09:00:00.000Z', now)
  assert.deepEqual(
    store.due(now).map((row) => row.threadId),
    [third, UUID],
  )
  assert.deepEqual(
    store.list(now).map((row) => row.title),
    ['more overdue', 'overdue', 'future'],
  )
})

test('re-stashing keeps the original stashedAt and replaces the date and title', () => {
  const store = createStashStore(createMemoryStorage())
  store.stash(UUID, 'First', '2026-10-20T09:00:00.000Z', now)
  const later = new Date('2026-10-18T07:00:00.000Z')
  const row = store.stash(UUID, 'Renamed', '2026-10-21T09:00:00.000Z', later)
  assert.equal(row.stashedAt, now.toISOString())
  assert.equal(row.title, 'Renamed')
  assert.equal(row.dueAt, '2026-10-21T09:00:00.000Z')
  assert.equal(store.list(later).length, 1)
})

test('sending a message unstashes that thread only', () => {
  const store = createStashStore(createMemoryStorage())
  store.stash(UUID, 'A', '2026-10-20T09:00:00.000Z', now)
  store.stash(OTHER, 'B', '2026-10-21T09:00:00.000Z', now)
  assert.equal(store.onUserMessage(`local:${UUID}`, now), true)
  assert.equal(store.get(UUID), null)
  assert.equal(store.get(OTHER)?.title, 'B')
  assert.equal(store.onUserMessage(UUID, now), false)
})

test('thread ids are never taken from titles, and task fields are not stored', () => {
  const store = createStashStore(createMemoryStorage())
  assert.throws(() => store.stash('Waiting on CI', 'Waiting on CI', '2026-10-20T09:00:00.000Z', now), ThreadIdError)
  store.stash(UUID, 'Waiting on CI', '2026-10-20T09:00:00.000Z', now)
  const saved = store.getState()
  assert.deepEqual(Object.keys(saved.items[UUID]).sort(), ['dueAt', 'stashedAt', 'title'])
  assert.equal('archive' in store, false)
  assert.equal('pin' in store, false)
  assert.equal('deleteThread' in store, false)
})

test('refreshTitle updates the cache and does not create a row', () => {
  const store = createStashStore(createMemoryStorage())
  assert.equal(store.refreshTitle(UUID, 'Nope', now), false)
  store.stash(UUID, 'Old', '2026-10-20T09:00:00.000Z', now)
  assert.equal(store.refreshTitle(UUID, 'New', now), true)
  assert.equal(store.get(UUID)?.title, 'New')
  assert.equal(store.refreshTitle(UUID, 'New', now), false)
})

test('callers cannot mutate internal rows', () => {
  const store = createStashStore(createMemoryStorage())
  store.stash(UUID, 'A', '2026-10-20T09:00:00.000Z', now)
  const [row] = store.list(now)
  row.title = 'tampered'
  assert.equal(store.get(UUID)?.title, 'A')
})

test('sortRows orders by due date, stash time, or title', async () => {
  const { sortRows, normalizeSortMode } = await import('../src/sort.js')
  const now = new Date('2026-10-12T12:00:00Z')
  const rows = [
    { title: 'b', dueAt: '2026-10-20T01:00:00Z', stashedAt: '2026-10-01T00:00:00Z' },
    { title: 'a', dueAt: '2026-10-14T01:00:00Z', stashedAt: '2026-10-03T00:00:00Z' },
    { title: 'c', dueAt: '2026-10-11T01:00:00Z', stashedAt: '2026-10-02T00:00:00Z' },
  ]
  assert.deepEqual(sortRows(rows, 'due', now).map((r) => r.title), ['c', 'a', 'b'])
  assert.deepEqual(sortRows(rows, 'stashed', now).map((r) => r.title), ['a', 'c', 'b'])
  assert.deepEqual(sortRows(rows, 'title', now).map((r) => r.title), ['a', 'b', 'c'])
  assert.equal(normalizeSortMode('bogus'), 'due')
  assert.equal(rows[0].title, 'b', 'input not mutated')
})
