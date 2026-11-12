import type { SpeakableKind } from './speakable.ts'

// The same leading-frontmatter pattern the document preview splits on.
const FRONTMATTER = /^\uFEFF?---[ \t]*\r?\n(?:([\s\S]*?)\r?\n)??(?:---|\.\.\.)[ \t]*(?:\r?\n|$)/u

function inline(text: string): string {
  const code: string[] = []
  return text
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/(`+)(?!`)([\s\S]*?[^`])\1(?!`)/g, (_all, _ticks, body: string) => `\0${code.push(body.trim()) - 1}\0`)
    .replace(/!\[([^\]]*)\]\((?:<[^>]*>|[^)]*)\)/g, '$1')
    .replace(/\[([^\]]+)\]\((?:<[^>]*>|[^)]*)\)/g, '$1')
    .replace(/\[([^\]]+)\]\[[^\]]*\]/g, '$1')
    .replace(/\[\^[^\]]+\]/g, '')
    .replace(/<(?:https?:\/\/|mailto:)[^>]+>/g, '')
    .replace(/https?:\/\/\S+/g, '')
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/<\/?[A-Za-z][^>]*>/g, '')
    .replace(/(\*\*|__)(.+?)\1/g, '$2')
    .replace(/(?<![\w*])\*(?!\s)(.+?)(?<!\s)\*(?![\w*])/g, '$1')
    .replace(/(?<![\w_])_(?!\s)(.+?)(?<!\s)_(?![\w_])/g, '$1')
    .replace(/~~(.+?)~~/g, '$1')
    .replace(/(?<!\\)\$(?!\s)([^$\n]+?)(?<![\s\\])\$/g, '$1')
    .replace(/\\([\\`*_{}[\]()#+\-.!$|>~])/g, '$1')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, '\'')
    .replace(/\0(\d+)\0/g, (_all, index: string) => code[Number(index)] ?? '')
    .replace(/[ \t]+/g, ' ')
    .trim()
}

function sentence(text: string): string {
  return /[.!?。！？:：;；…]$/u.test(text) ? text : `${text}.`
}

export function speakableText(source: string, kind: SpeakableKind): string {
  const normalized = source.replace(/\r\n?/g, '\n')
  const lines = (kind === 'markdown' ? normalized.replace(FRONTMATTER, '') : normalized.replace(/^\uFEFF/, '')).split('\n')
  const blocks: string[] = []
  let open = false
  let fence: string | undefined
  let math = false
  let comment = false
  const start = (text: string): void => {
    if (text === '') return
    blocks.push(text)
    open = true
  }
  const extend = (text: string): void => {
    if (text === '') return
    if (open) blocks[blocks.length - 1] += ` ${text}`
    else start(text)
  }
  for (const raw of lines) {
    const line = raw.trim()
    if (kind === 'plain') {
      if (line === '') open = false
      else extend(line)
      continue
    }
    if (fence !== undefined) {
      if (line.startsWith(fence) && /^[`~]+$/.test(line)) fence = undefined
      continue
    }
    if (math) {
      if (line.endsWith('$$')) math = false
      continue
    }
    if (comment) {
      if (line.includes('-->')) comment = false
      continue
    }
    const fenced = /^(`{3,}|~{3,})/.exec(line)
    if (fenced !== null) {
      fence = fenced[1]
      open = false
      continue
    }
    if (line.startsWith('$$')) {
      math = !(line.length > 3 && line.endsWith('$$'))
      open = false
      continue
    }
    if (line.startsWith('<!--') && !line.includes('-->')) {
      comment = true
      continue
    }
    if (line === '' || /^([-*_=])(?:\s*\1){2,}$/.test(line)) {
      open = false
      continue
    }
    if (/^\|?\s*:?-{3,}:?\s*(?:\|\s*:?-{3,}:?\s*)*\|?$/.test(line)) continue
    if (/^\[[^\]]+\]:\s*\S+/.test(line)) continue
    const heading = /^#{1,6}\s+(.*?)\s*#*$/.exec(line)
    if (heading !== null) {
      open = false
      start(inline(heading[1] ?? ''))
      open = false
      continue
    }
    if (line.startsWith('|')) {
      open = false
      start(line.split('|').map(inline).filter(cell => cell !== '').join(', '))
      open = false
      continue
    }
    const body = line.replace(/^(?:>\s?)+/, '')
    const item = /^(?:[-*+]|(\d+)[.)])\s+(?:\[[ xX]\]\s+)?(.*)$/.exec(body)
    if (item !== null) {
      open = false
      const words = inline(item[2] ?? '')
      start(item[1] === undefined || words === '' ? words : `${item[1]}. ${words}`)
      continue
    }
    extend(inline(body))
  }
  return blocks.map(sentence).join('\n')
}

function pieces(block: string, limit: number): string[] {
  const out: string[] = []
  let rest = block
  while (rest.length > limit) {
    const window = rest.slice(0, limit)
    const stop = Math.max(...['. ', '! ', '? ', '; ', '。', '！', '？', '；'].map(mark => window.lastIndexOf(mark)))
    const space = window.lastIndexOf(' ')
    const at = stop >= limit / 2 ? stop + 1 : space > 0 ? space : limit
    out.push(rest.slice(0, at).trim())
    rest = rest.slice(at).trim()
  }
  if (rest !== '') out.push(rest)
  return out
}

export function splitSegments(text: string, limit: number): string[] {
  const segments: string[] = []
  let current = ''
  for (const block of text.split('\n')) {
    for (const piece of pieces(block.trim(), limit)) {
      if (current !== '' && current.length + 1 + piece.length > limit) {
        segments.push(current)
        current = ''
      }
      current = current === '' ? piece : `${current}\n${piece}`
    }
  }
  if (current !== '') segments.push(current)
  return segments
}
