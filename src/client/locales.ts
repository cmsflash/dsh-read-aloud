/** `speech` namespace dictionaries. */

/** Simplified Chinese dictionary (the key-set source of truth). */
export const zh = {
  'action.play': '朗读回答',
  'action.stop': '停止朗读',
  'action.loading': '正在准备语音…',
  'error.generic': '语音播放失败',
  'file.play': '朗读文件',
  'file.stopTruncated': '停止朗读（文件较长，仅朗读开头部分）',
} satisfies Record<string, string>

/** The speech namespace key union. */
export type MessageSpeechKey = keyof typeof zh

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** The read-aloud controls' copy. */
    speech: MessageSpeechKey
  }
}

/** English dictionary, checked complete against the zh key set. */
export const en = {
  'action.play': 'Read aloud',
  'action.stop': 'Stop reading',
  'action.loading': 'Preparing audio…',
  'error.generic': 'Could not play audio',
  'file.play': 'Read file aloud',
  'file.stopTruncated': 'Stop reading (long file: only the beginning is read)',
} satisfies Record<MessageSpeechKey, string>
