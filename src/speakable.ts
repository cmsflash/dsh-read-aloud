export type SpeakableKind = 'markdown' | 'plain'

const KINDS: ReadonlyMap<string, SpeakableKind> = new Map([
  ['md', 'markdown'],
  ['markdown', 'markdown'],
  ['mdx', 'markdown'],
  ['txt', 'plain'],
  ['text', 'plain'],
])

export function speakableKind(path: string): SpeakableKind | undefined {
  const normalized = path.replaceAll('\\', '/').toLowerCase()
  const name = normalized.slice(normalized.lastIndexOf('/') + 1)
  const dot = name.lastIndexOf('.')
  return dot <= 0 ? undefined : KINDS.get(name.slice(dot + 1))
}
