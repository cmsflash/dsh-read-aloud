import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { setImmediate } from 'node:timers/promises'
import { pathToFileURL } from 'node:url'
import { after, beforeEach, test } from 'node:test'
import { build } from 'esbuild'

const dir = await mkdtemp(join(tmpdir(), 'read-aloud-player-'))
await build({ entryPoints: ['src/client/player.ts'], bundle: true, format: 'esm', platform: 'neutral', outfile: join(dir, 'player.mjs') })
const { SpeechPlayer } = await import(pathToFileURL(join(dir, 'player.mjs')).href)
after(() => rm(dir, { recursive: true, force: true }))

class FakeAudio {
  static instances = []
  src = ''
  onended = null
  onerror = null
  error = null
  paused = true
  played = []
  constructor() { FakeAudio.instances.push(this) }
  play() {
    this.paused = false
    this.played.push(this.src)
    return FakeAudio.rejectPlay ? Promise.reject(new Error('NotAllowedError')) : Promise.resolve()
  }
  pause() { this.paused = true }
}
globalThis.Audio = FakeAudio
beforeEach(() => {
  FakeAudio.instances = []
  FakeAudio.rejectPlay = false
})

const part = (count, truncated) => ({ data: Buffer.from('audio').toString('base64'), mediaType: 'audio/mpeg', count, truncated })

function harness(load) {
  const calls = []
  const reports = []
  const player = new SpeechPlayer(async (key, index) => {
    calls.push(`${key}#${index}`)
    return load(key, index)
  }, (key, stage, reason) => reports.push({ key, stage, reason }))
  const statuses = []
  player.subscribe(() => statuses.push(player.getSnapshot().status))
  return { player, calls, reports, statuses, element: () => FakeAudio.instances.at(-1) }
}

test('plays a single-part reading and returns to idle when it ends', async () => {
  const { player, calls, reports, statuses, element } = harness(async () => part(undefined))
  const done = player.toggle('m1')
  await setImmediate()
  assert.deepEqual(player.getSnapshot(), { activeMessageId: 'm1', status: 'playing', truncated: false })
  element().onended()
  await done
  assert.deepEqual(calls, ['m1#0'])
  assert.deepEqual(statuses, ['loading', 'playing', 'idle'])
  assert.deepEqual(reports, [])
  assert.equal(element().played.length, 1)
})

test('plays every part in order on one element, loading the next part during playback', async () => {
  const { player, calls, element } = harness(async () => part(3, true))
  const done = player.toggle('file:/w/a.md')
  await setImmediate()
  assert.deepEqual(calls, ['file:/w/a.md#0', 'file:/w/a.md#1'])
  assert.equal(player.getSnapshot().truncated, true)
  const first = element()
  first.onended()
  await setImmediate()
  first.onended()
  await setImmediate()
  first.onended()
  await done
  assert.deepEqual(calls, ['file:/w/a.md#0', 'file:/w/a.md#1', 'file:/w/a.md#2'])
  assert.equal(FakeAudio.instances.length, 1)
  assert.equal(first.played.length, 3)
  assert.equal(player.getSnapshot().status, 'idle')
})

test('a stopped multi-part reading resumes at the part it was playing, and a finished one restarts', async () => {
  const { player, calls, element } = harness(async () => part(3))
  const first = player.toggle('file:/w/a.md')
  await setImmediate()
  element().onended()
  await setImmediate()
  await player.toggle('file:/w/a.md')
  await first
  assert.equal(player.getSnapshot().status, 'idle')
  assert.equal(element().paused, true)
  calls.length = 0
  const second = player.toggle('file:/w/a.md')
  await setImmediate()
  assert.deepEqual(calls, ['file:/w/a.md#1', 'file:/w/a.md#2'])
  element().onended()
  await setImmediate()
  element().onended()
  await second
  calls.length = 0
  const third = player.toggle('file:/w/a.md')
  await setImmediate()
  assert.equal(calls[0], 'file:/w/a.md#0')
  player.stop()
  await third
})

test('starting another reading supersedes the first', async () => {
  const { player, element } = harness(async () => part(undefined))
  const first = player.toggle('m1')
  await setImmediate()
  const old = element()
  const second = player.toggle('m2')
  await first
  await setImmediate()
  assert.equal(old.paused, true)
  assert.equal(old.onended, null)
  assert.deepEqual(player.getSnapshot(), { activeMessageId: 'm2', status: 'playing', truncated: false })
  player.stop()
  await second
})

test('reports a refused first part, a failing later part, and a rejected play()', async () => {
  const refused = harness(async () => { throw new Error('host refused: file-not-text') })
  await refused.player.toggle('file:/w/a.md')
  assert.equal(refused.player.getSnapshot().status, 'error')
  assert.deepEqual(refused.reports, [{ key: 'file:/w/a.md', stage: 'request', reason: 'Error: host refused: file-not-text' }])

  const later = harness(async (_key, index) => {
    if (index === 1) throw new Error('synthesis-failed')
    return part(2)
  })
  const done = later.player.toggle('file:/w/b.md')
  await setImmediate()
  later.element().onended()
  await done
  assert.equal(later.player.getSnapshot().status, 'error')
  assert.equal(later.reports[0].stage, 'request')
  const retry = later.player.toggle('file:/w/b.md')
  await retry
  assert.equal(later.calls.at(-1), 'file:/w/b.md#1')

  FakeAudio.rejectPlay = true
  const blocked = harness(async () => part(undefined))
  await blocked.player.toggle('m1')
  assert.equal(blocked.player.getSnapshot().status, 'error')
  assert.equal(blocked.reports[0].stage, 'play')
})

test('ends quietly when a resumed reading no longer has that part', async () => {
  let count = 3
  const { player, calls, element } = harness(async (_key, index) => (index < count ? part(count) : undefined))
  const first = player.toggle('file:/w/a.md')
  await setImmediate()
  element().onended()
  await setImmediate()
  element().onended()
  await setImmediate()
  player.stop()
  await first
  count = 1
  await player.toggle('file:/w/a.md')
  assert.equal(calls.at(-1), 'file:/w/a.md#2')
  assert.equal(player.getSnapshot().status, 'idle')
  calls.length = 0
  const again = player.toggle('file:/w/a.md')
  await setImmediate()
  assert.deepEqual(calls, ['file:/w/a.md#0'])
  player.stop()
  await again
})
