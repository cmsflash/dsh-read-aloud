/**
 * Filesystem store for synthesized audio: a regenerable cache keyed by message
 * identity, swept by age. Nothing here is durable Session state — a miss is an
 * ordinary outcome that the caller resolves by synthesizing again.
 * @module @dsh-external/dsh-read-aloud/store
 */
import type { MessageId } from '@deepseek-ai/dsh-llm/brand';
/** Audio bytes retrieved from the cache. */
export interface CachedAudio {
    /** Encoded audio bytes. */
    readonly data: Uint8Array;
    /** Container format of {@link CachedAudio.data}. */
    readonly mediaType: 'audio/mpeg';
}
/**
 * Age-swept audio cache over one directory.
 *
 * A message id is opaque and may not be filesystem-safe, so every key is
 * percent-encoded before it becomes a file name.
 */
export declare class ReadAloudStore {
    private readonly directory;
    private readonly ttlMs;
    constructor(directory: string, ttlMs: number);
    /** Resolve one message id to its artifact path. */
    private pathFor;
    /**
     * Read one cached artifact.
     * @param messageId - the message whose audio is wanted.
     * @returns the audio, or `undefined` on a miss or an expired entry.
     */
    read(messageId: MessageId): Promise<CachedAudio | undefined>;
    /**
     * Publish one artifact atomically, so a concurrent read never observes a
     * partially written file.
     * @param messageId - the message the audio belongs to.
     * @param data - encoded audio bytes.
     */
    write(messageId: MessageId, data: Uint8Array): Promise<void>;
    /**
     * Delete every artifact older than the retention window.
     * @returns the number of files removed.
     */
    sweep(): Promise<number>;
}
