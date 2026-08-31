/**
 * `@dsh-external/dsh-read-aloud`: read-aloud of assistant replies as one
 * installable bundle.
 *
 * Four Cordis roles ship together because they change together:
 * - `TtsRuntime` owns `ctx.tts`, the request/spec split, and provider selection.
 * - `OpenAiTtsProvider` registers one route per configured entry in that seam.
 * - `ReadAloudService` owns `ctx.readAloud`: the `turn/end` trigger and cache.
 * - the browser half plays it from the assistant-message action strip.
 *
 * Audio never enters the Session log: it is a regenerable cache keyed by
 * `messageId`, so replay and the Session format are untouched.
 * @module @dsh-external/dsh-read-aloud
 */
import type { Context } from '@deepseek-ai/cordis';
import z from '@deepseek-ai/schemastery';
export { TtsRuntime } from './tts.ts';
export { OpenAiTtsProvider, OPENAI_DEFAULT_BASE_URL } from './provider.ts';
export { ReadAloudService } from './service.ts';
export { CHANNEL } from './rpc.ts';
export type { SpeechAudio, SpeechProvider, SpeechRequest, SpeechSpec } from './tts-types.ts';
export type { SpeechAudioRequest, SpeechAudioResult, SpeechAudioValue } from './cache-types.ts';
/** Cordis plugin name used by loader diagnostics. */
export declare const name = "read-aloud";
/** Services this bundle needs from the Host. */
export declare const inject: string[];
/** One configured synthesis route. The map key is the provider id. */
export interface SpeechRouteConfig {
    /** Environment reference holding the key. Unset → route unavailable. */
    apiKeyEnv?: string;
    /** Literal key, for a deployment that uses no reference. */
    apiKey?: string;
    /** Route base; `/audio/speech` is appended. */
    baseURL?: string;
    /** Environment reference holding the base URL. */
    baseURLEnv?: string;
    /** Request deadline in milliseconds. */
    timeoutMs?: number;
}
/** Bundle config: synthesis policy, the route map, and cache retention. */
export interface Config {
    /** Provider-routed model identifier, for example `minimax/speech-2.6-hd`. */
    model: string;
    /** Voice passed to the provider; an OpenAI-shaped route rejects a request without one. */
    voice: string;
    /** Requested mp3 bitrate. Advisory: MiniMax honors it, OpenAI ignores it. */
    bitrate: number;
    /** Maximum characters per request; longer text is truncated rather than split. */
    maxChars: number;
    /** Explicit provider id. Omitted = auto-select when exactly one route is usable. */
    provider?: string;
    /** Routes to register, keyed by the provider id the seam selects by. */
    providers: Record<string, SpeechRouteConfig>;
    /** Days a synthesized artifact is served before it is swept. */
    ttlDays: number;
    /** Synthesize every completed turn as it ends. */
    synthesizeOnTurnEnd: boolean;
}
export declare const Config: z<Config>;
/**
 * Mount the seam, its routes, the cache, and the RPC channel.
 *
 * The seam mounts first because the provider and the cache both inject `tts`;
 * Cordis orders activation on that service edge rather than on this call order.
 *
 * @param ctx - Host context.
 * @param config - bundle config; absent route fields fall back to the environment.
 */
export declare function apply(ctx: Context, config: Config): void;
