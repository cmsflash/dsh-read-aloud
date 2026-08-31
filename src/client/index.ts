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
    readonly value?: { readonly data: string; readonly mediaType: string }
  }
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
      player = new SpeechPlayer(async (messageId: string) => {
        const reply: AudioReply = await ctx.connection.rpc.call(CHANNEL, 'audio', { sessionId, messageId })
        // Two envelopes: the channel's own ok, then the cache's audio result.
        if (reply.ok !== true || reply.value?.ok !== true || reply.value.value === undefined) return undefined
        return { data: reply.value.value.data, mediaType: reply.value.value.mediaType }
      })
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
