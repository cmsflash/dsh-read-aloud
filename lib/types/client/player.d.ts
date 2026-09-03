/**
 * Browser-side audio playback for one Session's assistant messages. One player
 * per Session enforces the single-stream rule: starting a message stops
 * whatever was playing, so two replies never overlap.
 * @module @dsh-external/dsh-read-aloud/client/player
 */
import type { MessageId } from '@deepseek-ai/dsh-client-connection/client';
/** What a caller observes about one message's playback. */
export type SpeechPlaybackStatus = 'idle' | 'loading' | 'playing' | 'error';
/** One Session's playback state, shared by every message control in it. */
export interface SpeechPlaybackView {
    /** The message currently loading or playing, when any. */
    readonly activeMessageId: MessageId | undefined;
    /** Status of {@link SpeechPlaybackView.activeMessageId}. */
    readonly status: SpeechPlaybackStatus;
}
/** Fetches one message's audio; resolves `undefined` when it cannot be produced. */
export type SpeechAudioLoader = (messageId: MessageId) => Promise<{
    data: string;
    mediaType: string;
} | undefined>;
/** Browser-side step that failed; mirrors the Host's `SpeechPlaybackStage`. */
export type SpeechFailureStage = 'request' | 'decode' | 'play';
/** Reports one playback failure for logging; never rejects. */
export type SpeechFailureReporter = (messageId: MessageId, stage: SpeechFailureStage, reason: string) => void;
/**
 * Per-Session playback controller.
 *
 * The snapshot identity is stable between changes, so a subscribing renderer
 * re-renders only when playback actually moves.
 */
export declare class SpeechPlayer {
    private readonly load;
    private readonly report;
    private view;
    private readonly listeners;
    private audio;
    private objectUrl;
    /** Distinguishes a settled load from one superseded by a later request. */
    private generation;
    /**
     * @param load - fetches one message's audio.
     * @param report - records a failure for the Host log.
     */
    constructor(load: SpeechAudioLoader, report: SpeechFailureReporter);
    /**
     * Subscribe to playback changes.
     * @param listener - called after every state change.
     * @returns the unsubscribe function.
     */
    subscribe: (listener: () => void) => (() => void);
    /**
     * Read the current playback state.
     * @returns the snapshot, stable by reference until playback moves.
     */
    getSnapshot: () => SpeechPlaybackView;
    /**
     * Start reading one message aloud, or stop it when it is already active.
     * @param messageId - the message to read.
     */
    toggle(messageId: MessageId): Promise<void>;
    /**
     * Publish the error state and report why it happened.
     *
     * Every failing arm goes through here so the reader's generic tooltip and
     * the Host log can never disagree about whether playback failed.
     *
     * @param messageId - the message that failed.
     * @param stage - which step failed.
     * @param reason - the failure text.
     */
    private fail;
    /** Stop any active playback and release its resources. */
    stop(): void;
    /** Release every resource; the player is unusable afterwards. */
    dispose(): void;
    private publish;
}
