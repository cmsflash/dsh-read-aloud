import assert from 'node:assert/strict'
import { readFile, readdir, realpath } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { test } from 'node:test'
import ts from 'typescript'

// `src/types/dsh.d.ts` declares the Harness modules by hand, so `tsc` accepts
// any name the shim declares even after the Harness renames or drops it, and
// the browser then gets `undefined` (React #130 hides the slot entry). This
// test checks every imported name against the Harness checkout's built types.

const checkout = process.env.DSH_CHECKOUT
  ?? resolve(await realpath(new URL('../node_modules/@deepseek-ai/cordis', import.meta.url)), '../..')

async function harnessPackageDirs() {
  const dirs = new Map()
  const groups = [join(checkout, 'vendor'), ...(await readdir(join(checkout, 'packages'), { withFileTypes: true }))
    .filter(entry => entry.isDirectory())
    .map(entry => join(checkout, 'packages', entry.name))]
  for (const group of groups) {
    for (const entry of await readdir(group, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue
      const dir = join(group, entry.name)
      try {
        const { name } = JSON.parse(await readFile(join(dir, 'package.json'), 'utf8'))
        dirs.set(name, dir)
      } catch (error) {
        if (error.code !== 'ENOENT') throw error
      }
    }
  }
  return dirs
}

function typesEntry(manifest, subpath) {
  const target = manifest.exports?.[subpath]
  if (typeof target === 'object' && target !== null && typeof target.types === 'string') return target.types
  if (subpath === '.' && typeof manifest.types === 'string') return manifest.types
  return undefined
}

function harnessImports(sourceFiles) {
  const imports = []
  for (const file of sourceFiles) {
    const source = ts.createSourceFile(file.path, file.text, ts.ScriptTarget.Latest, true)
    for (const statement of source.statements) {
      if (!ts.isImportDeclaration(statement)) continue
      const specifier = statement.moduleSpecifier.text
      if (!specifier.startsWith('@deepseek-ai/')) continue
      const bindings = statement.importClause?.namedBindings
      if (bindings === undefined || !ts.isNamedImports(bindings)) continue
      for (const element of bindings.elements) {
        imports.push({ file: file.path, specifier, name: (element.propertyName ?? element.name).text })
      }
    }
  }
  return imports
}

test('every name imported from the Harness exists in its built types', async () => {
  const sourceFiles = []
  for (const path of ts.sys.readDirectory('src', ['.ts', '.tsx'])) {
    if (path.endsWith('.d.ts')) continue
    sourceFiles.push({ path, text: await readFile(path, 'utf8') })
  }
  const imports = harnessImports(sourceFiles)
  assert.ok(imports.some(entry => entry.specifier === '@deepseek-ai/dsh-client-ui-primitives'))

  const dirs = await harnessPackageDirs()
  const entries = new Map()
  for (const { specifier } of imports) {
    if (entries.has(specifier)) continue
    const [scope, name, ...rest] = specifier.split('/')
    const dir = dirs.get(`${scope}/${name}`)
    assert.ok(dir, `${specifier}: no such package in ${checkout}`)
    const manifest = JSON.parse(await readFile(join(dir, 'package.json'), 'utf8'))
    const subpath = rest.length === 0 ? '.' : `./${rest.join('/')}`
    const types = typesEntry(manifest, subpath)
    assert.ok(types, `${specifier}: ${manifest.name} exports no types for "${subpath}"`)
    entries.set(specifier, join(dir, types))
  }

  const program = ts.createProgram([...entries.values()], {
    module: ts.ModuleKind.NodeNext,
    moduleResolution: ts.ModuleResolutionKind.NodeNext,
    jsx: ts.JsxEmit.ReactJSX,
    skipLibCheck: true,
    noEmit: true,
  })
  const checker = program.getTypeChecker()
  const exported = new Map()
  for (const [specifier, path] of entries) {
    const source = program.getSourceFile(path)
    assert.ok(source, `${specifier}: ${path} is missing; build the Harness checkout first`)
    const moduleSymbol = checker.getSymbolAtLocation(source)
    exported.set(specifier, new Set(moduleSymbol ? checker.getExportsOfModule(moduleSymbol).map(symbol => symbol.name) : []))
  }

  const missing = imports
    .filter(({ specifier, name }) => !exported.get(specifier).has(name))
    .map(({ file, specifier, name }) => `${file}: ${name} from ${specifier}`)
  assert.deepEqual(missing, [], `imports the Harness at ${checkout} does not export`)
})
