/**
 * Selection of the prose a completed turn should read aloud.
 * @module @dsh-external/dsh-read-aloud/text
 */
import type { SessionEvent } from '@deepseek-ai/dsh-session/types';
import type { MessageId } from '@deepseek-ai/dsh-llm/brand';
/** One turn's closing assistant message: its identity and its spoken prose. */
export interface SpokenMessage {
    /** Stable identity of the finalized model output. */
    readonly messageId: MessageId;
    /** Concatenated `text` block content, with no reasoning or tool arguments. */
    readonly text: string;
}
/**
 * Concatenate the speakable prose of one assistant message.
 *
 * `reasoning` blocks are thinking traces rather than prose addressed to the
 * reader, and `tool-call` blocks carry arguments; neither is spoken.
 *
 * @param content - the assistant message's content blocks.
 * @returns the concatenated text, empty when the message carries no text block.
 */
export declare function spokenText(content: readonly {
    readonly type: string;
    readonly text?: string;
}[]): string;
/**
 * Find the closing assistant message of one turn.
 *
 * The turn's last `assistant/message` is its closing step: earlier steps of a
 * multi-step turn end in tool calls rather than a reply to the reader.
 *
 * @param events - the session's events, in log order.
 * @param turn - the turn whose closing message is wanted.
 * @returns the closing message, or `undefined` when the turn finalized no
 *   message or that message carries no spoken prose.
 */
export declare function closingMessageOf(events: readonly SessionEvent[], turn: number): SpokenMessage | undefined;
/**
 * Recover one finalized assistant message's spoken prose from the log.
 *
 * Only a turn's closing message is readable: an earlier message in the same
 * turn is superseded prose the reader never saw as the reply.
 *
 * @param events - the Session's event log.
 * @param messageId - the addressed assistant message.
 * @returns the spoken prose, or `undefined` when the message is absent or is
 *   not its turn's closing message.
 */
export declare function spokenTextOf(events: readonly SessionEvent[], messageId: string): string | undefined;
