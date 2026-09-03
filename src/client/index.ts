/**
 * Read-aloud plugin, browser half: the play/stop entry in the
 * conversation.chat.assistant-actions strip. One SpeechPlayer per Session backs
 * every message control in that Session, so starting one reply stops whatever
 * was playing.
 *
 * Audio is fetched over the plugin's own RPC channel. The Host resolves the
 * spoken text from its own Session log, so this half sends message identity and
 * never prose.
 * @module @dsh-external/dsh-read-aloud/client
 */

import { MessageSpeechAction } from './MessageSpeechAction.tsx'
import { SpeechPlayer } from './player.ts'
import type { MessageSpeechInjected } from './slots.ts'
import { en, zh } from './locales.ts'

export type { MessageSpeechActionProps, MessageSpeechInjected } from './slots.ts'
export type { SpeechPlaybackStatus, SpeechPlaybackView } from './player.ts'
export type { MessageSpeechKey } from './locales.ts'

/** Dictionary namespace owned by this plugin. */
const NS = 'speech'

/** Channel the Host half registers; must match `rpc.ts`. */
const CHANNEL = '/dsh-read-aloud'

/** Required services: the slot registry, the RPC transport, and the copy. */
export const inject = ['slots', 'connection', 'locale']

interface AudioReply {
  readonly ok: boolean
  readonly value?: {
    readonly ok: boolean
    readonly code?: string
    readonly detail?: string
    readonly value?: { readonly data: string; readonly mediaType: string }
  }
}

/**
 * Describe a reply that carried no audio.
 *
 * The Host answers a refusal with a code inside a successful envelope, so
 * without this the reason is discarded and only the generic tooltip remains.
 *
 * @param reply - the reply that carried no audio.
 * @returns the reason, for the Host log.
 */
function refusalOf(reply: AudioReply): string {
  if (reply.ok !== true) return 'the read-aloud channel rejected the request'
  const result = reply.value
  if (result === undefined) return 'the channel returned no result'
  if (result.ok === true) return 'the host reported success but sent no audio'
  const code = result.code ?? 'unknown'
  return result.detail === undefined ? `host refused: ${code}` : `host refused: ${code}: ${result.detail}`
}

/**
 * Client plugin body: the per-message read-aloud entry and its per-session
 * playback layer.
 * @param ctx - client root context.
 */
export function apply(ctx: any): void {
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'read-aloud: dictionaries')

  const players = new Map<string, SpeechPlayer>()
  const playerFor = (sessionId: string): SpeechPlayer => {
    let player = players.get(sessionId)
    if (player === undefined) {
      const report = (messageId: string, stage: string, reason: string): void => {
        // A failed report must not mask the playback failure that triggered it.
        void Promise.resolve(
          ctx.connection.rpc.call(CHANNEL, 'playback-failed', { sessionId, messageId, stage, reason }),
        ).catch(() => {})
      }
      player = new SpeechPlayer(async (messageId: string) => {
        const reply: AudioReply = await ctx.connection.rpc.call(CHANNEL, 'audio', { sessionId, messageId })
        // Two envelopes: the channel's own ok, then the cache's audio result.
        // A refusal throws rather than resolving undefined, so the player's own
        // failure path carries the Host's reason instead of a generic message.
        if (reply.ok !== true || reply.value?.ok !== true || reply.value.value === undefined) {
          throw new Error(refusalOf(reply))
        }
        return { data: reply.value.value.data, mediaType: reply.value.value.mediaType }
      }, report)
      players.set(sessionId, player)
    }
    return player
  }

  // A dropped connection cannot be recovered mid-stream, and audio outliving
  // its transport would keep speaking into a disconnected UI.
  ctx.on('connection/reset', () => {
    for (const player of players.values()) player.stop()
  })

  ctx.slots.inject('conversation.chat.assistant-actions', () => {
    const dispose = ctx.slots.register({
      name: 'conversation.chat.assistant-actions',
      id: 'speech',
      order: 20,
      locale: NS,
      inject: (sessionId: string): MessageSpeechInjected => {
        const player = playerFor(sessionId)
        return {
          hooks: { speech: player },
          toggle: (messageId: string) => { void player.toggle(messageId) },
        }
      },
    }, MessageSpeechAction)
    return () => {
      dispose()
      for (const player of players.values()) player.dispose()
      players.clear()
    }
  })
}
