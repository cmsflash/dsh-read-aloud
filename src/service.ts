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
import type { SessionEvent } from '@deepseek-ai/dsh-session/types'
import type {
  SpeechAudioFailure,
  SpeechAudioRequest,
  SpeechAudioResult,
  SpeechAudioValue,
  SpeechPlaybackFailureReport,
} from './cache-types.ts'

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
  static inject = ['sessions', 'sessionQuery', 'tts']

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
    this.detach(this.store.sweep(), 'sweeping the audio cache')
    if (!this.synthesizeOnTurnEnd) return
    this.ctx.on('session/event', (session: { id: string; header: { delegationDepth: number } }, event: SessionEvent) => {
      if (event.type !== 'turn/end') return
      // An interrupted turn has no settled closing prose to read.
      if (event.data.reason.kind !== 'completed') return
      // A subagent transcript has no playback surface; synthesizing it would
      // bill for audio nothing can play.
      if (session.header.delegationDepth > 0) return
      this.detach(
        this.synthesizeClosingMessage(session.id, event.data.turn),
        `synthesizing closing audio for session ${session.id}, turn ${event.data.turn}`,
      )
    })
  }

  /**
   * Consume a background promise nobody awaits, reporting a rejection as a
   * warning.
   *
   * Read-aloud audio is a regenerable cache, so a failed background job costs
   * one unplayable message: playback resynthesizes on demand and reports its
   * own failure through {@link ReadAloudService.audio}. An unhandled rejection
   * here would instead reach the Host's `unhandledRejection` fail-loud handler
   * and exit the process, so this boundary is what keeps a transient speech
   * route or filesystem failure from taking the server down with it.
   *
   * @param work - the promise to consume; its value is discarded.
   * @param description - what was being attempted, used in the warning.
   */
  private detach(work: Promise<unknown>, description: string): void {
    void work.catch((error: unknown) => {
      this.ctx.logger.warn(`read-aloud: ${description} failed: ${String(error)}`)
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
    let text: string | undefined
    try {
      text = await this.readSessionText(request.sessionId, events => spokenTextOf(events, request.messageId))
    } catch (error: unknown) {
      if (error instanceof Error && 'code' in error && error.code === 'SESSION_QUERY_SESSION_NOT_FOUND') {
        return this.refuse(request, { ok: false, code: 'session-not-found' })
      }
      return this.refuse(request, { ok: false, code: 'session-read-failed', detail: String(error) })
    }
    if (text === undefined) return this.refuse(request, { ok: false, code: 'message-not-found' })
    try {
      return success(await this.ensureAudio(request.messageId, text), true)
    } catch (error: unknown) {
      return this.refuse(request, { ok: false, code: 'synthesis-failed', detail: String(error) })
    }
  }

  /**
   * Log a refused audio request and return it unchanged.
   *
   * A refused request reaches the browser as a result code rather than a
   * thrown error, so nothing else records it: the reader sees one tooltip and
   * the Host keeps no trace. Logging here is what makes an on-demand failure
   * diagnosable afterwards, as the turn-end job already is.
   *
   * @param request - the addressed Session and message.
   * @param failure - the failure being returned to the caller.
   * @returns `failure`, unchanged.
   */
  private refuse(request: SpeechAudioRequest, failure: SpeechAudioFailure): SpeechAudioFailure {
    const detail = failure.detail === undefined ? '' : `: ${failure.detail}`
    this.ctx.logger.warn(
      `read-aloud: audio for message ${request.messageId} in session ${request.sessionId}`
      + ` refused (${failure.code})${detail}`,
    )
    return failure
  }

  /**
   * Record a playback failure the browser half observed.
   *
   * Decoding and audio-element playback run after this process has already
   * answered, so their failures are invisible here and would otherwise leave
   * the reader's "could not play" tooltip as the only evidence.
   *
   * @param report - the addressed message, the stage that failed, and why.
   */
  reportPlaybackFailure(report: SpeechPlaybackFailureReport): void {
    this.ctx.logger.warn(
      `read-aloud: playback of message ${report.messageId} in session ${report.sessionId}`
      + ` failed at ${report.stage}: ${report.reason}`,
    )
  }

  private async readSessionText<T>(
    sessionId: string,
    select: (events: readonly SessionEvent[]) => T,
  ): Promise<T> {
    const observation = await this.ctx.sessionQuery.observeSession(sessionId, { projectionMode: 'none' })
    try {
      return select(observation.events)
    } finally {
      observation[Symbol.dispose]()
    }
  }

  private async synthesizeClosingMessage(sessionId: string, turn: number): Promise<void> {
    const closing = await this.readSessionText(sessionId, events => closingMessageOf(events, turn))
    if (closing !== undefined) await this.ensureAudio(closing.messageId, closing.text)
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
