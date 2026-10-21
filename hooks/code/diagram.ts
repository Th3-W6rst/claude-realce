import { atom, update } from 'claude-code'
import type { EngineInterface } from 'claude-code'

import type { Diagram } from '../../types'
import { CELL_ASPECT, CELL_PX, DIAGRAM_SCALE } from '../layout'
import { MERMAID } from '../palette'
import { parseBlocks } from '../text/blocks'
import { currentTheme } from '../theme'
import { tr } from '../i18n'
import { exec, exists, readFile, writeFile } from '../io'
import { errorText } from '../safe'

const DIAGRAMS = atom({ plugin: 'realce', key: 'diagrams' } as const, {})

// Past these the picture would crowd the reply out: a wide one stops at the reading width, a tall one shrinks.
const MAX_COLUMNS = 100
const MAX_ROWS = 40

export type Mermaid = { source: string; hash: string }

export const isMermaid = (language: string) => language.toLowerCase() === 'mermaid'

/** The reply's mermaid blocks, parsed as the drawing parses them so both name a diagram by the same hash. */
export function findMermaid(text: string): Mermaid[] {
  return parseBlocks(text).flatMap(b => (b.type === 'code' && isMermaid(b.language) ? [{ source: b.source, hash: diagramHash(b.source) }] : []))
}

/** The diagram's name in the state and the cache: one picture per theme class, the dark one as it always was. */
export function diagramHash(source: string): string {
  const kind = currentTheme()
  return kind === 'dark' ? hashSource(source) : `${hashSource(source)}-${kind}`
}

/** FNV-1a (32 bits) of the source, in hex, then its length: a file name that only this source maps to in practice. */
export function hashSource(source: string): string {
  let hash = 0x811c9dc5
  for (let i = 0; i < source.length; i++) hash = Math.imul(hash ^ source.charCodeAt(i), 0x01000193) >>> 0
  return `${hash.toString(16).padStart(8, '0')}-${source.length}`
}

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]

/** Width and height from a PNG's IHDR (bytes 16–23, big-endian), or null when the bytes are no PNG. */
export function pngSize(base64: string): { width: number; height: number } | null {
  let head: string
  try {
    // 32 base64 characters are the first 24 bytes: signature, IHDR length and type, width, height.
    head = atob(base64.slice(0, 32))
  } catch {
    return null
  }
  if (head.length < 24 || PNG_SIGNATURE.some((b, i) => head.charCodeAt(i) !== b) || head.slice(12, 16) !== 'IHDR') return null
  const word = (at: number) => ((head.charCodeAt(at) << 24) | (head.charCodeAt(at + 1) << 16) | (head.charCodeAt(at + 2) << 8) | head.charCodeAt(at + 3)) >>> 0
  const width = word(16)
  const height = word(20)
  return width > 0 && height > 0 ? { width, height } : null
}

/** How many cells the picture takes: Image stretches to fill its box, so the box keeps the picture's shape. */
export function imageCells(px: { width: number; height: number }, maxColumns: number): { columns: number; rows: number } {
  const ratio = px.height / px.width
  let columns = Math.max(1, Math.min(maxColumns, MAX_COLUMNS, Math.ceil(px.width / (DIAGRAM_SCALE * CELL_PX))))
  let rows = Math.max(1, Math.round(columns * ratio * CELL_ASPECT))
  if (rows > MAX_ROWS) {
    rows = MAX_ROWS
    columns = Math.max(1, Math.round(MAX_ROWS / (ratio * CELL_ASPECT)))
  }
  return { columns, rows }
}

export const diagramDir = (home: string) => `${home}/.cache/realce/diagrams`

/** mmdc's arguments for one picture: natural size at scale 2, on the theme's background. The README's pictures too. */
export const mmdcArgs = (mmdc: string, input: string, png: string, config: string, background: string): string[] =>
  [mmdc, '-i', input, '-o', png, '-c', config, '-b', background, '-s', String(DIAGRAM_SCALE), '-q']

/** Renders one diagram to `<dir>/<hash>.png` with mmdc (a cached picture is reused) and reads its size. */
async function generateDiagram($: EngineInterface, source: string, hash: string, mmdc: string, dir: string): Promise<Diagram> {
  const png = `${dir}/${hash}.png`
  if (!(await exists($, png))) {
    const input = `${dir}/${hash}.mmd`
    const config = `${dir}/mermaid-${currentTheme()}.json`
    // fs.write creates the folder; mmdc then writes the picture beside the source.
    await writeFile($, config, JSON.stringify(MERMAID.config))
    await writeFile($, input, source)
    // Natural size at scale 2: mmdc 12 has no width option, and --size would blow small diagrams up to the screen.
    const run = await exec($, mmdcArgs(mmdc, input, png, config, String(MERMAID.config.themeVariables.background)))
    if (run.exitCode !== 0) {
      const line = run.stderr.split('\n').map(l => l.trim()).find(l => l !== '')
      // mmdc leads with `Error: `, which the block's own "Invalid diagram:" already says.
      return { status: 'failed', error: line?.replace(/^Error:\s*/, '') ?? tr(`mmdc exited with code ${run.exitCode}.`, `O mmdc saiu com o código ${run.exitCode}.`) }
    }
  }
  const size = pngSize((await readFile($, png, 'bytes')).base64)
  return size === null ? { status: 'failed', error: tr('mmdc wrote no readable PNG.', 'O mmdc não gerou um PNG legível.') } : { status: 'ready', file: png, ...size }
}

/** Runs off the append's dispatch; whatever stops the run is shown on the block, never dropped. */
export async function storeDiagram($: EngineInterface, source: string, hash: string, mmdc: string, dir: string): Promise<void> {
  let diagram: Diagram
  try {
    diagram = await generateDiagram($, source, hash, mmdc, dir)
  } catch (error) {
    diagram = { status: 'failed', error: errorText(error) }
  }
  await update($, DIAGRAMS, all => ({ ...all, [hash]: diagram }))
}
