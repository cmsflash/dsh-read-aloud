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

import type { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import { TtsRuntime } from './tts.ts'
import { OpenAiTtsProvider, OPENAI_DEFAULT_BASE_URL } from './provider.ts'
import { ReadAloudService } from './service.ts'
import { registerReadAloudRpc } from './rpc.ts'

export { TtsRuntime } from './tts.ts'
export { OpenAiTtsProvider, OPENAI_DEFAULT_BASE_URL } from './provider.ts'
export { ReadAloudService } from './service.ts'
export { CHANNEL } from './rpc.ts'
export type { SpeechAudio, SpeechProvider, SpeechRequest, SpeechSpec } from './tts-types.ts'
export type { SpeechAudioRequest, SpeechAudioResult, SpeechAudioValue } from './cache-types.ts'

/** Cordis plugin name used by loader diagnostics. */
export const name = 'read-aloud'

/** Services this bundle needs from the Host. */
export const inject = ['sessions', 'connection']

/** One configured synthesis route. The map key is the provider id. */
export interface SpeechRouteConfig {
  /** Environment reference holding the key. Unset → route unavailable. */
  apiKeyEnv?: string
  /** Literal key, for a deployment that uses no reference. */
  apiKey?: string
  /** Route base; `/audio/speech` is appended. */
  baseURL?: string
  /** Environment reference holding the base URL. */
  baseURLEnv?: string
  /** Request deadline in milliseconds. */
  timeoutMs?: number
}

/** Bundle config: synthesis policy, the route map, and cache retention. */
export interface Config {
  /** Provider-routed model identifier, for example `minimax/speech-2.6-hd`. */
  model: string
  /** Voice passed to the provider; an OpenAI-shaped route rejects a request without one. */
  voice: string
  /** Requested mp3 bitrate. Advisory: MiniMax honors it, OpenAI ignores it. */
  bitrate: number
  /** Maximum characters per request; longer text is truncated rather than split. */
  maxChars: number
  /** Explicit provider id. Omitted = auto-select when exactly one route is usable. */
  provider?: string
  /** Routes to register, keyed by the provider id the seam selects by. */
  providers: Record<string, SpeechRouteConfig>
  /** Days a synthesized artifact is served before it is swept. */
  ttlDays: number
  /** Synthesize every completed turn as it ends. */
  synthesizeOnTurnEnd: boolean
}

export const Config: z<Config> = z.object({
  model: z.string().required(),
  voice: z.string().required(),
  bitrate: z.number().step(1).min(1).required(),
  maxChars: z.number().step(1).min(1).required(),
  provider: z.string(),
  providers: z.dict(z.object({
    apiKeyEnv: z.string(),
    apiKey: z.string(),
    baseURL: z.string(),
    baseURLEnv: z.string(),
    timeoutMs: z.number().step(1).min(1),
  })).required(),
  ttlDays: z.number().step(1).min(1).required(),
  synthesizeOnTurnEnd: z.boolean().required(),
})

/** Default request deadline: synthesis of a long reply is slower than a chat turn. */
const DEFAULT_TIMEOUT_MS = 120_000

/**
 * Mount the seam, its routes, the cache, and the RPC channel.
 *
 * The seam mounts first because the provider and the cache both inject `tts`;
 * Cordis orders activation on that service edge rather than on this call order.
 *
 * @param ctx - Host context.
 * @param config - bundle config; absent route fields fall back to the environment.
 */
export function apply(ctx: Context, config: Config): void {
  ctx.plugin(TtsRuntime, {
    model: config.model,
    voice: config.voice,
    bitrate: config.bitrate,
    maxChars: config.maxChars,
    ...config.provider === undefined ? {} : { provider: config.provider },
  })

  // Route registration waits for both the seam and the credentials service:
  // the seam accepts providers, and a key reference is readable only once the
  // credentials service has started — reading it at plugin load races that
  // startup and registers routes with empty keys. The credentials service
  // layers the inherited environment above its managed store, so `apiKeyEnv`
  // covers both an exported variable and a stored key.
  // A credential read or a duplicate route id must not escape as an unhandled
  // rejection: the Host exits the process on one. Losing a route degrades to
  // synthesis reporting no usable provider, which playback surfaces as a
  // failed read rather than a dead server.
  ctx.inject(['tts', 'credentials'], async (scope: Context) => {
    try {
      const credentials = scope.get('credentials') as {
        resolve(ref: string): Promise<{ value?: string } | undefined>
      }
      const secret = async (ref: string | undefined): Promise<string | undefined> =>
        ref === undefined ? undefined : (await credentials.resolve(ref))?.value
      for (const [id, route] of Object.entries(config.providers)) {
        scope.tts.registerProvider(new OpenAiTtsProvider({
          id,
          apiKey: route.apiKey ?? await secret(route.apiKeyEnv) ?? '',
          baseURL: route.baseURL ?? await secret(route.baseURLEnv) ?? OPENAI_DEFAULT_BASE_URL,
          timeoutMs: route.timeoutMs ?? DEFAULT_TIMEOUT_MS,
        }))
      }
    } catch (error: unknown) {
      scope.logger.warn(`read-aloud: registering speech routes failed: ${String(error)}`)
    }
  })

  ctx.plugin(ReadAloudService, {
    ttlDays: config.ttlDays,
    synthesizeOnTurnEnd: config.synthesizeOnTurnEnd,
  })

  ctx.inject(['readAloud', 'connection'], (scoped: Context) => {
    scoped.effect(() => {
      const dispose = registerReadAloudRpc(scoped as never, scoped.readAloud)
      return () => void dispose()
    }, 'read-aloud: rpc channel')
  })
}
