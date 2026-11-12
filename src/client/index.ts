/**
 * Read-aloud plugin, browser half: the play/stop entry in the
 * conversation.chat.assistant-actions strip and the one in the document
 * preview's header. One SpeechPlayer per Session backs every control in that
 * Session, and starting a reading stops every other player, so only one
 * reading is ever audible.
 *
 * Audio is fetched over the plugin's own RPC channel. The Host resolves the
 * spoken text from its own Session log or reads the file itself, so this half
 * sends message identity or a file path and never prose.
 * @module @dsh-external/dsh-read-aloud/client
 */

import { FILE_KEY_PREFIX, FileSpeechAction } from './FileSpeechAction.tsx'
import { MessageSpeechAction } from './MessageSpeechAction.tsx'
import { SpeechPlayer } from './player.ts'
import type { SpeechAudioPart } from './player.ts'
import type { FileSpeechInjected, MessageSpeechInjected } from './slots.ts'
import { en, zh } from './locales.ts'

export type {
  FileSpeechActionProps, FileSpeechInjected, MessageSpeechActionProps, MessageSpeechInjected,
} from './slots.ts'
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
    readonly value?: {
      readonly data: string
      readonly mediaType: string
      readonly count?: number
      readonly truncated?: boolean
    }
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
      player = new SpeechPlayer(async (key: string, index: number): Promise<SpeechAudioPart | undefined> => {
        const file = key.startsWith(FILE_KEY_PREFIX)
        const reply: AudioReply = file
          ? await ctx.connection.rpc.call(CHANNEL, 'file-audio', { sessionId, path: key.slice(FILE_KEY_PREFIX.length), index })
          : await ctx.connection.rpc.call(CHANNEL, 'audio', { sessionId, messageId: key })
        // The file changed under a reading and no longer has this part.
        if (file && reply.ok === true && reply.value?.ok === false && reply.value.code === 'segment-out-of-range') {
          return undefined
        }
        // Two envelopes: the channel's own ok, then the cache's audio result.
        // A refusal throws rather than resolving undefined, so the player's own
        // failure path carries the Host's reason instead of a generic message.
        if (reply.ok !== true || reply.value?.ok !== true || reply.value.value === undefined) {
          throw new Error(refusalOf(reply))
        }
        const { data, mediaType, count, truncated } = reply.value.value
        return {
          data, mediaType,
          ...count === undefined ? {} : { count },
          ...truncated === undefined ? {} : { truncated },
        }
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

  // Players are per Session, so two Sessions could otherwise speak at once.
  const toggle = (sessionId: string, key: string): void => {
    const player = playerFor(sessionId)
    for (const other of players.values()) {
      if (other !== player) other.stop()
    }
    void player.toggle(key)
  }

  ctx.effect(() => () => {
    for (const player of players.values()) player.dispose()
    players.clear()
  }, 'read-aloud: players')

  ctx.slots.inject('conversation.chat.assistant-actions', () => ctx.slots.register({
    name: 'conversation.chat.assistant-actions',
    id: 'speech',
    order: 20,
    locale: NS,
    inject: (sessionId: string): MessageSpeechInjected => ({
      hooks: { speech: playerFor(sessionId) },
      toggle: (messageId: string) => { toggle(sessionId, messageId) },
    }),
  }, MessageSpeechAction))

  ctx.slots.inject('sidebar.right.tab.document.actions', () => ctx.slots.register({
    name: 'sidebar.right.tab.document.actions',
    id: 'speech',
    order: -10,
    locale: NS,
    inject: (sessionId: string): FileSpeechInjected => ({
      hooks: { speech: playerFor(sessionId) },
      toggle: (absolutePath: string) => { toggle(sessionId, `${FILE_KEY_PREFIX}${absolutePath}`) },
    }),
  }, FileSpeechAction))
}
