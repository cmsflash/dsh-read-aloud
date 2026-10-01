import assert from 'node:assert/strict'
import { copyFile, mkdir, mkdtemp, readFile, realpath, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, dirname, join, resolve } from 'node:path'
import { setTimeout } from 'node:timers/promises'
import { pathToFileURL } from 'node:url'
import { test } from 'node:test'
import { ReadAloudService, TtsRuntime } from '../lib/index.js'

const checkout = process.env.DSH_CHECKOUT
  ?? resolve(await realpath(new URL('../node_modules/@deepseek-ai/cordis', import.meta.url)), '../..')
const host = path => import(pathToFileURL(join(checkout, path)).href)
const { Context } = await host('vendor/cordis/lib/index.js')
const { default: SessionStore, Session } = await host('packages/core/session/lib/index.js')
const { default: SessionQuery } = await host('packages/session-query/session-query/lib/index.js')
const { default: JsonlPersistence } = await host('packages/session/session-persistence-jsonl/lib/index.js')

async function setup(t, synthesizeOnTurnEnd = false) {
  const home = await mkdtemp(join(tmpdir(), 'read-aloud-test-'))
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
  await ctx.plugin(TtsRuntime, { model: 'test', voice: 'test', bitrate: 128000, maxChars: 10000 })
  const spoken = []
  ctx.tts.registerProvider({
    id: 'test',
    available: () => true,
    synthesize: async ({ text }) => {
      spoken.push(text)
      return { data: Buffer.from(text), mediaType: 'audio/mpeg' }
    },
  })
  await ctx.plugin(ReadAloudService, { ttlDays: 1, synthesizeOnTurnEnd })
  return { ctx, home, spoken }
}

function appendReply(session, id, text, turn = 1) {
  return session.append('assistant/message', {
    turn, step: 1, stream: [],
    message: {
      id, role: 'assistant',
      content: [{ type: 'reasoning', text: 'private reasoning' }, { type: 'text', text }],
      source: { kind: 'model', provider: 'test', model: 'test' },
    },
  }, { surfaceOp: 'append' })
}

function assertAudio(result, text, regenerated = true) {
  assert.equal(result.ok, true, JSON.stringify(result))
  assert.equal(result.value.regenerated, regenerated)
  assert.equal(Buffer.from(result.value.data, 'base64').toString(), text)
}

test('reads a live session with no events property, preferring its unpersisted reply', async t => {
  const { ctx, spoken } = await setup(t)
  const session = ctx.sessions.create('live', { meta: { cwd: tmpdir() } })
  session.append('turn/start', { turn: 1 })
  appendReply(session, 'early', 'Superseded prose')
  appendReply(session, 'closing', 'Hello from the live session')
  session.append('turn/end', { turn: 1, reason: { kind: 'completed' } })
  assert.equal('events' in session, false)
  assert.equal(await ctx.sessionPersistence.stat(session.id), undefined)
  assertAudio(await ctx.readAloud.audio({ sessionId: session.id, messageId: 'closing' }), 'Hello from the live session')
  assertAudio(await ctx.readAloud.audio({ sessionId: session.id, messageId: 'closing' }), 'Hello from the live session', false)
  assert.deepEqual(await ctx.readAloud.audio({ sessionId: session.id, messageId: 'early' }), { ok: false, code: 'message-not-found' })
  assert.deepEqual(spoken, ['Hello from the live session'])
})

test('reads a stored session through real persistence handles without attaching it', async t => {
  const { ctx, spoken } = await setup(t)
  const session = Session.create('stored')
  const header = session.header
  const events = [session.append('turn/start', { turn: 1 }), appendReply(session, 'stored-reply', 'Stored reply'),
    session.append('turn/end', { turn: 1, reason: { kind: 'completed' } })]
  const handle = await ctx.sessionPersistence.create(header)
  try { await handle.append(events); await handle.flush() } finally { await handle.close() }
  assert.equal('inspect' in ctx.sessionPersistence, false)
  assert.equal(ctx.sessions.get(header.id), undefined)
  assertAudio(await ctx.readAloud.audio({ sessionId: header.id, messageId: 'stored-reply' }), 'Stored reply')
  assert.equal(ctx.sessions.get(header.id), undefined)
  assert.deepEqual(spoken, ['Stored reply'])
})

test('reports a genuinely missing session separately from storage failures', async t => {
  const { ctx } = await setup(t)
  assert.deepEqual(await ctx.readAloud.audio({ sessionId: 'missing', messageId: 'm' }), { ok: false, code: 'session-not-found' })
  t.mock.method(ctx.sessionQuery, 'observeSession', async () => { throw new Error('storage unavailable') })
  const failed = await ctx.readAloud.audio({ sessionId: 'broken', messageId: 'm' })
  assert.deepEqual(failed, { ok: false, code: 'session-read-failed', detail: 'Error: storage unavailable' })
})

test('releases observations on selection failure and before synthesis', async t => {
  const { ctx } = await setup(t)
  let released = false
  t.mock.method(ctx.sessionQuery, 'observeSession', async () => ({
    get events() { throw new Error('cannot read events') },
    [Symbol.dispose]() { released = true },
  }))
  assert.equal((await ctx.readAloud.audio({ sessionId: 'broken', messageId: 'm' })).code, 'session-read-failed')
  assert.equal(released, true)
  released = false
  t.mock.method(ctx.sessionQuery, 'observeSession', async () => ({
    events: [{ type: 'assistant/message', data: { turn: 1, message: { id: 'm', content: [{ type: 'text', text: 'Hi' }] } } }],
    [Symbol.dispose]() { released = true },
  }))
  t.mock.method(ctx.tts, 'synthesize', async () => {
    assert.equal(released, true)
    throw new Error('provider offline')
  })
  assert.deepEqual(await ctx.readAloud.audio({ sessionId: 'live', messageId: 'm' }), {
    ok: false, code: 'synthesis-failed', detail: 'Error: provider offline',
  })
})

test('prepares completed-turn audio and contains read failures in the background', async t => {
  const { ctx, home, spoken } = await setup(t, true)
  const session = ctx.sessions.create('auto', { meta: { cwd: tmpdir() } })
  session.append('turn/start', { turn: 1 })
  appendReply(session, 'auto-reply', 'Automatic reply')
  session.append('turn/end', { turn: 1, reason: { kind: 'completed' } })
  const deadline = Date.now() + 3000
  for (;;) {
    try {
      assert.equal(await readFile(join(home, 'cache/read-aloud/auto-reply.mp3'), 'utf8'), 'Automatic reply')
      break
    } catch (error) {
      if (Date.now() >= deadline) throw error
      await setTimeout(5)
    }
  }
  assert.deepEqual(spoken, ['Automatic reply'])
  assertAudio(await ctx.readAloud.audio({ sessionId: session.id, messageId: 'auto-reply' }), 'Automatic reply', false)
  const warning = Promise.withResolvers()
  const logger = ctx.readAloud.ctx.logger
  t.mock.method(logger, 'warn', message => warning.resolve(message))
  t.mock.method(ctx.sessionQuery, 'observeSession', async () => { throw new Error('read failed') })
  session.append('turn/start', { turn: 2 })
  appendReply(session, 'failure', 'Not synthesized', 2)
  session.append('turn/end', { turn: 2, reason: { kind: 'completed' } })
  assert.match(await warning.promise, /read failed/)
  assert.deepEqual(spoken, ['Automatic reply'])
})

if (process.env.READ_ALOUD_SESSION_FILE) {
  test('resolves the reported message from an isolated copy of a recorded session', async t => {
    const source = resolve(process.env.READ_ALOUD_SESSION_FILE)
    const messageId = process.env.READ_ALOUD_MESSAGE_ID
    assert.ok(messageId, 'READ_ALOUD_MESSAGE_ID is required')
    const { ctx, home, spoken } = await setup(t)
    const sessionId = basename(dirname(source))
    const destination = join(home, 'sessions', basename(dirname(dirname(source))), sessionId)
    await mkdir(destination, { recursive: true })
    await copyFile(source, join(destination, basename(source)))
    const result = await ctx.readAloud.audio({ sessionId, messageId })
    assert.equal(result.ok, true, JSON.stringify(result))
    assert.equal(spoken.length, 1)
    assert.ok(spoken[0].length > 0)
    if (process.env.READ_ALOUD_EXPECTED_PREFIX) {
      assert.ok(spoken[0].startsWith(process.env.READ_ALOUD_EXPECTED_PREFIX))
    }
    assertAudio(result, spoken[0])
    assert.equal(ctx.sessions.get(sessionId), undefined)
  })
}
