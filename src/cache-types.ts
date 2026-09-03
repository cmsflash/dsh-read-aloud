/** Wire vocabulary for the speech cache Remote. @module @dsh-external/dsh-read-aloud/cache-types */

import type { MessageId } from '@deepseek-ai/dsh-llm/brand'
import type { SessionId } from '@deepseek-ai/dsh-session/types'

/** Request for one message's spoken audio. */
export interface SpeechAudioRequest {
  /** Session owning the addressed message. */
  readonly sessionId: SessionId
  /** The finalized assistant message to read aloud. */
  readonly messageId: MessageId
}

/** Audio delivered to a browser, base64-encoded for JSON transport. */
export interface SpeechAudioValue {
  /** Base64 of the encoded audio bytes. */
  readonly data: string
  /** Container format of the decoded bytes. */
  readonly mediaType: 'audio/mpeg'
  /** True when the audio was synthesized to answer this request. */
  readonly regenerated: boolean
}

/** Successful audio reply. */
export interface SpeechAudioSuccess {
  readonly ok: true
  readonly value: SpeechAudioValue
}

/** Reasons audio cannot be produced for an addressed message. */
export type SpeechAudioFailureCode =
  | 'session-not-found'
  | 'message-not-found'
  | 'synthesis-failed'

/** Failed audio reply. */
export interface SpeechAudioFailure {
  readonly ok: false
  readonly code: SpeechAudioFailureCode
  /** Provider or capability detail, present only for `synthesis-failed`. */
  readonly detail?: string
}

/** Result of one audio request. */
export type SpeechAudioResult = SpeechAudioSuccess | SpeechAudioFailure

/** Browser-side step that failed after the Host answered successfully. */
export type SpeechPlaybackStage =
  /** The channel call itself rejected, or returned an unreadable envelope. */
  | 'request'
  /** Base64 decoding or blob construction threw. */
  | 'decode'
  /** `HTMLMediaElement.play()` rejected, or the element raised `error`. */
  | 'play'

/** One playback failure the browser reports back for logging. */
export interface SpeechPlaybackFailureReport {
  /** Session owning the addressed message. */
  readonly sessionId: SessionId
  /** The message whose playback failed. */
  readonly messageId: MessageId
  /** Which browser-side step failed. */
  readonly stage: SpeechPlaybackStage
  /** Failure text, already stringified by the browser half. */
  readonly reason: string
}
