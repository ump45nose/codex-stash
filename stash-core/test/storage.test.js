import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { chooseNewer, parseState } from '../src/state.js'
import { createLocalStorageStorage, createMemoryStorage } from '../src/storage.js'
import { createJsonFileStorage, fileMode } from '../src/file-storage.js'
import { createStashStore } from '../src/store.js'

const UUID = '11111111-1111-1111-1111-111111111111'

test('localStorage storage keeps the namespaced document', () => {
  const memory = new Map()
  const storage = createLocalStorageStorage({
    getItem: (key) => memory.get(key) ?? null,
    setItem: (key, value) => memory.set(key, value),
  })
  const store = createStashStore(storage)
  store.stash(UUID, 'A', '2026-10-20T09:00:00.000Z', new Date('2026-10-12T00:00:00.000Z'))
  assert.equal(memory.has('codex-stash:v1'), true)
  const parsed = JSON.parse(memory.get('codex-stash:v1'))
  assert.equal(parsed.version, 1)
  assert.equal(parsed.items[UUID].title, 'A')
  assert.equal(createStashStore(storage).get(UUID)?.title, 'A')
})

test('corrupt JSON is backed up instead of being overwritten in place', () => {
  const dir = mkdtempSync(join(tmpdir(), 'codex-stash-'))
  const file = join(dir, 'stash.json')
  writeFileSync(file, '{not json')
  const storage = createJsonFileStorage(file)
  assert.equal(Object.keys(storage.load().items).length, 0)
  const backups = readdirSync(dir).filter((name) => name.startsWith('stash.json.corrupt-'))
  assert.equal(backups.length, 1)
  assert.equal(readFileSync(join(dir, backups[0]), 'utf8'), '{not json')
})

test('file storage writes atomically and keeps mode 0600', () => {
  const dir = mkdtempSync(join(tmpdir(), 'codex-stash-'))
  const file = join(dir, 'nested', 'stash.json')
  const storage = createJsonFileStorage(file)
  const store = createStashStore(storage)
  store.stash(UUID, 'A', '2026-10-20T09:00:00.000Z', new Date('2026-10-12T00:00:00.000Z'))
  assert.equal(fileMode(file), 0o600)
  assert.equal(readdirSync(join(dir, 'nested')).includes('stash.json.tmp'), false)
  const roundTrip = createJsonFileStorage(file).load()
  assert.equal(roundTrip.items[UUID].title, 'A')
})

test('chooseNewer keeps the snapshot with the later clock', () => {
  const older = parseState({
    version: 1,
    updatedAt: '2026-10-12T00:00:00.000Z',
    items: {
      [UUID]: {
        title: 'old',
        dueAt: '2026-10-20T09:00:00.000Z',
        stashedAt: '2026-10-12T00:00:00.000Z',
      },
    },
  }).state
  const newer = parseState({
    version: 1,
    updatedAt: '2026-10-13T00:00:00.000Z',
    items: {},
  }).state
  assert.equal(chooseNewer(older, newer), newer)
  assert.equal(chooseNewer(newer, older), newer)
})

test('invalid items are dropped and memory storage does not keep task fields', () => {
  const storage = createMemoryStorage({
    version: 1,
    updatedAt: '2026-10-12T00:00:00.000Z',
    items: {
      'a title here': { title: 'nope', dueAt: '2026-10-20T09:00:00.000Z', stashedAt: '2026-10-12T00:00:00.000Z' },
      [UUID]: {
        title: 'ok',
        dueAt: '2026-10-20T09:00:00.000Z',
        stashedAt: '2026-10-12T00:00:00.000Z',
        reason: 'blocked',
        tags: ['later'],
      },
    },
  })
  const loaded = storage.load()
  assert.deepEqual(Object.keys(loaded.items), [UUID])
  assert.deepEqual(Object.keys(loaded.items[UUID]).sort(), ['dueAt', 'stashedAt', 'title'])
})
