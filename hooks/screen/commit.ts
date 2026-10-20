import type { ScreenTone } from '../palette'
import { asRecord, str } from './toolInfo'

export type CommitCard =
  | { kind: 'commit'; verb: string; sha: string; branch: string | null; message: string | null; stat: { files: number; added: number; removed: number } | null }
  | { kind: 'push'; branch: string }
  | { kind: 'pr'; number: number; action: string; url: string | null }
  | { kind: 'branch'; ref: string; action: string }

const COMMIT_VERB: Record<string, string> = { committed: 'commit', amended: 'amend', 'cherry-picked': 'cherry-pick' }

const PR_ACTION: Record<string, string> = {
  created: 'criado',
  edited: 'editado',
  merged: 'mesclado',
  commented: 'comentado',
  closed: 'fechado',
  reopened: 'reaberto',
  ready: 'pronto para revisão',
  draft: 'em rascunho',
  'auto-merge-enabled': 'com auto-merge',
  'auto-merge-disabled': 'sem auto-merge',
}

const BRANCH_ACTION: Record<string, string> = { merged: 'mesclou', rebased: 'rebase em' }

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

/** '● commit 9cd805a · main · message · 8 arquivos +120 −3', '↑ push main', '⇡ PR #12 criado · <url>', '⎇ mesclou feat/x'. */
export function cardText(card: CommitCard): string {
  if (card.kind === 'commit') {
    const parts = [`● ${card.verb} ${card.sha}`]
    if (card.branch !== null) parts.push(card.branch)
    if (card.message !== null) parts.push(card.message)
    if (card.stat !== null) parts.push(`${card.stat.files} ${card.stat.files === 1 ? 'arquivo' : 'arquivos'} +${card.stat.added} −${card.stat.removed}`)
    return parts.join(' · ')
  }
  if (card.kind === 'push') return `↑ push ${card.branch}`
  if (card.kind === 'pr') return [`⇡ PR #${card.number}${card.action === '' ? '' : ` ${PR_ACTION[card.action] ?? card.action}`}`, ...(card.url === null ? [] : [card.url])].join(' · ')
  return `⎇ ${BRANCH_ACTION[card.action] ?? card.action} ${card.ref}`
}
