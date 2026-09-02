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
import { Context, Service } from '@deepseek-ai/cordis';
import type { SpeechAudioRequest, SpeechAudioResult } from './cache-types.ts';
declare module '@deepseek-ai/cordis' {
    interface Context {
        readAloud: ReadAloudService;
    }
}
/** Required deployment policy for cached read-aloud audio. */
export interface Config {
    /** Days a synthesized artifact is served before it is swept. */
    readonly ttlDays: number;
    /**
     * Synthesize every completed turn as it ends. False leaves synthesis to the
     * first playback request, trading latency for spend on turns nobody plays.
     */
    readonly synthesizeOnTurnEnd: boolean;
}
/**
 * Cached read-aloud audio for finalized assistant messages.
 *
 * The Host resolves spoken text from the Session log by `messageId`, so a
 * browser sends identity rather than prose and no conversation surface has to
 * carry the text.
 */
export declare class ReadAloudService extends Service {
    static inject: string[];
    private readonly store;
    private readonly synthesizeOnTurnEnd;
    /** In-flight synthesis per message, so a turn-end job and a play request share one call. */
    private readonly inFlight;
    /**
     * @param ctx - Host context carrying the Session store and the tts seam.
     * @param config - Required retention and trigger policy.
     */
    constructor(ctx: Context, config: Config);
    /** Sweep expired artifacts once at startup, then follow completed turns. */
    protected [Service.init](): void;
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
    private detach;
    /**
     * Read one message's audio, synthesizing it when the cache does not hold it.
     * @param request - the Session and message to read aloud.
     * @returns base64 audio, or an explicit failure.
     */
    audio(request: SpeechAudioRequest): Promise<SpeechAudioResult>;
    /**
     * The events a read request may address.
     *
     * A session running in this process is authoritative — it can hold events
     * not yet durable. Every other session the UI can list is historical: the
     * live store reports it absent, so the durable log is the only readable
     * copy. Reading it there is what makes the play control work on threads the
     * server did not itself run.
     *
     * @param sessionId - the session whose events are wanted.
     * @returns the events, or `undefined` when neither source holds the session.
     */
    private eventsOf;
    /**
     * Synthesize and cache one message's audio, joining any in-flight call for
     * the same message so a turn-end job and a playback request never bill twice.
     * @param messageId - the message the audio belongs to.
     * @param text - the prose to speak.
     * @returns the synthesized audio bytes.
     */
    private ensureAudio;
    private synthesizeAndStore;
}
