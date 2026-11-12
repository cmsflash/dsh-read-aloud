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
export type { FileSpeechActionProps, FileSpeechInjected, MessageSpeechActionProps, MessageSpeechInjected, } from './slots.ts';
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
