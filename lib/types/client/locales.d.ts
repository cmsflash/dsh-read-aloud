/** `speech` namespace dictionaries. */
/** Simplified Chinese dictionary (the key-set source of truth). */
export declare const zh: {
    'action.play': string;
    'action.stop': string;
    'action.loading': string;
    'error.generic': string;
};
/** The speech namespace key union. */
export type MessageSpeechKey = keyof typeof zh;
declare module '@deepseek-ai/dsh-client-ui-slots' {
    interface LocaleNamespaceMap {
        /** The per-message read-aloud control's copy. */
        speech: MessageSpeechKey;
    }
}
/** English dictionary, checked complete against the zh key set. */
export declare const en: {
    'action.play': string;
    'action.stop': string;
    'action.loading': string;
    'error.generic': string;
};
