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
import type { SpeechAudioResult } from './cache-types.ts'

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

/**
 * Register the read-aloud RPC channel.
 *
 * Loopback authority only: the audio route reads Session prose, so a
 * trusted-host caller must not reach it.
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
      default:
        throw new Error(`unknown read-aloud endpoint: ${endpoint}`)
    }
  }, { authority: 'loopback' })
}
