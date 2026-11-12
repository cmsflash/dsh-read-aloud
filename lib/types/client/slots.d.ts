/**
 * The speech entries' injected faces. The target slots are declared and typed
 * by their owners ('conversation.chat.assistant-actions' by ui-conversation,
 * 'sidebar.right.tab.document.actions' by ui-sidebar-documentpreview); this
 * package only contributes entries, so no SlotMap merge lives here. Live playback state arrives through the `speech` hook
 * (the framework standard kit binds it into `useSpeech`); inject carries the
 * one verb.
 * @module @dsh-external/dsh-read-aloud/client/slots
 */
import type { HostObservable, InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots';
import type { MessageId } from '@deepseek-ai/dsh-client-connection/client';
import type { SpeechPlaybackView } from './player.ts';
/** Injected business face of one assistant-message read-aloud entry. */
export interface MessageSpeechInjected {
    hooks: {
        /** The owning Session's playback state, shared by every message control. */
        speech: HostObservable<SpeechPlaybackView>;
    };
    /**
     * Start reading one message aloud, or stop it when it is already playing.
     * Audio is normally already cached, so playback starts without a synthesis
     * round trip; a miss regenerates and is an ordinary outcome.
     * @param messageId - target assistant message.
     */
    toggle: (messageId: MessageId) => void;
}
/** Full props of one assistant-message read-aloud entry. */
export type MessageSpeechActionProps = PropsRuntime<'conversation.chat.assistant-actions'> & InjectFace<MessageSpeechInjected> & PropsLocale<'speech'>;
export interface FileSpeechInjected {
    hooks: {
        speech: HostObservable<SpeechPlaybackView>;
    };
    toggle: (absolutePath: string) => void;
}
export type FileSpeechActionProps = PropsRuntime<'sidebar.right.tab.document.actions'> & InjectFace<FileSpeechInjected> & PropsLocale<'speech'>;
