/** Wire vocabulary for the speech cache Remote. @module @dsh-external/dsh-read-aloud/cache-types */
import type { MessageId } from '@deepseek-ai/dsh-llm/brand';
import type { SessionId } from '@deepseek-ai/dsh-session/types';
/** Request for one message's spoken audio. */
export interface SpeechAudioRequest {
    /** Session owning the addressed message. */
    readonly sessionId: SessionId;
    /** The finalized assistant message to read aloud. */
    readonly messageId: MessageId;
}
/** Audio delivered to a browser, base64-encoded for JSON transport. */
export interface SpeechAudioValue {
    /** Base64 of the encoded audio bytes. */
    readonly data: string;
    /** Container format of the decoded bytes. */
    readonly mediaType: 'audio/mpeg';
    /** True when the audio was synthesized to answer this request. */
    readonly regenerated: boolean;
}
/** Successful audio reply. */
export interface SpeechAudioSuccess {
    readonly ok: true;
    readonly value: SpeechAudioValue;
}
/** Reasons audio cannot be produced for an addressed message. */
export type SpeechAudioFailureCode = 'session-not-found' | 'session-read-failed' | 'message-not-found' | 'synthesis-failed';
/** Failed audio reply. */
export interface SpeechAudioFailure {
    readonly ok: false;
    readonly code: SpeechAudioFailureCode;
    /** Diagnostic detail for a session read or synthesis failure. */
    readonly detail?: string;
}
/** Result of one audio request. */
export type SpeechAudioResult = SpeechAudioSuccess | SpeechAudioFailure;
export interface SpeechFileAudioRequest {
    readonly sessionId: SessionId;
    readonly path: string;
    readonly index: number;
}
export interface SpeechFileAudioValue extends SpeechAudioValue {
    readonly index: number;
    readonly count: number;
    readonly truncated: boolean;
}
export type SpeechFileAudioFailureCode = 'session-not-found'
/** The extension is not a speakable prose format, or the path is not absolute. */
 | 'file-unsupported' | 'file-not-found' | 'file-not-text'
/** One page of the file exceeds the workspace file service's byte cap. */
 | 'file-too-large' | 'file-empty'
/** The deployment mounts no workspace file service or the Session has no workspace root. */
 | 'file-read-unavailable' | 'file-read-failed' | 'segment-out-of-range' | 'synthesis-failed';
export interface SpeechFileAudioFailure {
    readonly ok: false;
    readonly code: SpeechFileAudioFailureCode;
    readonly detail?: string;
}
export type SpeechFileAudioResult = {
    readonly ok: true;
    readonly value: SpeechFileAudioValue;
} | SpeechFileAudioFailure;
/** Browser-side step that failed after the Host answered successfully. */
export type SpeechPlaybackStage = 
/** The channel call itself rejected, or returned an unreadable envelope. */
'request'
/** Base64 decoding or blob construction threw. */
 | 'decode'
/** `HTMLMediaElement.play()` rejected, or the element raised `error`. */
 | 'play';
/** One playback failure the browser reports back for logging. */
export interface SpeechPlaybackFailureReport {
    /** Session owning the addressed message. */
    readonly sessionId: SessionId;
    /** The message whose playback failed, or `file:<absolute path>` for a file reading. */
    readonly messageId: MessageId;
    /** Which browser-side step failed. */
    readonly stage: SpeechPlaybackStage;
    /** Failure text, already stringified by the browser half. */
    readonly reason: string;
}
