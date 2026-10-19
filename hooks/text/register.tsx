import { atom, read, update } from 'claude-code'
import type { EngineInterface, On, RenderSurface } from 'claude-code'

import { isMermaid } from '../code/diagram'
import { pathHref } from '../code/links'
import { cachedEnv } from '../env'
import { getFlags, type FlagId } from '../flags'
import { memo } from '../memo'
import { FOLD_AT } from '../palette'
import { parseBlocks } from './blocks'
import type { RenderCtx } from './ctx'
import { toPlainMarkdown } from './inline'
import { renderReply } from './render'
import { timed } from '../perf'

const DIAGRAMS = atom({ plugin: 'realce', key: 'diagrams' } as const, {})
// One member per code block of a reply, `${requestId}:${index}`: whether it is unfolded.
const FOLDS = { plugin: 'realce', key: 'folds' } as const

// With all of these off the reply is the engine's own drawing.
const REPLY_FLAGS: readonly FlagId[] = ['enfase', 'coluna', 'callouts', 'tabelas', 'deltas', 'respiro', 'highlight', 'copiar', 'dobrar', 'caminhos', 'diagramas']

export function registerText(on: On): void {
  on('ui.render', { component: 'AssistantMessage' }, async ($, e, next) => timed('AssistantMessage', async () => {
    const flags = await getFlags($)
    // Everywhere this mod does not draw, the typed marks still read as plain bold.
    if (e.surface !== 'terminal' || e.props.isSummary === true || !REPLY_FLAGS.some(id => flags[id])) {
      return next({ ...e, props: { ...e.props, text: toPlainMarkdown(e.props.text) } })
    }
    // Same text, same blocks: a scroll redraws a reply many times over.
    const blocks = memo('blocks', e.props.text, () => parseBlocks(e.props.text), 1000)
    const code = blocks.flatMap(b => (b.type === 'code' ? [b] : []))
    const openFolds = new Set<number>()
    // Only a block long enough to fold has a fold to read; only a mermaid block has a diagram.
    for (const [i, b] of code.entries()) {
      if (b.source.split('\n').length > FOLD_AT && (await read($, { ...FOLDS, id: `${e.requestId}:${i}` })) === true) openFolds.add(i)
    }
    const diagrams = code.some(b => isMermaid(b.language)) ? await read($, DIAGRAMS) : {}
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
      onFold: (index, isOpen) => void update($, { ...FOLDS, id: `${e.requestId}:${index}` }, () => isOpen),
    }
    return renderReply(ctx, blocks)
  }))
}

async function copySource($: EngineInterface, text: string, surface: RenderSurface): Promise<void> {
  const copied = await $.ui.copy({ text, surface })
  $.ui.toast(copied.isCopied ? 'Copiado.' : `Não deu para copiar: ${copied.reason}.`)
}
