/**
 * Per-message read-aloud control: one button in the assistant message's
 * IconActions row that plays the audio synthesized when the turn ended.
 * @module @dsh-external/dsh-read-aloud/client/MessageSpeechAction
 */
import type { MessageSpeechActionProps } from './slots.ts';
/**
 * One message's read-aloud button.
 * @param props - the owner's message identity, the injected verb, and the
 * shared playback hook.
 * @returns the play/stop control.
 */
export declare function MessageSpeechAction({ messageId, toggle, useSpeech, t }: MessageSpeechActionProps): import("react").JSX.Element;
