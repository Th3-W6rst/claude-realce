# Desenvolvendo o realce

## Rodar e verificar

A cópia instalada é um cache (`~/.claude/plugins/cache/…`): editar a pasta não muda o que está instalado. Para
desenvolver, rode a sessão a partir da pasta, que recarrega a cada edição:

```sh
claude --plugin-dir .                    # sessão com o mod da pasta
claude plugin test .                     # suíte inteira (~6 s)
tsc -p .                                 # tipos (o Claude Code grava .claude-plugin/types ao carregar o mod)
claude plugin validate .                 # o que o Claude Code recusaria ao carregar
python3 scripts/flags-table.py --check   # a tabela de flags do README bate com hooks/flags.ts
```

Mudou uma flag? `python3 scripts/flags-table.py` reescreve a tabela do README.
Mudou o texto da demo? `bun --preload ./scripts/bun-stub.ts scripts/demo-images.ts` redesenha as duas imagens do
README (precisa do mermaid-cli, que traz o Chrome headless).

## Regras da API que derrubam o módulo inteiro

1. Um hook por evento sem matcher no módulo: os eventos compartilhados passam por `hooks/events.ts`, que chama os
   handlers fixos de cada área (`hooks/<área>/events.ts`).
2. `on(...)` só em funções declaradas no topo; `$` só passa para funções `function` (nunca arrow const guardada numa
   lista, num mapa ou num spread).
3. A referência de cada valor de `$.state` é declarada no próprio arquivo que a usa
   (`atom({ plugin: 'realce', key } as const, inicial)`) e no contrato `types/index.d.ts`.
4. Em teste, o stand-in de uma chamada `$` responde `{ value }`; os mocks vêm antes do primeiro `$`; `Text` não aceita
   `key` (use `Box`).
5. Uma variável local chamada `h` quebra o JSX (o factory é `h`).
6. O system prompt de uma sessão em que o mod entrou por hot reload não é recomposto.
7. `ToolUse.isRunning` pode ficar `true` numa chamada já resolvida (um Bash que mexeu em arquivos): o que está
   rodando é `isStillRunning` (`hooks/screen/tools.tsx`), sem `output` ainda.
8. A régua acha as contas do turno pelo `durationMs` (o `TurnDuration` não traz id de turno). No turno que uma
   notificação de agente abre, o `TurnDuration` mede desde o último prompt da pessoa e o `turn.complete` só o turno:
   os dois não batem, e essa régua fica só com a duração.
9. O `$.prompt.submit` do próprio mod não passa pelo hook `prompt.submit` dele: o turno da demo abre no `turn.step`.

## Desempenho

As flags e o ambiente da sessão ficam em memória (lidos uma vez por carga) e nenhum desenho lê ou grava o store,
porque cada leitura inscreveria a linha para redesenhar a cada escrita. Cada linha de ferramenta, grupo, placar e o
parse de cada resposta são memorizados pelo estado da chamada: rolar de volta devolve o desenho pronto. As notas de
commit e de erro ficam num cache do módulo; os diffs por palavra são calculados só para as linhas mostradas. Os tempos
de cada hook de desenho aparecem no `/realce status` e em `~/.cache/realce/perf-<sessão>.json` (a cada 10 s).

A auditoria de latência (tmux + Ghostty): `python3 scripts/audit/drive.py compare <rótulo> <saída.jsonl>` mede com o
mod ligado e com `/realce off`, e religa o mod no fim (o `off` fica gravado na instalação de quem mede).
