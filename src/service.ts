/**
 * Read-aloud audio for completed turns: a `turn/end` listener that synthesizes
 * each turn's closing prose, plus a filesystem cache under the Harness home.
 *
 * Audio is regenerable presentation, never durable Session state — nothing here
 * appends to the Session log, and a cache miss is an ordinary outcome resolved
 * by synthesizing again.
 *
 * The browser reaches `audio()` through the plugin's own RPC channel rather
 * than a generated Remote, because an external plugin cannot contribute to the
 * Host's fixed Remote assembly.
 * @module @dsh-external/dsh-read-aloud/service
 */

import { Buffer } from 'node:buffer'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { Context, Service } from '@deepseek-ai/cordis'
import { ReadAloudStore } from './store.ts'
import { closingMessageOf, spokenTextOf } from './text.ts'
import type { SpeechAudioRequest, SpeechAudioResult, SpeechAudioValue } from './cache-types.ts'

declare module '@deepseek-ai/cordis' {
  interface Context {
    readAloud: ReadAloudService
  }
}

/** Required deployment policy for cached read-aloud audio. */
export interface Config {
  /** Days a synthesized artifact is served before it is swept. */
  readonly ttlDays: number
  /**
   * Synthesize every completed turn as it ends. False leaves synthesis to the
   * first playback request, trading latency for spend on turns nobody plays.
   */
  readonly synthesizeOnTurnEnd: boolean
}

/** Milliseconds in one day, for the TTL conversion. */
const DAY_MS = 86_400_000

/**
 * Cached read-aloud audio for finalized assistant messages.
 *
 * The Host resolves spoken text from the Session log by `messageId`, so a
 * browser sends identity rather than prose and no conversation surface has to
 * carry the text.
 */
export class ReadAloudService extends Service {
  static inject = ['sessions', 'tts']

  private readonly store: ReadAloudStore
  private readonly synthesizeOnTurnEnd: boolean
  /** In-flight synthesis per message, so a turn-end job and a play request share one call. */
  private readonly inFlight = new Map<string, Promise<Uint8Array>>()

  /**
   * @param ctx - Host context carrying the Session store and the tts seam.
   * @param config - Required retention and trigger policy.
   */
  constructor(ctx: Context, config: Config) {
    super(ctx, 'readAloud')
    const home = process.env.DSH_HOME ?? join(homedir(), '.dsh')
    this.store = new ReadAloudStore(join(home, 'cache', 'read-aloud'), config.ttlDays * DAY_MS)
    this.synthesizeOnTurnEnd = config.synthesizeOnTurnEnd
  }

  /** Sweep expired artifacts once at startup, then follow completed turns. */
  protected [Service.init](): void {
    void this.store.sweep()
    if (!this.synthesizeOnTurnEnd) return
    this.ctx.on('session/event', (session: any, event: any) => {
      if (event.type !== 'turn/end') return
      // An interrupted turn has no settled closing prose to read.
      if (event.data.reason.kind !== 'completed') return
      // A subagent transcript has no playback surface; synthesizing it would
      // bill for audio nothing can play.
      if (session.header.origin === 'subagent') return
      const closing = closingMessageOf(session.events, event.data.turn)
      if (closing === undefined) return
      void this.ensureAudio(closing.messageId, closing.text)
    })
  }

  /**
   * Read one message's audio, synthesizing it when the cache does not hold it.
   * @param request - the Session and message to read aloud.
   * @returns base64 audio, or an explicit failure.
   */
  async audio(request: SpeechAudioRequest): Promise<SpeechAudioResult> {
    const cached = await this.store.read(request.messageId)
    if (cached !== undefined) return success(cached.data, false)
    const session = this.ctx.sessions.get(request.sessionId)
    if (session === undefined) return { ok: false, code: 'session-not-found' }
    const text = spokenTextOf(session.events, request.messageId)
    if (text === undefined) return { ok: false, code: 'message-not-found' }
    try {
      return success(await this.ensureAudio(request.messageId, text), true)
    } catch (error: unknown) {
      return { ok: false, code: 'synthesis-failed', detail: String(error) }
    }
  }

  /**
   * Synthesize and cache one message's audio, joining any in-flight call for
   * the same message so a turn-end job and a playback request never bill twice.
   * @param messageId - the message the audio belongs to.
   * @param text - the prose to speak.
   * @returns the synthesized audio bytes.
   */
  private ensureAudio(messageId: string, text: string): Promise<Uint8Array> {
    const existing = this.inFlight.get(messageId)
    if (existing !== undefined) return existing
    const pending = this.synthesizeAndStore(messageId, text)
      .finally(() => this.inFlight.delete(messageId))
    this.inFlight.set(messageId, pending)
    return pending
  }

  private async synthesizeAndStore(messageId: string, text: string): Promise<Uint8Array> {
    const audio = await this.ctx.tts.synthesize({ text })
    await this.store.write(messageId, audio.data)
    return audio.data
  }
}

/** Wrap audio bytes as the channel's success value. */
function success(data: Uint8Array, regenerated: boolean): { ok: true; value: SpeechAudioValue } {
  return {
    ok: true,
    value: { data: Buffer.from(data).toString('base64'), mediaType: 'audio/mpeg', regenerated },
  }
}
