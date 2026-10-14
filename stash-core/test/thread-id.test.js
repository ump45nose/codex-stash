import assert from 'node:assert/strict'
import test from 'node:test'
import { ThreadIdError, canonicalThreadId } from '../src/thread-id.js'

const UUID = '11111111-1111-1111-1111-111111111111'

test('canonicalThreadId strips the sidebar local: prefix', () => {
  assert.equal(canonicalThreadId(`local:${UUID}`), UUID)
  assert.equal(canonicalThreadId(UUID), UUID)
  assert.equal(canonicalThreadId(`local:${UUID}`), canonicalThreadId(UUID))
})

test('canonicalThreadId rejects titles, drafts, and empty values', () => {
  const title = catchId('Fix the sidebar')
  assert.ok(title instanceof ThreadIdError)
  assert.equal(title.code, 'looks-like-title')
  const draft = catchId('local:client-new-thread:abc12345')
  assert.ok(draft instanceof ThreadIdError)
  assert.equal(draft.code, 'not-persisted')
  assert.ok(catchId('') instanceof ThreadIdError)
  assert.ok(catchId('   ') instanceof ThreadIdError)
  assert.ok(catchId(UUID.slice(0, 4)) instanceof ThreadIdError)
})

function catchId(value) {
  try {
    canonicalThreadId(value)
  } catch (error) {
    return error
  }
  return null
}

test('canonicalThreadId accepts a non-uuid stable harness id', () => {
  assert.equal(canonicalThreadId('local:harness.pi_abc12345'), 'harness.pi_abc12345')
})
