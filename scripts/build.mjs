import { basename } from 'node:path'
import { readFile, rm, writeFile } from 'node:fs/promises'
import { build } from 'esbuild'
import ts from 'typescript'

const PACKAGE_ID = '@dsh-external/dsh-read-aloud'

/**
 * CSS Modules for a module-table plugin row.
 *
 * The shell serves one JS row per plugin and no stylesheet, so a `.module.css`
 * import must resolve to its hashed class map and inject its own tagged style
 * at factory execution. The `data-plugin-css` tag makes re-injection idempotent
 * across HMR reloads.
 */
const cssModulesPlugin = {
  name: 'dsh-css-modules',
  setup(pluginBuild) {
    pluginBuild.onLoad({ filter: /\.module\.css$/ }, async (args) => {
      const source = await readFile(args.path, 'utf8')
      const tagId = `${PACKAGE_ID}/${basename(args.path)}`
      const hash = Math.abs([...tagId].reduce((acc, ch) => (acc * 31 + ch.charCodeAt(0)) | 0, 7))
        .toString(36)
        .slice(0, 6)
      const classMap = {}
      const scoped = source.replace(/\.([A-Za-z_][\w-]*)/g, (whole, cls) => {
        // A bare identifier after a dot is a class selector; anything else
        // (a decimal in a length, a vendor value) keeps its text.
        if (/^\d/.test(cls)) return whole
        const mapped = `${cls}_${hash}`
        classMap[cls] = mapped
        return `.${mapped}`
      })
      const contents = [
        `const css = ${JSON.stringify(scoped)};`,
        `const tagId = ${JSON.stringify(tagId)};`,
        'if (typeof document !== \'undefined\' && document.querySelector(\'style[data-plugin-css=\' + JSON.stringify(tagId) + \']\') === null) {',
        '  const tag = document.createElement(\'style\');',
        `  tag.dataset.plugin = ${JSON.stringify(PACKAGE_ID)};`,
        '  tag.dataset.pluginCss = tagId;',
        '  tag.textContent = css;',
        '  document.head.appendChild(tag);',
        '}',
        `export default ${JSON.stringify(classMap)};`,
      ].join('\n')
      return { contents, loader: 'js' }
    })
  },
}

await rm('lib', { recursive: true, force: true })

const rootNames = ts.sys.readDirectory('src', ['.ts', '.tsx'])
const program = ts.createProgram({
  rootNames,
  options: {
    target: ts.ScriptTarget.ES2023,
    module: ts.ModuleKind.ESNext,
    moduleResolution: ts.ModuleResolutionKind.Bundler,
    allowImportingTsExtensions: true,
    lib: ['lib.es2023.d.ts', 'lib.dom.d.ts', 'lib.dom.iterable.d.ts'],
    jsx: ts.JsxEmit.ReactJSX,
    strict: true,
    noUncheckedIndexedAccess: true,
    exactOptionalPropertyTypes: true,
    skipLibCheck: true,
    verbatimModuleSyntax: true,
    declaration: true,
    emitDeclarationOnly: true,
    outDir: 'lib/types',
    rootDir: 'src',
  },
})
const emit = program.emit()
const diagnostics = ts.getPreEmitDiagnostics(program).concat(emit.diagnostics)
if (diagnostics.length > 0) {
  const host = {
    getCanonicalFileName: file => file,
    getCurrentDirectory: () => process.cwd(),
    getNewLine: () => '\n',
  }
  process.stderr.write(ts.formatDiagnosticsWithColorAndContext(diagnostics, host))
  process.exit(1)
}

// The Host face keeps every DSH package external: the running Harness supplies
// them, and bundling a second copy would fork the Cordis service registry.
await build({
  entryPoints: ['src/index.ts'],
  bundle: true,
  format: 'esm',
  platform: 'node',
  target: 'node22',
  outfile: 'lib/index.js',
  external: ['@deepseek-ai/*', 'cordis'],
})

await build({
  entryPoints: ['src/client/index.ts'],
  bundle: true,
  format: 'cjs',
  platform: 'browser',
  target: 'es2022',
  outfile: 'lib/client.js',
  sourcemap: true,
  plugins: [cssModulesPlugin],
  external: [
    'react',
    'react/jsx-runtime',
    '@deepseek-ai/dsh-client-ui-primitives',
  ],
  define: {
    'process.env.NODE_ENV': '"production"',
  },
  // The browser loads this through the shell's frozen module table rather than
  // as an ES module, so the factory wrapper is the calling convention.
  banner: {
    js: [
      `window.__ModuleLoader__.load({ id: ${JSON.stringify(PACKAGE_ID)}, factory: (require) => {`,
      'var module = { exports: {} }; var exports = module.exports;',
    ].join('\n'),
  },
  footer: {
    js: 'return module.exports; } });',
  },
})

for (const file of ['lib/index.js', 'lib/client.js']) {
  const source = await readFile(file, 'utf8')
  await writeFile(file, source.replace(/[ \t]+$/gm, ''))
}

console.log('[dsh-read-aloud] built Host and Web client bundles')
