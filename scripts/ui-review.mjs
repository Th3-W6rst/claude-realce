// Fails when a string in hooks/ holds a control character. awesome-claude-code-mods scans the source of every mod that
// hooks ui.render for such strings (tools/compatibility.mjs, "ui-control-characters") and holds a mod with one back
// from publication: this is the same test, over every file under hooks/ rather than only the ones register.tsx imports.
//
//   node scripts/ui-review.mjs   exit 1 and print each place; typescript comes from the global install (npm i -g)

import { execFileSync } from 'node:child_process'
import { readFileSync, readdirSync } from 'node:fs'
import { createRequire } from 'node:module'
import { join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = fileURLToPath(new URL('..', import.meta.url))
// The catalogue's own pattern: C0 and C1 controls, tab and newline aside. Comments and regexes are not strings.
const CONTROLS = /[\u0000-\u0008\u000b-\u001f\u007f-\u009f]/

const globalRoot = execFileSync('npm', ['root', '-g'], { encoding: 'utf8' }).trim()
const ts = createRequire(join(globalRoot, 'noop.js'))('typescript')

const sources = dir =>
  readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) return sources(path)
    return /\.(ts|tsx|js|jsx|mjs|cjs)$/.test(entry.name) && !entry.name.endsWith('.d.ts') ? [path] : []
  })

const found = []
for (const file of sources(join(ROOT, 'hooks'))) {
  const source = ts.createSourceFile(file, readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true)
  const stack = [source]
  while (stack.length > 0) {
    const node = stack.pop()
    if ((ts.isStringLiteralLike(node) || ts.isTemplateHead(node) || ts.isTemplateMiddle(node) || ts.isTemplateTail(node)) && CONTROLS.test(node.text)) {
      found.push(`${relative(ROOT, file)}:${source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1}`)
    }
    ts.forEachChild(node, child => void stack.push(child))
  }
}

if (found.length > 0) {
  for (const place of found) console.error(`scripts/ui-review.mjs: a control character in a string at ${place}`)
  process.exit(1)
}
console.log('ui review: no control-character strings under hooks/')
