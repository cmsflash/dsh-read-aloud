/**
 * Loopback-only Host RPC adapter for the read-aloud Web client.
 *
 * An external plugin cannot join `@deepseek-ai/dsh-api-remotes`, whose generated
 * Remote imports are a fixed in-repo list, so this channel replaces the Typert
 * Remote with a hand-validated JSON route. The endpoint set stays deliberately
 * narrow: identity in, audio out.
 * @module @dsh-external/dsh-read-aloud/rpc
 */

import type { ReadAloudService } from './service.ts'
import type { SpeechAudioResult, SpeechPlaybackStage } from './cache-types.ts'

/** Channel the browser half calls; one route per plugin. */
export const CHANNEL = '/dsh-read-aloud'

interface RpcContext {
  readonly connection: {
    readonly rpc: {
      handle(
        channel: string,
        handler: (endpoint: string, payload: unknown, signal: AbortSignal) => Promise<unknown>,
        options: { readonly authority: 'loopback' | 'trusted-host' },
      ): () => Promise<void>
    }
  }
}

/** Reject a non-object payload before any field is read. */
function record(value: unknown, label: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error(`${label} must be an object`)
  }
  return value as Record<string, unknown>
}

/** Reject a blank or non-string id; both ids are opaque to this adapter. */
function id(value: unknown, label: string): string {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error(`${label} must be a non-empty string`)
  }
  return value
}

/** The stages a browser may report; anything else is a malformed payload. */
const STAGES: readonly SpeechPlaybackStage[] = ['request', 'decode', 'play']

/** Reject a stage outside the declared set, so the log cannot carry free text. */
function stage(value: unknown): SpeechPlaybackStage {
  if (!STAGES.includes(value as SpeechPlaybackStage)) {
    throw new Error(`stage must be one of ${STAGES.join(', ')}`)
  }
  return value as SpeechPlaybackStage
}

/**
 * Register the read-aloud RPC channel.
 *
 * Trusted-host authority, the same grant `/api` applies. The audio route
 * speaks Session prose that `session.history` already returns verbatim to any
 * caller passing that fence, so pinning this channel to loopback withheld no
 * secret — it only made the play control dead on every non-loopback client
 * (phones and tablets reaching the deployment over Tailscale), because the
 * `playback-failed` route was refused by the same fence and the failure went
 * unlogged.
 *
 * The narrower grant belongs to the configuration plane, which `/api` pins to
 * loopback by method. Reading a reply aloud is not part of it.
 *
 * @param ctx - Host context carrying `connection.rpc`.
 * @param service - the cache service answering the audio request.
 * @returns the disposer that unregisters the channel.
 */
export function registerReadAloudRpc(ctx: RpcContext, service: ReadAloudService): () => Promise<void> {
  return ctx.connection.rpc.handle(CHANNEL, async (endpoint, rawPayload, signal) => {
    if (signal.aborted) throw new Error('The request was cancelled.')
    const payload = record(rawPayload, 'payload')
    switch (endpoint) {
      case 'audio': {
        const result: SpeechAudioResult = await service.audio({
          sessionId: id(payload.sessionId, 'sessionId'),
          messageId: id(payload.messageId, 'messageId'),
        })
        // The browser unwraps one envelope, so the cache's own ok/code result
        // rides inside rather than being flattened into it.
        return { ok: true, value: result }
      }
      case 'playback-failed': {
        service.reportPlaybackFailure({
          sessionId: id(payload.sessionId, 'sessionId'),
          messageId: id(payload.messageId, 'messageId'),
          stage: stage(payload.stage),
          reason: id(payload.reason, 'reason'),
        })
        return { ok: true, value: undefined }
      }
      default:
        throw new Error(`unknown read-aloud endpoint: ${endpoint}`)
    }
  }, { authority: 'trusted-host' })
}
