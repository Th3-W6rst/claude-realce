import type { EngineInterface } from 'claude-code'

import { cachedEnv } from '../env'
import { findChrome } from './print'
import { compareVersions } from './update'

const MIN_CLAUDE_CODE = '2.1.304'

type Check = { mark: '✔' | '⚠' | '✖'; text: string }

/**
 * `/realce diagnostico`: what this machine gives the mod, each line a check with its fix, for whoever just installed
 * it. Nothing is changed.
 */
export async function doctorCommand($: EngineInterface, isFullscreen: boolean): Promise<string> {
  const env = cachedEnv()
  const home = (await $.env.get('HOME')) ?? ''
  const [version, colorterm, uname, chrome] = await Promise.all([
    $.session.version(),
    $.env.get('COLORTERM'),
    $.process.run(['uname']).then(r => r.stdout.trim(), () => ''),
    findChrome($, home),
  ])
  const checks: Check[] = [
    compareVersions(version.version, MIN_CLAUDE_CODE) >= 0
      ? { mark: '✔', text: `Claude Code ${version.version}` }
      : { mark: '✖', text: `Claude Code ${version.version}: o realce pede ${MIN_CLAUDE_CODE} ou mais novo (claude update)` },
    colorterm === 'truecolor' || colorterm === '24bit'
      ? { mark: '✔', text: 'Cor de 24 bits' }
      : { mark: '⚠', text: 'Cor de 24 bits: COLORTERM não diz truecolor; as cores podem sair aproximadas' },
    uname === 'Darwin' ? { mark: '✔', text: 'macOS' } : { mark: '⚠', text: `${uname || 'Sistema desconhecido'}: avisos, som e print usam recursos do macOS` },
    isFullscreen
      ? { mark: '✔', text: 'Tela cheia' }
      : { mark: '⚠', text: 'Tela cheia desligada: "tui": "fullscreen" no ~/.claude/settings.json (para rolar e selecionar)' },
    env !== null && env.editor !== 'file'
      ? { mark: '✔', text: `Editor dos caminhos: ${env.editor}` }
      : { mark: '⚠', text: 'Editor dos caminhos: nenhum (Cursor, VS Code ou Zed); os caminhos abrem como file://' },
    env?.mmdc != null
      ? { mark: '✔', text: `Diagramas: mmdc em ${env.mmdc}` }
      : { mark: '⚠', text: 'Diagramas: mmdc não encontrado (brew install mermaid-cli)' },
    chrome !== null
      ? { mark: '✔', text: `PNG do print: ${chrome.endsWith('chrome-headless-shell') ? 'Chrome headless' : 'Google Chrome'}` }
      : { mark: '⚠', text: 'PNG do print: Chrome headless não encontrado (o print salva só o HTML)' },
  ]
  return ['Diagnóstico do realce:', ...checks.map(c => `${c.mark} ${c.text}`)].join('\n')
}
