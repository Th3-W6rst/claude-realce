import type { Args, EngineInterface } from 'claude-code'

import { getFlags } from '../flags'
import { tr } from '../i18n'
import { detach, fetchUrl, readFile, storeGet, storeSet, toast } from '../io'
import { asRecord, errorText, str } from '../safe'

const REMOTE = 'https://raw.githubusercontent.com/Th3-W6rst/claude-realce/main/.claude-plugin/plugin.json'
const CHANGELOG = 'https://github.com/Th3-W6rst/claude-realce/blob/main/CHANGELOG.md'
const DAY_MS = 24 * 3_600_000
// The public marketplace: what a copy not installed from a marketplace cache (a --plugin-dir run) updates from.
const PUBLIC_MARKETPLACE = 'claude-realce'

let lastStatus: string | null = null

/** What the last check found, for `/realce status`; null before one ran. */
export const updateStatus = () => lastStatus

/** Semver's order on `x.y.z[-pre]`, part by part as numbers: '0.10.0' after '0.9.9', '0.5.0-beta' before '0.5.0'. */
export function compareVersions(a: string, b: string): number {
  const [coreA = '', preA] = a.split('-', 2)
  const [coreB = '', preB] = b.split('-', 2)
  const pa = coreA.split('.').map(n => Number.parseInt(n, 10) || 0)
  const pb = coreB.split('.').map(n => Number.parseInt(n, 10) || 0)
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0)
    if (d !== 0) return d
  }
  if (preA === undefined || preB === undefined) return (preA === undefined ? 1 : 0) - (preB === undefined ? 1 : 0)
  return preA < preB ? -1 : preA > preB ? 1 : 0
}

const versionOf = (json: string): string | null => {
  return str(asRecord(JSON.parse(json)).version)
}

/** The installed copy's version: plugin.json under the plugin's directory, where this mod keeps it. */
export async function localVersion($: EngineInterface): Promise<string | null> {
  for (const path of [`${$.plugin.root}/.claude-plugin/plugin.json`, `${$.plugin.root}/plugin.json`]) {
    try {
      return versionOf(await readFile($, path))
    } catch {
      // The other place is tried; neither read is said below, as the check's reason.
    }
  }
  return null
}

/** The marketplace this copy was installed from, read off its cache path (`…/plugins/cache/<marketplace>/realce/…`). */
const marketplaceOf = (root: string) => /\/plugins\/cache\/([^/]+)\//.exec(root)?.[1] ?? PUBLIC_MARKETPLACE

async function runCheck($: EngineInterface): Promise<void> {
  const local = await localVersion($)
  if (local === null) {
    lastStatus = tr('Update: not checked (the installed version was not read).', 'Atualização: não verificada (versão instalada não lida).')
    return
  }
  let remote: string | null
  try {
    const response = await fetchUrl($, REMOTE)
    if (!response.ok) {
      lastStatus = tr(`Update: not checked (GitHub answered ${response.status}).`, `Atualização: não verificada (GitHub respondeu ${response.status}).`)
      return
    }
    remote = versionOf(response.text)
  } catch (error) {
    const why = errorText(error)
    lastStatus = tr(`Update: not checked (${why}).`, `Atualização: não verificada (${why}).`)
    return
  }
  if (remote === null || remote === '') {
    lastStatus = tr("Update: not checked (GitHub's version was not read).", 'Atualização: não verificada (versão no GitHub não lida).')
    return
  }
  await storeSet($, 'updateCheckedAt', await $.clock.now())
  if (compareVersions(remote, local) <= 0) {
    lastStatus = tr(`Update: up to date (${local}).`, `Atualização: em dia (${local}).`)
    return
  }
  lastStatus = tr(`Update: ${remote} is out (installed ${local}). What's new: ${CHANGELOG}`, `Atualização: ${remote} disponível (instalada ${local}). Novidades: ${CHANGELOG}`)
  const marketplace = marketplaceOf($.plugin.root)
  const how = `claude plugin marketplace update ${marketplace} ${tr('and', 'e')} claude plugin update realce@${marketplace}`
  toast($, tr(`realce ${remote} is out: ${how}`, `realce ${remote} disponível: ${how}`))
}

/** At most once a day, in an interactive session, off its start: is there a newer realce on GitHub? */
export async function checkUpdate($: EngineInterface, e: Args<'session.start'>): Promise<void> {
  if (!e.isInteractive || !(await getFlags($)).atualizacao) return
  const checkedAt = await storeGet($, 'updateCheckedAt')
  if (typeof checkedAt === 'number' && (await $.clock.now()) - checkedAt < DAY_MS) return
  detach($, () => void runCheck($))
}
