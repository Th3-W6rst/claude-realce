import { atom, read, update } from 'claude-code'
import type { EngineInterface, On, RenderSurface } from 'claude-code'

import { isMermaid } from '../code/diagram'
import { pathHref } from '../code/links'
import { cachedEnv } from '../env'
import { getFlags, type FlagId } from '../flags'
import { memoLatest } from '../memo'
import { FOLD_AT } from '../layout'
import { parseBlocks } from './blocks'
import type { RenderCtx } from './ctx'
import { toPlainMarkdown } from './inline'
import { renderReply } from './render'
import { timed } from '../perf'
import { tr } from '../i18n'
import { copyText, toast } from '../io'

const DIAGRAMS = atom({ plugin: 'realce', key: 'diagrams' } as const, {})
// One member per code block of a reply, `${requestId}:${index}`: whether it is unfolded.
const FOLDS = { plugin: 'realce', key: 'folds' } as const

// With all of these off the reply is the engine's own drawing.
const REPLY_FLAGS: readonly FlagId[] = ['enfase', 'coluna', 'callouts', 'tabelas', 'deltas', 'respiro', 'highlight', 'copiar', 'dobrar', 'caminhos', 'diagramas', 'numeros']

export function registerText(on: On): void {
  on('ui.render', { component: 'AssistantMessage' }, async ($, e, next) => timed('AssistantMessage', async () => {
    const flags = await getFlags($)
    // Everywhere this mod does not draw, the typed marks still read as plain bold.
    if (e.surface !== 'terminal' || e.props.isSummary === true || !REPLY_FLAGS.some(id => flags[id])) {
      return next({ ...e, props: { ...e.props, text: toPlainMarkdown(e.props.text) } })
    }
    // Same text, same blocks: a scroll redraws a reply many times over, and a streaming reply keeps one parse.
    const blocks = memoLatest('blocks', e.requestId, e.props.text, () => parseBlocks(e.props.text))
    const code = blocks.flatMap(b => (b.type === 'code' ? [b] : []))
    // Only a block long enough to fold has a fold to read; only a mermaid block has a diagram. One round trip.
    const folded = code.flatMap((b, i) => (b.source.split('\n').length > FOLD_AT ? [i] : []))
    const [folds, diagrams] = await Promise.all([
      Promise.all(folded.map(i => read($, { ...FOLDS, id: `${e.requestId}:${i}` }))),
      code.some(b => isMermaid(b.language)) ? read($, DIAGRAMS) : Promise.resolve({}),
    ])
    const openFolds = new Set(folded.filter((_, n) => folds[n] === true))
    const env = cachedEnv()
    const ctx: RenderCtx = {
      t: $.ui.resolve(e),
      flags,
      columns: e.viewport?.columns ?? 80,
      requestId: e.requestId,
      openFolds,
      diagrams,
      env,
      hrefForPath: path => (flags.caminhos && env !== null ? pathHref(path, env) : null),
      onCopy: source => void copySource($, source, e.surface),
      text: e.props.text,
      onFold: (index, isOpen) => void update($, { ...FOLDS, id: `${e.requestId}:${index}` }, () => isOpen),
    }
    return renderReply(ctx, blocks)
  }))
}

async function copySource($: EngineInterface, text: string, surface: RenderSurface): Promise<void> {
  const copied = await copyText($, { text, surface })
  toast($, copied.isCopied ? tr('Copied.', 'Copiado.') : tr(`Could not copy: ${copied.reason}.`, `Não deu para copiar: ${copied.reason}.`))
}
