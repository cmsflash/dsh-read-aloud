import { useCallback } from 'react'
import {
  IconLoadingOutlineRegular, IconPlayOutlineRegular, IconStopFillRegular, Tooltip,
} from '@deepseek-ai/dsh-client-ui-primitives'
import { speakableKind } from '../speakable.ts'
import type { FileSpeechActionProps } from './slots.ts'
import css from './FileSpeechAction.module.css'

export const FILE_KEY_PREFIX = 'file:'

export function FileSpeechAction({ absolutePath, toggle, useSpeech, t }: FileSpeechActionProps) {
  const key = `${FILE_KEY_PREFIX}${absolutePath}`
  const status = useSpeech(view => (view.activeMessageId === key ? view.status : 'idle'))
  const truncated = useSpeech(view => view.activeMessageId === key && view.truncated)
  const onClick = useCallback(() => { toggle(absolutePath) }, [absolutePath, toggle])
  if (speakableKind(absolutePath) === undefined) return null
  const label = status === 'loading'
    ? t('action.loading')
    : status === 'error'
      ? t('error.generic')
      : status === 'playing' ? t(truncated ? 'file.stopTruncated' : 'action.stop') : t('file.play')
  const variant = status === 'playing'
    ? css.active
    : status === 'loading' ? css.loading : status === 'error' ? css.failed : undefined
  const className = variant === undefined ? css.tool : `${css.tool} ${variant}`
  return (
    <Tooltip label={label} side="bottom">
      <button
        type="button"
        className={className}
        aria-label={label}
        aria-pressed={status === 'playing'}
        data-read-aloud-file={status}
        onClick={onClick}
      >
        {status === 'loading'
          ? <IconLoadingOutlineRegular />
          : status === 'playing' ? <IconStopFillRegular /> : <IconPlayOutlineRegular />}
      </button>
    </Tooltip>
  )
}
