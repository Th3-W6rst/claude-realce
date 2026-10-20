"""Rewrites README.md's "Features and flags" table from hooks/flags.ts and its "Current version" from plugin.json, so
the README never drifts from the code.

  python3 scripts/flags-table.py          rewrite the table
  python3 scripts/flags-table.py --check  exit 1 when the README's table is out of date
"""
import json
import pathlib
import re
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
QUOTED = r"'((?:[^'\\]|\\.)*)'|\"((?:[^\"\\]|\\.)*)\""
FLAG = re.compile(
    r"\{ id: '(\w+)', alias: '(\w+)', group: '(\w+)', label: \{ en: (?:" + QUOTED + r"), pt: (?:" + QUOTED + r") \}, "
    r"description: \{ en: (?:" + QUOTED + r"), pt: (?:" + QUOTED + r") \}, isDefaultOn: (true|false) \}"
)


def unquote(text: str) -> str:
    return re.sub(r"\\(.)", r"\1", text)


def table() -> str:
    source = (ROOT / 'hooks' / 'flags.ts').read_text()
    # The groups' English names, as the flags pane shows them.
    labels = re.search(r'GROUP_LABELS[^=]*= \{([\s\S]*?)\n\}', source).group(1)
    groups = dict(re.findall(r"^\s+(\w+): \{ en: '([^']+)'", labels, re.M))
    ids = re.findall(r"'(\w+)'", re.search(r'export type FlagId =([\s\S]*?)\n\n', source).group(1))
    rows = []
    for m in FLAG.finditer(source):
        flag_id, alias, group = m.group(1), m.group(2), m.group(3)
        label = unquote(m.group(4) or m.group(5) or '')
        description = unquote(m.group(8) or m.group(9) or '')
        rows.append((group, alias, flag_id, label, description, m.group(12)))
    # A flag whose line this pattern no longer matches would drop out of the table unseen: every id must be there.
    missing = sorted(set(ids) - {r[2] for r in rows})
    if missing:
        raise SystemExit(f'scripts/flags-table.py: no table row for {", ".join(missing)}; is the FLAGS line written as the pattern expects?')
    rows.sort(key=lambda r: list(groups).index(r[0]))
    lines = ['| Group | Flag | Feature | What it does | Default |', '|---|---|---|---|---|']
    for group, alias, flag_id, label, description, is_on in rows:
        name = f'`{alias}`' if alias == flag_id else f'`{alias}` (`{flag_id}`)'
        lines.append(f"| {groups[group]} | {name} | {label} | {description.replace('|', chr(92) + '|')} | {'on' if is_on == 'true' else 'off'} |")
    return '\n'.join(lines) + '\n'


def main() -> int:
    readme = ROOT / 'README.md'
    text = readme.read_text()
    lines = text.split('\n')
    # The table is the run of '|' lines that opens with the header, inside the "Features and flags" section.
    section = lines.index('## Features and flags')
    first = next(i for i in range(section, len(lines)) if lines[i].startswith('| Group |'))
    last = first
    while last + 1 < len(lines) and lines[last + 1].startswith('|'):
        last += 1
    fresh = '\n'.join(lines[:first] + table().rstrip('\n').split('\n') + lines[last + 1 :])
    version = json.loads((ROOT / '.claude-plugin' / 'plugin.json').read_text())['version']
    fresh = re.sub(r'Current version: [0-9.]+', f'Current version: {version}', fresh)
    if '--check' in sys.argv:
        if fresh != text:
            print('README.md: the flags table is out of date; run python3 scripts/flags-table.py')
            return 1
        return 0
    readme.write_text(fresh)
    return 0


if __name__ == '__main__':
    sys.exit(main())
