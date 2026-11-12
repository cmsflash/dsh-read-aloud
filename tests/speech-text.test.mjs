import assert from 'node:assert/strict'
import { test } from 'node:test'
import { speakableKind, speakableText, splitSegments } from '../lib/index.js'

test('classifies prose files by extension and nothing else', () => {
  assert.equal(speakableKind('/w/Plan.MD'), 'markdown')
  assert.equal(speakableKind('C:\\w\\notes.markdown'), 'markdown')
  assert.equal(speakableKind('/w/page.mdx'), 'markdown')
  assert.equal(speakableKind('/w/log.txt'), 'plain')
  assert.equal(speakableKind('/w/a.text'), 'plain')
  for (const path of ['/w/app.ts', '/w/data.json', '/w/report.html', '/w/README', '/w/.md', '/w/slides.pdf']) {
    assert.equal(speakableKind(path), undefined, path)
  }
  assert.equal(speakableKind('/w/a.constructor'), undefined)
  assert.equal(speakableKind('/w/a.__proto__'), undefined)
})

test('reduces Markdown to the prose a listener should hear', () => {
  const source = [
    '---', 'title: Hidden', 'tags: [a, b]', '---',
    '# Plan **v2**',
    '',
    'First line of a wrapped',
    'paragraph with a [link](https://example.com/x) and `code`.',
    '',
    '```ts', 'const hidden = 1', '```',
    '',
    '- [x] Done item',
    '- *Second* item',
    '2. Numbered step',
    '',
    '| Name | Cost |', '|---|---:|', '| GPU | \\$6.50 |',
    '',
    '> Quoted _words_',
    '',
    '$$', 'E = mc^2', '$$',
    '<!-- hidden', 'still hidden -->',
    'See https://example.com/long/url and ![chart](a.png)[^1].',
    '',
    '[ref]: https://example.com',
    '---',
    'Last $x$ &amp; done',
  ].join('\n')
  assert.deepEqual(speakableText(source, 'markdown').split('\n'), [
    'Plan v2.',
    'First line of a wrapped paragraph with a link and code.',
    'Done item.',
    'Second item.',
    '2. Numbered step.',
    'Name, Cost.',
    'GPU, $6.50.',
    'Quoted words.',
    'See and chart.',
    'Last x & done.',
  ])
})

test('speaks the inside of a code span as written', () => {
  assert.equal(
    speakableText('Branch from `zhuoran` into `.worktrees/<short-name>`', 'markdown'),
    'Branch from zhuoran into .worktrees/<short-name>.',
  )
  assert.equal(
    speakableText('It returns `Promise<void>` and the map is `Map<string, Promise<Uint8Array>>`.', 'markdown'),
    'It returns Promise<void> and the map is Map<string, Promise<Uint8Array>>.',
  )
  assert.equal(
    speakableText('Events `turn/*`, `step/*` and globs `vendor/*`, `packages/*/*`.', 'markdown'),
    'Events turn/*, step/* and globs vendor/*, packages/*/*.',
  )
})

test('keeps plain text verbatim apart from joining wrapped lines', () => {
  assert.equal(speakableText('\uFEFFone\r\ntwo\r\n\r\n# not a heading\n', 'plain'), 'one two.\n# not a heading.')
  assert.equal(speakableText('   \n\n', 'plain'), '')
  assert.equal(speakableText('```\nonly code\n```\n', 'markdown'), '')
})

test('packs blocks into parts under the limit and splits an oversized block', () => {
  assert.deepEqual(splitSegments('', 10), [])
  assert.deepEqual(splitSegments('aaaa\nbbbb\ncccc', 9), ['aaaa\nbbbb', 'cccc'])
  const long = 'One sentence here. Another sentence follows. Third one ends.'
  const parts = splitSegments(long, 30)
  assert.ok(parts.every(part => part.length <= 30), JSON.stringify(parts))
  assert.equal(parts.join(' '), long)
  assert.deepEqual(splitSegments('x'.repeat(25), 10), ['x'.repeat(10), 'x'.repeat(10), 'x'.repeat(5)])
  assert.deepEqual(splitSegments(long, 30), parts)
})
