import assert from 'node:assert/strict'
import { mkdtemp, readdir, realpath, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { test } from 'node:test'
import { ReadAloudService, TtsRuntime } from '../lib/index.js'

const checkout = process.env.DSH_CHECKOUT
  ?? resolve(await realpath(new URL('../node_modules/@deepseek-ai/cordis', import.meta.url)), '../..')
const host = path => import(pathToFileURL(join(checkout, path)).href)
const { Context } = await host('vendor/cordis/lib/index.js')
const { default: SessionStore } = await host('packages/core/session/lib/index.js')
const { default: SessionQuery } = await host('packages/session-query/session-query/lib/index.js')
const JsonlPersistence = await host('packages/session/session-persistence-jsonl/lib/index.js')

function fakeWorkspaceFiles(files, reads) {
  return {
    async read(scope, path, range, signal) {
      reads.push({ scope, path, offset: range.offset, aborted: signal.aborted })
      const text = files.get(path)
      if (text === undefined) throw Object.assign(new Error(`no entry at "${path}"`), { code: 'workspace-file/not-found' })
      if (text === null) throw Object.assign(new Error(`"${path}" is not UTF-8 text`), { code: 'workspace-file/not-text' })
      if (text instanceof Error) throw text
      const lines = text.split('\n')
      const start = (range.offset ?? 1) - 1
      const page = lines.slice(start, start + 2)
      return { absolutePath: path, version: 'v', offset: start + 1, text: page.join('\n'), lines: page.length, eof: start + page.length >= lines.length }
    },
  }
}

async function setup(t, { fileMaxChars = 1000, fileSegmentChars = 40, withFiles = true } = {}) {
  const home = await mkdtemp(join(tmpdir(), 'read-aloud-file-'))
  const previousHome = process.env.DSH_HOME
  process.env.DSH_HOME = home
  const ctx = new Context()
  t.after(async () => {
    await ctx.fiber.dispose()
    if (previousHome === undefined) delete process.env.DSH_HOME
    else process.env.DSH_HOME = previousHome
    await rm(home, { recursive: true, force: true })
  })
  await ctx.plugin(SessionStore)
  await ctx.plugin(JsonlPersistence, { root: join(home, 'sessions') })
  await ctx.plugin(SessionQuery)
  await ctx.plugin(TtsRuntime, { model: 'test', voice: 'test', bitrate: 64000, maxChars: 10000 })
  const spoken = []
  ctx.tts.registerProvider({
    id: 'test',
    available: () => true,
    synthesize: async ({ text }) => {
      spoken.push(text)
      return { data: Buffer.from(text), mediaType: 'audio/mpeg' }
    },
  })
  const files = new Map()
  const reads = []
  if (withFiles) ctx.provide('workspaceFiles', fakeWorkspaceFiles(files, reads))
  await ctx.plugin(ReadAloudService, { ttlDays: 1, synthesizeOnTurnEnd: false, fileMaxChars, fileSegmentChars })
  const session = ctx.sessions.create('live', { meta: { cwd: tmpdir() } })
  const signal = new AbortController().signal
  const audio = (path, index = 0, sessionId = session.id) => ctx.readAloud.fileAudio({ sessionId, path, index }, signal)
  return { ctx, home, spoken, files, reads, session, audio }
}

const decoded = result => Buffer.from(result.value.data, 'base64').toString()

test('reads a Markdown file in parts, cleaned, through the workspace file service', async t => {
  const { files, reads, spoken, session, audio, home } = await setup(t)
  files.set('/w/plan.md', ['# Plan', '', 'First **bold** paragraph here.', '```', 'code', '```', 'Second paragraph follows it.'].join('\n'))
  const first = await audio('/w/plan.md')
  assert.equal(first.ok, true, JSON.stringify(first))
  assert.equal(decoded(first), 'Plan.\nFirst bold paragraph here.')
  assert.deepEqual({ ...first.value, data: undefined }, {
    data: undefined, mediaType: 'audio/mpeg', regenerated: true, index: 0, count: 2, truncated: false,
  })
  assert.deepEqual(reads.map(read => read.offset), [1, 3, 5, 7])
  assert.deepEqual(reads[0].scope, { sessionId: session.id, workspaceRoot: tmpdir() })
  const second = await audio('/w/plan.md', 1)
  assert.equal(decoded(second), 'Second paragraph follows it.')
  assert.equal((await audio('/w/plan.md')).value.regenerated, false)
  assert.deepEqual(spoken, ['Plan.\nFirst bold paragraph here.', 'Second paragraph follows it.'])
  assert.deepEqual(await audio('/w/plan.md', 2), { ok: false, code: 'segment-out-of-range' })
  const cached = (await readdir(join(home, 'cache/read-aloud'))).sort()
  assert.equal(cached.length, 2)
  assert.ok(cached.every(name => /^file-[0-9a-f]{64}\.mp3$/.test(name)), cached.join())
})

test('caches a part by its text, so an edit re-synthesizes only the changed part and a copy costs nothing', async t => {
  const { files, spoken, audio } = await setup(t)
  files.set('/w/a.md', 'Alpha paragraph stays the same always.\n\nBeta paragraph will be edited later.')
  await audio('/w/a.md', 0)
  await audio('/w/a.md', 1)
  files.set('/w/a.md', 'Alpha paragraph stays the same always.\n\nBeta paragraph has now been edited.')
  files.set('/w/copy.txt', 'Alpha paragraph stays the same always.')
  assert.equal((await audio('/w/a.md', 0)).value.regenerated, false)
  assert.equal((await audio('/w/a.md', 1)).value.regenerated, true)
  assert.equal((await audio('/w/copy.txt', 0)).value.regenerated, false)
  assert.deepEqual(spoken, [
    'Alpha paragraph stays the same always.',
    'Beta paragraph will be edited later.',
    'Beta paragraph has now been edited.',
  ])
})

test('cuts a long file at the configured bound and says so', async t => {
  const { files, audio } = await setup(t, { fileMaxChars: 30, fileSegmentChars: 40 })
  files.set('/w/long.txt', 'word '.repeat(40))
  const result = await audio('/w/long.txt')
  assert.equal(result.value.truncated, true)
  assert.equal(result.value.count, 1)
  assert.equal(decoded(result), 'word word word word word word.')
})

test('refuses what it must not or cannot read, without reading or synthesizing', async t => {
  const { files, reads, spoken, audio } = await setup(t)
  files.set('/w/binary.md', null)
  files.set('/w/empty.md', '```\nonly code\n```')
  files.set('/w/broken.md', new Error('disk on fire'))
  assert.deepEqual(await audio('/w/app.ts'), { ok: false, code: 'file-unsupported' })
  assert.deepEqual(await audio('notes.md'), { ok: false, code: 'file-unsupported' })
  assert.deepEqual(await audio('/w/a.constructor'), { ok: false, code: 'file-unsupported' })
  assert.deepEqual(await audio('/w/a.__proto__'), { ok: false, code: 'file-unsupported' })
  assert.deepEqual(reads, [])
  assert.deepEqual(await audio('/w/missing.md'), { ok: false, code: 'file-not-found' })
  assert.deepEqual(await audio('/w/binary.md'), { ok: false, code: 'file-not-text' })
  assert.deepEqual(await audio('/w/empty.md'), { ok: false, code: 'file-empty' })
  assert.deepEqual(await audio('/w/broken.md'), { ok: false, code: 'file-read-failed', detail: 'Error: disk on fire' })
  const before = reads.length
  assert.deepEqual(await audio('/w/empty.md', 0, 'no-such-session'), { ok: false, code: 'session-not-found' })
  assert.equal(reads.length, before)
  assert.deepEqual(spoken, [])
})

test('reports a deployment without the workspace file service, and a failed synthesis', async t => {
  const bare = await setup(t, { withFiles: false })
  assert.deepEqual(await bare.audio('/w/a.md'), { ok: false, code: 'file-read-unavailable' })
  const { ctx, files, audio } = await setup(t)
  files.set('/w/a.md', 'Some words.')
  t.mock.method(ctx.tts, 'synthesize', async () => { throw new Error('provider offline') })
  assert.deepEqual(await audio('/w/a.md'), { ok: false, code: 'synthesis-failed', detail: 'Error: provider offline' })
})
