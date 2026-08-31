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
/**
 * Per-Session playback controller.
 *
 * The snapshot identity is stable between changes, so a subscribing renderer
 * re-renders only when playback actually moves.
 */
export declare class SpeechPlayer {
    private readonly load;
    private view;
    private readonly listeners;
    private audio;
    private objectUrl;
    /** Distinguishes a settled load from one superseded by a later request. */
    private generation;
    constructor(load: SpeechAudioLoader);
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
    /** Stop any active playback and release its resources. */
    stop(): void;
    /** Release every resource; the player is unusable afterwards. */
    dispose(): void;
    private publish;
}
