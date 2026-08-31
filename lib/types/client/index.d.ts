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
export type { MessageSpeechActionProps, MessageSpeechInjected } from './slots.ts';
export type { SpeechPlaybackStatus, SpeechPlaybackView } from './player.ts';
export type { MessageSpeechKey } from './locales.ts';
/** Required services: the slot registry, the RPC transport, and the copy. */
export declare const inject: string[];
/**
 * Client plugin body: the per-message read-aloud entry and its per-session
 * playback layer.
 * @param ctx - client root context.
 */
export declare function apply(ctx: any): void;
