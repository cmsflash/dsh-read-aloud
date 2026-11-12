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
import { createHash } from 'node:crypto'
import { homedir } from 'node:os'
import { isAbsolute, join } from 'node:path'
import { Context, Service } from '@deepseek-ai/cordis'
import { ReadAloudStore } from './store.ts'
import { closingMessageOf, spokenTextOf } from './text.ts'
import { speakableKind } from './speakable.ts'
import { speakableText, splitSegments } from './speech-text.ts'
import type { SessionEvent } from '@deepseek-ai/dsh-session/types'
import type {
  SpeechAudioFailure,
  SpeechAudioRequest,
  SpeechAudioResult,
  SpeechAudioValue,
  SpeechFileAudioFailure,
  SpeechFileAudioFailureCode,
  SpeechFileAudioRequest,
  SpeechFileAudioResult,
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
  readonly fileMaxChars: number
  readonly fileSegmentChars: number
}

/** Milliseconds in one day, for the TTL conversion. */
const DAY_MS = 86_400_000

interface WorkspaceFilesReader {
  read(
    scope: { readonly sessionId: string; readonly workspaceRoot: string },
    path: string,
    range: { readonly offset?: number },
    signal: AbortSignal,
  ): Promise<{ readonly text: string; readonly lines: number; readonly eof: boolean }>
}

class FileRefusal extends Error {
  constructor(readonly code: SpeechFileAudioFailureCode) {
    super(code)
  }
}

const FILE_FAILURES: Readonly<Record<string, SpeechFileAudioFailureCode>> = {
  'workspace-file/not-found': 'file-not-found',
  'workspace-file/not-regular-file': 'file-not-found',
  'workspace-file/not-text': 'file-not-text',
  'workspace-file/too-large': 'file-too-large',
}

function fileFailureOf(error: unknown): SpeechFileAudioFailure {
  if (error instanceof FileRefusal) return { ok: false, code: error.code }
  const code = typeof error === 'object' && error !== null && 'code' in error ? FILE_FAILURES[String(error.code)] : undefined
  return code === undefined ? { ok: false, code: 'file-read-failed', detail: String(error) } : { ok: false, code }
}

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
  private readonly fileMaxChars: number
  private readonly fileSegmentChars: number
  /** In-flight synthesis per cache key, so a turn-end job and a play request share one call. */
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
    this.fileMaxChars = config.fileMaxChars
    this.fileSegmentChars = config.fileSegmentChars
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

  async fileAudio(request: SpeechFileAudioRequest, signal: AbortSignal): Promise<SpeechFileAudioResult> {
    const kind = speakableKind(request.path)
    if (kind === undefined || !isAbsolute(request.path)) return this.refuseFile(request, { ok: false, code: 'file-unsupported' })
    let source: { text: string; truncated: boolean }
    try {
      source = await this.readFileSource(request.sessionId, request.path, signal)
    } catch (error: unknown) {
      return this.refuseFile(request, fileFailureOf(error))
    }
    const segments = splitSegments(speakableText(source.text, kind), this.fileSegmentChars)
    if (segments.length === 0) return this.refuseFile(request, { ok: false, code: 'file-empty' })
    const text = segments[request.index]
    if (text === undefined) return this.refuseFile(request, { ok: false, code: 'segment-out-of-range' })
    const spec = this.ctx.tts.resolve({ text })
    const key = `file-${createHash('sha256').update([spec.model, spec.voice, String(spec.bitrate), spec.text].join('\0')).digest('hex')}`
    const reading = { index: request.index, count: segments.length, truncated: source.truncated }
    try {
      const cached = await this.store.read(key)
      const data = cached?.data ?? await this.ensureAudio(key, text)
      return { ok: true, value: { ...success(data, cached === undefined).value, ...reading } }
    } catch (error: unknown) {
      return this.refuseFile(request, { ok: false, code: 'synthesis-failed', detail: String(error) })
    }
  }

  private async readFileSource(
    sessionId: string,
    path: string,
    signal: AbortSignal,
  ): Promise<{ text: string; truncated: boolean }> {
    const files = this.ctx.get('workspaceFiles') as WorkspaceFilesReader | undefined
    if (files === undefined) throw new FileRefusal('file-read-unavailable')
    // The same header-only resolution the workspace file service's own lookup
    // performs: a live Session, else the stored header, never an Agent start.
    const live = this.ctx.sessions.get(sessionId)?.header as { cwd?: string } | undefined
    const persistence = this.ctx.get('sessionPersistence') as
      { stat(id: string): Promise<{ header: { cwd?: string } } | undefined> } | undefined
    const header = live ?? (await persistence?.stat(sessionId))?.header
    if (header === undefined) throw new FileRefusal('session-not-found')
    const workspaceRoot = header.cwd
      ?? (this.ctx.get('sandboxPolicy') as { workspaceRoot: string } | undefined)?.workspaceRoot
    if (workspaceRoot === undefined) throw new FileRefusal('file-read-unavailable')
    let text = ''
    let offset = 1
    for (;;) {
      const page = await files.read({ sessionId, workspaceRoot }, path, { offset }, signal)
      if (page.lines > 0) text += `${offset === 1 ? '' : '\n'}${page.text}`
      if (text.length > this.fileMaxChars) return { text: text.slice(0, this.fileMaxChars), truncated: true }
      if (page.eof || page.lines === 0) return { text, truncated: false }
      offset += page.lines
    }
  }

  private refuseFile(request: SpeechFileAudioRequest, failure: SpeechFileAudioFailure): SpeechFileAudioFailure {
    const detail = failure.detail === undefined ? '' : `: ${failure.detail}`
    this.ctx.logger.warn(
      `read-aloud: audio for part ${request.index} of file ${request.path} in session ${request.sessionId}`
      + ` refused (${failure.code})${detail}`,
    )
    return failure
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
   * Synthesize and cache one reading's audio, joining any in-flight call for
   * the same key so a turn-end job and a playback request never bill twice.
   * @param messageId - the cache key: a message id, or a file part's content key.
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
