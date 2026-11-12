/**
 * Browser-side audio playback for one Session. One player per Session enforces
 * the single-stream rule: starting a reading stops whatever was playing. A
 * reading is one or more parts played in order through one audio element; an
 * assistant reply is a single part, a file is as many as the Host cut it into.
 * @module @dsh-external/dsh-read-aloud/client/player
 */
/** What a caller observes about one reading's playback. */
export type SpeechPlaybackStatus = 'idle' | 'loading' | 'playing' | 'error';
/** One Session's playback state, shared by every control in it. */
export interface SpeechPlaybackView {
    /** Key of the reading currently loading or playing: a message id, or `file:<absolute path>`. */
    readonly activeMessageId: string | undefined;
    /** Status of {@link SpeechPlaybackView.activeMessageId}. */
    readonly status: SpeechPlaybackStatus;
    readonly truncated: boolean;
}
export interface SpeechAudioPart {
    readonly data: string;
    readonly mediaType: string;
    readonly count?: number;
    readonly truncated?: boolean;
}
/**
 * Fetches one part of a reading. Resolves `undefined` when the reading has no
 * such part (its source shrank since the last request); rejects on any failure.
 */
export type SpeechAudioLoader = (key: string, index: number) => Promise<SpeechAudioPart | undefined>;
/** Browser-side step that failed; mirrors the Host's `SpeechPlaybackStage`. */
export type SpeechFailureStage = 'request' | 'decode' | 'play';
/** Reports one playback failure for logging; never rejects. */
export type SpeechFailureReporter = (key: string, stage: SpeechFailureStage, reason: string) => void;
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
    /** Distinguishes the current reading from one superseded by a later request. */
    private generation;
    private settle;
    private readonly resumeAt;
    /**
     * @param load - fetches one part of a reading.
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
     * Start one reading, or stop it when it is already active. A multi-part
     * reading stopped midway starts again at the part it was playing.
     * @param key - the reading: a message id, or `file:<absolute path>`.
     * @returns once the reading ended, failed, or was superseded.
     */
    toggle(key: string): Promise<void>;
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
    private fail;
    /** Stop any active playback and release its resources. */
    stop(): void;
    /** Release every resource; the player is unusable afterwards. */
    dispose(): void;
    private release;
    private releaseUrl;
    private publish;
}
