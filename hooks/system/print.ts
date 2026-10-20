import { atom, read } from 'claude-code'
import type { EngineInterface } from 'claude-code'

import { diagramHash } from '../code/diagram'
import { sessionOffset } from '../env'
import { formatStamp } from '../format'
import { PALETTES } from '../paletteSets'
import { parseBlocks } from '../text/blocks'
import { getFlags } from '../flags'
import { currentTheme } from '../theme'
import { inlineOptsOf } from '../text/inline'
import { estimateHeight, replyHtml, shotArgs, type Picture } from './printHtml'
import { tr } from '../i18n'
import { envVar, exists, runProcess, transcript, writeFile } from '../io'

const DIAGRAMS = atom({ plugin: 'realce', key: 'diagrams' } as const, {})


/** The headless Chrome mermaid-cli installs, else Google Chrome; null when neither is there. */
export async function findChrome($: EngineInterface, home: string): Promise<string | null> {
  const found = await runProcess($, ['find', `${home}/.cache/puppeteer/chrome-headless-shell`, '-name', 'chrome-headless-shell', '-type', 'f'])
  for (const path of found.stdout.split('\n').map(l => l.trim()).filter(Boolean)) if (await exists($, path)) return path
  const chrome = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
  return (await exists($, chrome)) ? chrome : null
}

/** The newest reply with text in the transcript: what copy and print take. */
export async function lastReply($: EngineInterface) {
  return [...(await transcript($))].reverse().find(m => m.role === 'assistant' && m.text.trim() !== '')
}

/** `/realce print`: the last reply as a page beside its PNG, on the Desktop (or in the home without one). */
export async function printCommand($: EngineInterface): Promise<string> {
  const reply = await lastReply($)
  if (reply === undefined) return tr('No reply to print yet.', 'Nenhuma resposta para imprimir ainda.')
  const home = (await envVar($, 'HOME')) ?? ''
  const desktop = `${home}/Desktop`
  const dir = (await exists($, desktop)) ? desktop : home
  // The session's offset, or the machine's when the session has not read it yet: the name says the person's time.
  const tz = await sessionOffset($)
  const base = `${dir}/realce-${formatStamp(await $.clock.now(), tz)}`
  const diagrams = await read($, DIAGRAMS)
  const picture = (source: string): Picture | null => {
    const d = diagrams[diagramHash(source)]
    return d?.status === 'ready' ? { file: d.file, width: d.width, height: d.height } : null
  }
  const flags = await getFlags($)
  await writeFile($, `${base}.html`, replyHtml(reply.text, PALETTES[currentTheme()], picture, inlineOptsOf(flags)))
  const chrome = await findChrome($, home)
  if (chrome === null) return tr(`The PNG needs headless Chrome; HTML saved at ${base}.html.`, `PNG precisa do Chrome headless; HTML salvo em ${base}.html.`)
  const pictures = parseBlocks(reply.text).flatMap(b => (b.type === 'code' ? [picture(b.source)] : [])).filter((p): p is Picture => p !== null)
  const height = estimateHeight(reply.text, pictures, source => picture(source) !== null)
  const run = await runProcess($, shotArgs(chrome, `${base}.png`, height, `${base}.html`), { timeoutMs: 30_000 })
  if (run.exitCode !== 0) {
    const why = run.stderr.split('\n').map(l => l.trim()).find(Boolean) ?? tr(`exited with ${run.exitCode}`, `saiu com ${run.exitCode}`)
    return tr(`Chrome wrote no PNG (${why}); HTML saved at ${base}.html.`, `O Chrome não gerou o PNG (${why}); HTML salvo em ${base}.html.`)
  }
  return tr(`Print saved at ${base}.png.`, `Print salvo em ${base}.png.`)
}
