/**
 * Browser-side audio playback for one Session. One player per Session enforces
 * the single-stream rule: starting a reading stops whatever was playing. A
 * reading is one or more parts played in order through one audio element; an
 * assistant reply is a single part, a file is as many as the Host cut it into.
 * @module @dsh-external/dsh-read-aloud/client/player
 */

/** Decode base64 audio into a blob URL the audio element can play. */
function toObjectUrl(base64: string, mediaType: string): string {
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index)
  return URL.createObjectURL(new Blob([bytes], { type: mediaType }))
}

/** What a caller observes about one reading's playback. */
export type SpeechPlaybackStatus = 'idle' | 'loading' | 'playing' | 'error'

/** One Session's playback state, shared by every control in it. */
export interface SpeechPlaybackView {
  /** Key of the reading currently loading or playing: a message id, or `file:<absolute path>`. */
  readonly activeMessageId: string | undefined
  /** Status of {@link SpeechPlaybackView.activeMessageId}. */
  readonly status: SpeechPlaybackStatus
  readonly truncated: boolean
}

export interface SpeechAudioPart {
  readonly data: string
  readonly mediaType: string
  readonly count?: number
  readonly truncated?: boolean
}

/**
 * Fetches one part of a reading. Resolves `undefined` when the reading has no
 * such part (its source shrank since the last request); rejects on any failure.
 */
export type SpeechAudioLoader = (key: string, index: number) => Promise<SpeechAudioPart | undefined>

/** Browser-side step that failed; mirrors the Host's `SpeechPlaybackStage`. */
export type SpeechFailureStage = 'request' | 'decode' | 'play'

/** Reports one playback failure for logging; never rejects. */
export type SpeechFailureReporter = (key: string, stage: SpeechFailureStage, reason: string) => void

const IDLE: SpeechPlaybackView = Object.freeze({ activeMessageId: undefined, status: 'idle', truncated: false })

/**
 * Per-Session playback controller.
 *
 * The snapshot identity is stable between changes, so a subscribing renderer
 * re-renders only when playback actually moves.
 */
export class SpeechPlayer {
  private readonly load: SpeechAudioLoader
  private readonly report: SpeechFailureReporter
  private view: SpeechPlaybackView = IDLE
  private readonly listeners = new Set<() => void>()
  private audio: HTMLAudioElement | undefined
  private objectUrl: string | undefined
  /** Distinguishes the current reading from one superseded by a later request. */
  private generation = 0
  private settle: ((outcome: 'stopped') => void) | undefined
  private readonly resumeAt = new Map<string, number>()

  /**
   * @param load - fetches one part of a reading.
   * @param report - records a failure for the Host log.
   */
  constructor(load: SpeechAudioLoader, report: SpeechFailureReporter) {
    this.load = load
    this.report = report
  }

  /**
   * Subscribe to playback changes.
   * @param listener - called after every state change.
   * @returns the unsubscribe function.
   */
  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener)
    return () => { this.listeners.delete(listener) }
  }

  /**
   * Read the current playback state.
   * @returns the snapshot, stable by reference until playback moves.
   */
  getSnapshot = (): SpeechPlaybackView => this.view

  /**
   * Start one reading, or stop it when it is already active. A multi-part
   * reading stopped midway starts again at the part it was playing.
   * @param key - the reading: a message id, or `file:<absolute path>`.
   * @returns once the reading ended, failed, or was superseded.
   */
  async toggle(key: string): Promise<void> {
    if (this.view.activeMessageId === key && this.view.status !== 'error') {
      this.stop()
      return
    }
    this.stop()
    const generation = ++this.generation
    // One element plays every part: an element that has played once may play
    // again without a new user gesture, which a fresh element per part may not.
    const element = new Audio()
    this.audio = element
    this.publish({ activeMessageId: key, status: 'loading', truncated: false })
    let index = this.resumeAt.get(key) ?? 0
    let pending = this.load(key, index)
    for (;;) {
      let part: SpeechAudioPart | undefined
      try {
        part = await pending
      } catch (error: unknown) {
        if (generation === this.generation) {
          if (index > 0) this.resumeAt.set(key, index)
          this.fail(key, 'request', String(error))
        }
        return
      }
      if (generation !== this.generation) return
      if (part === undefined) {
        this.resumeAt.delete(key)
        if (index === 0) this.fail(key, 'request', 'the host produced no audio for this reading')
        else this.stop()
        return
      }
      const count = part.count ?? 1
      this.releaseUrl()
      try {
        this.objectUrl = toObjectUrl(part.data, part.mediaType)
      } catch (error: unknown) {
        this.fail(key, 'decode', String(error))
        return
      }
      element.src = this.objectUrl
      const outcome = new Promise<'ended' | 'error' | 'stopped'>((resolve) => {
        this.settle = resolve
        element.onended = () => { resolve('ended') }
        element.onerror = () => { resolve('error') }
      })
      try {
        // HTMLMediaElement.play() predates promises; a host that returns
        // nothing has already started playback synchronously.
        await Promise.resolve(element.play())
      } catch (error: unknown) {
        if (generation === this.generation) this.fail(key, 'play', String(error))
        return
      }
      if (generation !== this.generation) return
      if (count > 1) this.resumeAt.set(key, index)
      this.publish({ activeMessageId: key, status: 'playing', truncated: part.truncated === true })
      pending = index + 1 < count ? this.load(key, index + 1) : Promise.resolve(undefined)
      pending.catch(() => {})
      const result = await outcome
      if (generation !== this.generation || result === 'stopped') return
      if (result === 'error') {
        const error = element.error
        this.fail(key, 'play', error === null ? 'media error' : `media error ${error.code}: ${error.message}`)
        return
      }
      index += 1
      if (index >= count) {
        this.resumeAt.delete(key)
        this.stop()
        return
      }
    }
  }

  /**
   * Publish the error state and report why it happened.
   *
   * Every failing arm goes through here so the reader's generic tooltip and
   * the Host log can never disagree about whether playback failed.
   *
   * @param key - the reading that failed.
   * @param stage - which step failed.
   * @param reason - the failure text.
   */
  private fail(key: string, stage: SpeechFailureStage, reason: string): void {
    this.report(key, stage, reason)
    this.release()
    this.publish({ activeMessageId: key, status: 'error', truncated: false })
  }

  /** Stop any active playback and release its resources. */
  stop(): void {
    this.release()
    this.publish(IDLE)
  }

  /** Release every resource; the player is unusable afterwards. */
  dispose(): void {
    this.stop()
    this.listeners.clear()
    this.resumeAt.clear()
  }

  private release(): void {
    this.generation += 1
    this.settle?.('stopped')
    this.settle = undefined
    if (this.audio !== undefined) {
      this.audio.onended = null
      this.audio.onerror = null
      this.audio.pause()
      this.audio = undefined
    }
    this.releaseUrl()
  }

  private releaseUrl(): void {
    if (this.objectUrl === undefined) return
    URL.revokeObjectURL(this.objectUrl)
    this.objectUrl = undefined
  }

  private publish(view: SpeechPlaybackView): void {
    if (view.activeMessageId === this.view.activeMessageId && view.status === this.view.status
      && view.truncated === this.view.truncated) return
    this.view = Object.freeze(view)
    for (const listener of this.listeners) listener()
  }
}
