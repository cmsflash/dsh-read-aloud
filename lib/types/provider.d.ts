/**
 * `OpenAiTtsProvider`: a {@link SpeechProvider} over any
 * `POST /audio/speech` route that speaks the OpenAI audio schema. One class
 * serves OpenAI itself and a gateway in front of other vendors, because the
 * request and reply are identical across them; a route differs only by base
 * URL and credential.
 *
 * A gateway owns the vendor call, so a MiniMax route reaches its native
 * `/v1/t2a_v2` endpoint through the gateway's adapter rather than through an
 * OpenAI base-URL override.
 * @module @dsh-external/dsh-read-aloud/provider
 */
import type { SpeechAudio, SpeechProvider, SpeechSpec } from './tts-types.ts';
/** OpenAI's public audio API; the default base for a route that names none. */
export declare const OPENAI_DEFAULT_BASE_URL = "https://api.openai.com/v1";
/** Resolved options for one route; the plugin's `apply` supplies every default. */
export interface OpenAiTtsProviderOptions {
    /** Registry id this route registers under, for example `litellm` or `openai`. */
    readonly id: string;
    /** Route API key. Empty makes the provider unavailable. */
    readonly apiKey: string;
    /** Route base URL; `/audio/speech` is appended. */
    readonly baseURL: string;
    /** Request deadline in milliseconds. */
    readonly timeoutMs: number;
}
/**
 * Synthesis over one OpenAI-compatible speech route.
 *
 * `bitrate` rides `extra_body`, which a gateway forwards to the vendor
 * verbatim: the OpenAI speech schema has no bitrate field, and MiniMax reads it
 * from `audio_setting`. A vendor without that field ignores it — OpenAI's own
 * models return the same 128 kbps mp3 either way — so the request stays valid
 * on every route while only some honor it.
 */
export declare class OpenAiTtsProvider implements SpeechProvider {
    private readonly options;
    readonly id: string;
    constructor(options: OpenAiTtsProviderOptions);
    /**
     * Whether a route credential is present.
     * @returns true when the route holds a non-empty API key.
     */
    available(): boolean;
    /**
     * Synthesize one resolved spec through this route.
     * @param spec - the seam-resolved request.
     * @param signal - optional cancellation forwarded to the route.
     * @returns the encoded audio; usage fields stay absent because the
     *   OpenAI-shaped response body carries audio bytes and no usage envelope.
     * @throws {@link SpeechError} `SPEECH_REQUEST_FAILED` on a non-2xx reply,
     *   an empty body, or a transport failure.
     */
    synthesize(spec: SpeechSpec, signal?: AbortSignal): Promise<SpeechAudio>;
}
