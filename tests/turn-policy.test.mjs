import assert from 'node:assert/strict'
import { mkdtemp, realpath, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { test } from 'node:test'
import { ReadAloudService, TtsRuntime } from '../lib/index.js'

const checkout = process.env.DSH_CHECKOUT
  ?? resolve(await realpath(new URL('../node_modules/@deepseek-ai/cordis', import.meta.url)), '../..')
const { Context } = await import(pathToFileURL(join(checkout, 'vendor/cordis/lib/index.js')).href)
const { default: SessionStore } = await import(pathToFileURL(join(checkout, 'packages/core/session/lib/index.js')).href)
const { default: SessionQuery } = await import(pathToFileURL(join(checkout, 'packages/session-query/session-query/lib/index.js')).href)

test('skips delegated and interrupted turns, deduplicates synthesis, and removes its listener on disposal', async t => {
  const previousHome = process.env.DSH_HOME
  const home = await mkdtemp(join(tmpdir(), 'read-aloud-policy-'))
  process.env.DSH_HOME = home
  const ctx = new Context()
  const finish = Promise.withResolvers()
  let running
  t.after(async () => {
    finish.resolve()
    await running
    await ctx.fiber.dispose()
    if (previousHome === undefined) delete process.env.DSH_HOME
    else process.env.DSH_HOME = previousHome
    await rm(home, { recursive: true, force: true })
  })
  await ctx.plugin(SessionStore)
  await ctx.plugin(SessionQuery)
  await ctx.plugin(TtsRuntime, { model: 'test', voice: 'test', bitrate: 64000, maxChars: 1000 })
  const started = Promise.withResolvers()
  let calls = 0
  ctx.tts.registerProvider({
    id: 'test', available: () => true,
    synthesize: async () => {
      calls++
      started.resolve()
      await finish.promise
      return { data: Buffer.from('audio'), mediaType: 'audio/mpeg' }
    },
  })
  const fiber = await ctx.plugin(ReadAloudService, { ttlDays: 1, synthesizeOnTurnEnd: true })
  const queries = t.mock.method(ctx.sessionQuery, 'observeSession')
  const delegated = ctx.sessions.create('child', { meta: { parentSessionId: 'parent', delegationDepth: 1, cwd: tmpdir() } })
  delegated.append('turn/end', { turn: 1, reason: { kind: 'completed' } })
  const session = ctx.sessions.create('parent', { meta: { cwd: tmpdir() } })
  session.append('turn/end', { turn: 1, reason: { kind: 'interrupted' } })
  assert.equal(queries.mock.callCount(), 0)
  session.append('turn/start', { turn: 2 })
  session.append('assistant/message', {
    turn: 2, step: 1, stream: [],
    message: { id: 'reply', role: 'assistant', content: [{ type: 'text', text: 'Hello' }], source: { kind: 'model', model: 'test', provider: 'test' } },
  }, { surfaceOp: 'append' })
  session.append('turn/end', { turn: 2, reason: { kind: 'completed' } })
  await started.promise
  running = ctx.readAloud.audio({ sessionId: session.id, messageId: 'reply' })
  finish.resolve()
  assert.equal((await running).ok, true)
  assert.equal(calls, 1)
  await fiber.dispose()
  const previousQueries = queries.mock.callCount()
  session.append('turn/end', { turn: 3, reason: { kind: 'completed' } })
  assert.equal(queries.mock.callCount(), previousQueries)
})
