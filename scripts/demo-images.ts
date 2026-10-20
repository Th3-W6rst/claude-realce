// Draws the README's demo pictures (images/demo.png, images/demo-claro.png) from DEMO_TEXT, as /realce print does.
// bun --preload ./scripts/bun-stub.ts scripts/demo-images.ts   (needs mmdc and the Chrome headless mermaid-cli installs)
import { execFileSync } from 'node:child_process'
import { mkdtempSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { homedir, tmpdir } from 'node:os'
import { join } from 'node:path'

import { PALETTES } from '../hooks/palettes'
import { DEMO_TEXT } from '../hooks/system/demo'
import { estimateHeight, replyHtml } from '../hooks/system/printHtml'
import { parseBlocks } from '../hooks/text/blocks'

function findChrome(): string {
  const root = join(homedir(), '.cache/puppeteer/chrome-headless-shell')
  const found = execFileSync('find', [root, '-name', 'chrome-headless-shell', '-type', 'f'], { encoding: 'utf8' }).split('\n')[0]
  if (!found) throw new Error(`no chrome-headless-shell under ${root}: install mermaid-cli (npm i -g @mermaid-js/mermaid-cli)`)
  return found
}

const images = join(import.meta.dir, '../images')
const work = mkdtempSync(join(tmpdir(), 'realce-demo-'))
const chrome = findChrome()
const diagram = parseBlocks(DEMO_TEXT).find(b => b.type === 'code' && b.language === 'mermaid')
if (diagram?.type !== 'code') throw new Error('DEMO_TEXT has no mermaid block')

for (const [kind, name] of [['dark', 'demo'], ['light', 'demo-claro']] as const) {
  const set = PALETTES[kind]
  writeFileSync(join(work, `${kind}.json`), JSON.stringify(set.MERMAID))
  writeFileSync(join(work, 'diagram.mmd'), diagram.source)
  const png = join(work, `${kind}-diagram.png`)
  const background = String(set.MERMAID.themeVariables.background)
  execFileSync('mmdc', ['-i', join(work, 'diagram.mmd'), '-o', png, '-c', join(work, `${kind}.json`), '-b', background, '-s', '2', '-q'])
  const header = readFileSync(png)
  const picture = { file: png, width: header.readUInt32BE(16), height: header.readUInt32BE(20) }
  const html = join(work, `${name}.html`)
  writeFileSync(html, replyHtml(DEMO_TEXT, set, source => (source === diagram.source ? picture : null), { enfase: true, deltas: true, numeros: true }))
  const height = estimateHeight(DEMO_TEXT, [picture], source => source === diagram.source)
  execFileSync(chrome, ['--headless', '--disable-gpu', '--hide-scrollbars', `--screenshot=${join(images, `${name}.png`)}`, `--window-size=1000,${height}`, `file://${html}`], { stdio: 'ignore' })
  console.log(`${name}.png: 1000 x ${height}`)
}
console.log(readdirSync(images).join(' '))
