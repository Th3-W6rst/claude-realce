"""Rewrites README.md's "Recursos e flags" table from hooks/flags.ts and its "Versão atual" from plugin.json, so the
README never drifts from the code.

  python3 scripts/flags-table.py          rewrite the table
  python3 scripts/flags-table.py --check  exit 1 when the README's table is out of date
"""
import json
import pathlib
import re
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
GROUPS = ['Texto', 'Código', 'Ferramentas', 'Orientação', 'Sistema']
FLAG = re.compile(r"\{ id: '(\w+)', group: '([^']+)', label: '([^']+)', description: '([^']+)', isDefaultOn: (true|false) \}")


def table() -> str:
    rows = FLAG.findall((ROOT / 'hooks' / 'flags.ts').read_text())
    rows.sort(key=lambda r: GROUPS.index(r[1]))
    lines = ['| Grupo | Flag | Recurso | O que faz | Padrão |', '|---|---|---|---|---|']
    for flag_id, group, label, description, is_on in rows:
        lines.append(f"| {group} | `{flag_id}` | {label} | {description.replace('|', chr(92) + '|')} | {'ligado' if is_on == 'true' else 'desligado'} |")
    return '\n'.join(lines) + '\n'


def main() -> int:
    readme = ROOT / 'README.md'
    text = readme.read_text()
    start = text.index('## Recursos e flags\n')
    end = text.find('\n## ', start + 3)
    fresh = text[:start] + '## Recursos e flags\n\n' + table() + text[end:]
    version = json.loads((ROOT / '.claude-plugin' / 'plugin.json').read_text())['version']
    fresh = re.sub(r'Versão atual: [0-9.]+', f'Versão atual: {version}', fresh)
    if '--check' in sys.argv:
        if fresh != text:
            print('README.md: a tabela de flags está desatualizada; rode python3 scripts/flags-table.py')
            return 1
        return 0
    readme.write_text(fresh)
    return 0


if __name__ == '__main__':
    sys.exit(main())
