// Draws the README's demo pictures (images/demo.png, images/demo-light.png) from the English demo text, with the
// arguments and the page /realce print uses.
// bun --preload ./scripts/bun-stub.ts scripts/demo-images.ts   (needs mmdc and the headless browser: README, Diagrams)
import { execFileSync } from 'node:child_process'
import { mkdtempSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { homedir, tmpdir } from 'node:os'
import { join } from 'node:path'

import { isMermaid, mmdcArgs, pngSize } from '../hooks/code/diagram'
import { PALETTES } from '../hooks/paletteSets'
import { DEMO_TEXTS } from '../hooks/system/demo'
import { estimateHeight, replyHtml, shotArgs } from '../hooks/system/printHtml'
import { parseBlocks } from '../hooks/text/blocks'

// The README is in English: so are its pictures.
const DEMO_TEXT = DEMO_TEXTS.en
// Every aid on, as a fresh install draws it.
const ALL_ON = { enfase: true, deltas: true, numeros: true }

function findChrome(): string {
  const root = join(homedir(), '.cache/puppeteer/chrome-headless-shell')
  const found = execFileSync('find', [root, '-name', 'chrome-headless-shell', '-type', 'f'], { encoding: 'utf8' }).split('\n')[0]
  if (!found) throw new Error(`no chrome-headless-shell under ${root}: install it as the README's Diagrams section says`)
  return found
}

const run = ([program, ...args]: string[]) => execFileSync(program!, args, { stdio: 'ignore' })

const images = join(import.meta.dir, '../images')
const work = mkdtempSync(join(tmpdir(), 'realce-demo-'))
const chrome = findChrome()
const diagram = parseBlocks(DEMO_TEXT).find(b => b.type === 'code' && isMermaid(b.language))
if (diagram?.type !== 'code') throw new Error('DEMO_TEXT has no mermaid block')

for (const [kind, name] of [['dark', 'demo'], ['light', 'demo-light']] as const) {
  const set = PALETTES[kind]
  const config = join(work, `${kind}.json`)
  const input = join(work, 'diagram.mmd')
  writeFileSync(config, JSON.stringify(set.MERMAID))
  writeFileSync(input, diagram.source)
  const png = join(work, `${kind}-diagram.png`)
  run(mmdcArgs('mmdc', input, png, config, String(set.MERMAID.themeVariables.background)))
  const size = pngSize(readFileSync(png).toString('base64'))
  if (size === null) throw new Error(`mmdc wrote no readable PNG at ${png}`)
  const picture = { file: png, ...size }
  const html = join(work, `${name}.html`)
  writeFileSync(html, replyHtml(DEMO_TEXT, set, source => (source === diagram.source ? picture : null), ALL_ON))
  const height = estimateHeight(DEMO_TEXT, [picture], source => source === diagram.source)
  run(shotArgs(chrome, join(images, `${name}.png`), height, html))
  console.log(`${name}.png: 1000 x ${height}`)
}
console.log(readdirSync(images).join(' '))
