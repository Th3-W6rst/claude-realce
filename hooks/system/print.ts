import { atom, read } from 'claude-code'
import type { EngineInterface } from 'claude-code'

import { diagramHash } from '../code/diagram'
import { cachedEnv } from '../env'
import { parseTzOffset } from '../format'
import { PALETTES } from '../palettes'
import { parseBlocks } from '../text/blocks'
import { getFlags } from '../flags'
import { currentTheme } from '../theme'
import { estimateHeight, fileUrl, replyHtml, type Picture } from './printHtml'

const DIAGRAMS = atom({ plugin: 'realce', key: 'diagrams' } as const, {})

const pad = (n: number) => String(n).padStart(2, '0')

/** 'DD-MM_HH-MM' at the session's offset from UTC: the file's name, as every report the person keeps is named. */
function stamp(epochMs: number, tzOffsetMinutes: number): string {
  const d = new Date(epochMs + tzOffsetMinutes * 60_000)
  return `${pad(d.getUTCDate())}-${pad(d.getUTCMonth() + 1)}_${pad(d.getUTCHours())}-${pad(d.getUTCMinutes())}`
}

/** The headless Chrome mermaid-cli installs, else Google Chrome; null when neither is there. */
async function findChrome($: EngineInterface, home: string): Promise<string | null> {
  const found = await $.process.run(['find', `${home}/.cache/puppeteer/chrome-headless-shell`, '-name', 'chrome-headless-shell', '-type', 'f'])
  for (const path of found.stdout.split('\n').map(l => l.trim()).filter(Boolean)) if (await $.fs.exists(path)) return path
  const chrome = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
  return (await $.fs.exists(chrome)) ? chrome : null
}

/** `/realce print`: the last reply as a page beside its PNG, on the Desktop (or in the home without one). */
export async function printCommand($: EngineInterface): Promise<string> {
  const reply = [...(await $.session.messages())].reverse().find(m => m.role === 'assistant' && m.text.trim() !== '')
  if (reply === undefined) return 'Nenhuma resposta para imprimir ainda.'
  const home = (await $.env.get('HOME')) ?? ''
  const desktop = `${home}/Desktop`
  const dir = (await $.fs.exists(desktop)) ? desktop : home
  // The session's offset, or the machine's when the session has not read it yet: the name says the person's time.
  const tz = cachedEnv()?.tzOffsetMinutes ?? parseTzOffset((await $.process.run(['date', '+%z'])).stdout)
  const base = `${dir}/realce-${stamp(await $.clock.now(), tz)}`
  const diagrams = await read($, DIAGRAMS)
  const picture = (source: string): Picture | null => {
    const d = diagrams[diagramHash(source)]
    return d?.status === 'ready' ? { file: d.file, width: d.width, height: d.height } : null
  }
  const flags = await getFlags($)
  await $.fs.write(`${base}.html`, replyHtml(reply.text, PALETTES[currentTheme()], picture, { enfase: flags.enfase, deltas: flags.deltas, numeros: flags.numeros }))
  const chrome = await findChrome($, home)
  if (chrome === null) return `PNG precisa do Chrome headless; HTML salvo em ${base}.html.`
  const pictures = parseBlocks(reply.text).flatMap(b => (b.type === 'code' ? [picture(b.source)] : [])).filter((p): p is Picture => p !== null)
  const height = estimateHeight(reply.text, pictures)
  const run = await $.process.run(
    [chrome, '--headless', '--disable-gpu', '--hide-scrollbars', `--screenshot=${base}.png`, `--window-size=1000,${height}`, fileUrl(`${base}.html`)],
    { timeoutMs: 30_000 },
  )
  if (run.exitCode !== 0) {
    const why = run.stderr.split('\n').map(l => l.trim()).find(Boolean) ?? `saiu com ${run.exitCode}`
    return `O Chrome não gerou o PNG (${why}); HTML salvo em ${base}.html.`
  }
  return `Print salvo em ${base}.png.`
}
