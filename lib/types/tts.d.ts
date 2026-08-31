/**
 * Service Definition for the speech synthesis capability seam (`ctx.tts`):
 * a provider registry plus provider-selecting execution. Deployment policy —
 * model, bitrate, voice, and the input bound — is applied by an explicit
 * `resolve(request): SpeechSpec` step, so no provider hides a default inside
 * `synthesize()`. Duplicate ids are rejected. At execution time a configured
 * provider must exist and be usable; without one, exactly one usable provider
 * is required, so selection never depends on registration order.
 * @module @dsh-external/dsh-read-aloud/tts
 */
import { Service, type Context } from '@deepseek-ai/cordis';
import z from '@deepseek-ai/schemastery';
import type { SpeechAudio, SpeechProvider, SpeechRequest, SpeechSpec } from './tts-types.ts';
export { SpeechError } from './tts-types.ts';
export type { SpeechAudio, SpeechErrorCode, SpeechMediaType, SpeechProvider, SpeechRequest, SpeechSpec, } from './tts-types.ts';
declare module '@deepseek-ai/cordis' {
    interface Context {
        tts: TtsRuntime;
    }
}
/**
 * Required deployment policy for the speech seam. Every field is required with
 * no library default: model choice, audio weight, and the input bound all vary
 * by deployment and each carries a cost, so none may be inherited silently.
 */
export interface TtsRuntimeConfig {
    /** Provider-routed model identifier, for example `minimax/speech-2.6-hd`. */
    readonly model: string;
    /**
     * Requested mp3 bitrate in bits per second. Billing is by input characters,
     * so this trades stored bytes against audio quality and nothing else.
     *
     * Advisory rather than guaranteed: it reaches the vendor as `extra_body`,
     * which MiniMax honors and OpenAI's own models ignore.
     */
    readonly bitrate: number;
    /**
     * Maximum characters sent in one request. Longer text is truncated rather
     * than split, because a partial reading is a better failure than an
     * unbounded bill.
     */
    readonly maxChars: number;
    /** Explicit provider id. Omitted = auto-select when exactly one is usable. */
    readonly provider?: string;
    /**
     * Voice passed to the provider when a request names none. Required with no
     * library default: an OpenAI-shaped route rejects a request carrying no
     * voice, and the vocabulary is vendor-specific, so no value is portable
     * enough to inherit silently.
     */
    readonly voice: string;
}
/**
 * The speech synthesis service, registered as `ctx.tts`.
 *
 * Selection semantics (resolved at execution time, never order-dependent):
 * - A configured id that is registered and `available()` → that provider.
 * - A configured id not registered → `SPEECH_PROVIDER_CONFIGURED_MISSING`.
 * - A configured id registered but unavailable →
 *   `SPEECH_PROVIDER_CONFIGURED_UNAVAILABLE`.
 * - No id configured, exactly one registered usable provider → that provider.
 * - No id configured, multiple usable providers → `SPEECH_PROVIDER_AMBIGUOUS`.
 * - No id configured, no usable provider → `SPEECH_PROVIDER_UNAVAILABLE`.
 */
export declare class TtsRuntime extends Service {
    static Config: z<TtsRuntimeConfig>;
    private readonly providers;
    private readonly config;
    constructor(ctx: Context, config: TtsRuntimeConfig);
    /**
     * Register a synthesis provider.
     * @param provider - the provider; its `id` is the registry key.
     * @returns the disposer that unregisters the provider.
     * @throws {@link SpeechError} `SPEECH_DUPLICATE_PROVIDER` when the id is taken.
     */
    registerProvider(provider: SpeechProvider): () => void;
    /**
     * Apply deployment policy to one request. This is the only place defaults are
     * filled, so a provider always receives a complete spec.
     * @param request - the caller's text and optional voice.
     * @returns the resolved spec, with `truncated` set when text exceeded `maxChars`.
     * @throws {@link SpeechError} `SPEECH_EMPTY_TEXT` when the text is blank.
     */
    resolve(request: SpeechRequest): SpeechSpec;
    /**
     * Resolve one request and synthesize it through the selected provider.
     *
     * Policy and selection failures surface as rejections rather than synchronous
     * throws, so one `catch` covers every way synthesis can fail.
     *
     * @param request - the caller's text and optional voice.
     * @param signal - optional cancellation forwarded to the provider.
     * @returns the encoded audio and any usage the backend reported.
     * @throws {@link SpeechError} when no provider can run or the backend fails.
     */
    synthesize(request: SpeechRequest, signal?: AbortSignal): Promise<SpeechAudio>;
    /** Resolve the selected provider or throw the matching {@link SpeechError}. */
    private selectProvider;
}
export default TtsRuntime;
