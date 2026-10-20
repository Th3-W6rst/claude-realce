import { plural } from '../format'
import { pick, tr, type Text } from '../i18n'
import type { ScreenTone } from '../palette'
import { asRecord, str } from './toolInfo'

import type { CommitCard } from '../../types'

export type { CommitCard }

const COMMIT_VERB: Record<string, string> = { committed: 'commit', amended: 'amend', 'cherry-picked': 'cherry-pick' }

const PR_ACTION: Record<string, Text> = {
  created: { en: 'created', pt: 'criado' },
  edited: { en: 'edited', pt: 'editado' },
  merged: { en: 'merged', pt: 'mesclado' },
  commented: { en: 'commented', pt: 'comentado' },
  closed: { en: 'closed', pt: 'fechado' },
  reopened: { en: 'reopened', pt: 'reaberto' },
  ready: { en: 'ready for review', pt: 'pronto para revisão' },
  draft: { en: 'in draft', pt: 'em rascunho' },
  'auto-merge-enabled': { en: 'with auto-merge', pt: 'com auto-merge' },
  'auto-merge-disabled': { en: 'without auto-merge', pt: 'sem auto-merge' },
}

const BRANCH_ACTION: Record<string, Text> = { merged: { en: 'merged', pt: 'mesclou' }, rebased: { en: 'rebased onto', pt: 'rebase em' } }

const actionOf = (actions: Record<string, Text>, action: string): string => (actions[action] === undefined ? action : pick(actions[action]!))

export const CARD_TONE: Record<CommitCard['kind'], ScreenTone> = { commit: 'ok', push: 'run', pr: 'web', branch: 'plan' }

/** git's own summary: `[main 9cd805a] message` and ` 8 files changed, 120 insertions(+), 3 deletions(-)`. */
function commitSummary(stdout: string): { branch: string; message: string; stat: { files: number; added: number; removed: number } | null } | null {
  const head = /^\[([^\s\]]+)(?: \([^)]*\))? [0-9a-f]{7,40}\] (.+)$/m.exec(stdout)
  if (head === null) return null
  const stat = /(\d+) files? changed(?:, (\d+) insertions?\(\+\))?(?:, (\d+) deletions?\(-\))?/.exec(stdout)
  return {
    branch: head[1]!,
    message: head[2]!.trim(),
    stat: stat === null ? null : { files: Number(stat[1]), added: Number(stat[2] ?? 0), removed: Number(stat[3] ?? 0) },
  }
}

/** The git operations the engine saw in a Bash call (`gitOperation`), each as a card; none for any other command. */
export function commitCards(output: unknown): CommitCard[] {
  const out = asRecord(output)
  const op = asRecord(out.gitOperation)
  const cards: CommitCard[] = []
  const commit = asRecord(op.commit)
  const sha = str(commit.sha)
  if (sha !== null) {
    const summary = commitSummary(str(out.stdout) ?? '')
    cards.push({
      kind: 'commit',
      verb: COMMIT_VERB[str(commit.kind) ?? ''] ?? 'commit',
      sha: sha.slice(0, 7),
      branch: str(commit.branch) ?? summary?.branch ?? null,
      message: summary?.message ?? null,
      stat: summary?.stat ?? null,
    })
  }
  const push = str(asRecord(op.push).branch)
  if (push !== null) cards.push({ kind: 'push', branch: push })
  const pr = asRecord(op.pr)
  if (typeof pr.number === 'number') cards.push({ kind: 'pr', number: pr.number, action: str(pr.action) ?? '', url: str(pr.url) })
  const branch = asRecord(op.branch)
  const ref = str(branch.ref)
  if (ref !== null) cards.push({ kind: 'branch', ref, action: str(branch.action) ?? '' })
  return cards
}

/** The card as a folded group names it: '● commit 9cd805a', '↑ push main', '⇡ PR #12', '⎇ mesclou feat/x'. */
export function shortCardText(card: CommitCard): string {
  if (card.kind === 'commit') return `● ${card.verb} ${card.sha}`
  if (card.kind === 'pr') return `⇡ PR #${card.number}`
  return cardText(card)
}

/** '● commit 9cd805a · main · message · 8 files +120 −3', '↑ push main', '⇡ PR #12 created · <url>', '⎇ merged feat/x'. */
export function cardText(card: CommitCard): string {
  if (card.kind === 'commit') {
    const parts = [`● ${card.verb} ${card.sha}`]
    if (card.branch !== null) parts.push(card.branch)
    if (card.message !== null) parts.push(card.message)
    if (card.stat !== null) parts.push(`${plural(card.stat.files, tr('file', 'arquivo'), tr('files', 'arquivos'))} +${card.stat.added} −${card.stat.removed}`)
    return parts.join(' · ')
  }
  if (card.kind === 'push') return `↑ push ${card.branch}`
  if (card.kind === 'pr') return [`⇡ PR #${card.number}${card.action === '' ? '' : ` ${actionOf(PR_ACTION, card.action)}`}`, ...(card.url === null ? [] : [card.url])].join(' · ')
  return `⎇ ${actionOf(BRANCH_ACTION, card.action)} ${card.ref}`
}
