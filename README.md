# realce

Mod do Claude Code que deixa a tela mais fácil de ler e de entender: cores por sentido nas respostas, código com
highlighter próprio, ferramentas e turnos legíveis num relance, e uma faixa com o que precisa de você. Cada recurso
tem a sua flag e liga ou desliga na hora.

Feito para o terminal (testado no Ghostty com fundo `#111111`). Nas outras superfícies (desktop, mobile) o mod só
converte as marcas do Claude em negrito comum.

## Instalação

Precisa do Claude Code 2.1.303 ou mais novo (`claude --version`). No prompt de uma sessão no terminal:

```
/plugin install realce --marketplace Th3-W6rst/claude-realce
```

Responda `y` para adicionar o marketplace e escolha o escopo de usuário (o primeiro, com Enter). O mod já vale
nessa sessão e em todas as próximas. Pelo shell, o mesmo:

```sh
claude plugin install realce --marketplace Th3-W6rst/claude-realce
```

No app desktop, onde `/plugin` não roda: clique no + ao lado da caixa do prompt, depois Plugins, Add marketplace com
`Th3-W6rst/claude-realce`, depois Add plugin.

Vem com todos os recursos ligados. `/realce` abre o painel de flags para desligar o que não quiser. As marcas
coloridas chegam ao Claude a partir da primeira sessão aberta depois da instalação.

Para atualizar:

```sh
claude plugin marketplace update claude-realce
claude plugin update realce@claude-realce
```

e reabra o Claude Code.

### O que ajuda a aproveitar

- **Terminal com cor verdadeira (24 bits):** Ghostty, iTerm2, WezTerm, Kitty. Fundo escuro.
- **Editor para os caminhos clicáveis (macOS):** Cursor, VS Code ou Zed, nessa ordem; sem nenhum, o caminho abre como
  `file://`.
- **Painel lateral:** abre sozinho com o terminal a partir de 144 colunas; mais estreito, espera até caber.
- **Diagramas:** veja [Diagramas](#diagramas); sem o `mmdc`, o recurso fica quieto.

## Comandos

| Comando | O que faz |
|---|---|
| `/realce` | Abre o painel de flags: uma letra alterna cada recurso, Esc fecha |
| `/realce on` / `/realce off` | Liga ou desliga tudo, sem perder a escolha de cada flag |
| `/realce <recurso> on\|off` | Liga ou desliga um recurso (`/realce coluna off`) |
| `/realce painel` | Abre ou fecha o painel lateral da sessão |
| `/realce status` | Mostra o que está desligado, se o Claude está recebendo as instruções de leitura, o ambiente lido e quanto tempo cada desenho leva |

## Recursos e flags

| Grupo | Flag | Recurso | Padrão |
|---|---|---|---|
| Texto | `enfase` | Ênfase colorida: marcas do Claude e cores automáticas para números, caminhos e status | ligado |
| Texto | `coluna` | Coluna de leitura: prosa limitada a 100 colunas | ligado |
| Texto | `callouts` | Caixas para decisão, risco, feito, resumo, nota e dica | ligado |
| Texto | `tabelas` | Tabelas coloridas | ligado |
| Texto | `deltas` | "de 87 para 106" ganha (+19) | ligado |
| Texto | `respiro` | Linha em branco entre itens de lista que quebram linha | ligado |
| Código | `highlight` | Highlighter próprio (ts, py, sh, json, yaml, swift, sql, diff) | ligado |
| Código | `copiar` | Copiar com um clique | ligado |
| Código | `dobrar` | Blocos com mais de 25 linhas aparecem dobrados | ligado |
| Código | `caminhos` | Caminhos abrem no editor, na linha | ligado |
| Código | `diagramas` | Blocos mermaid viram imagem | ligado |
| Ferramentas | `ferramentas` | Ícone e cor por tipo de ferramenta | ligado |
| Ferramentas | `placar` | Placar de testes acima da saída do Bash | ligado |
| Ferramentas | `separador` | Régua com hora, duração e números de cada turno | ligado |
| Ferramentas | `agentes` | Cartão compacto quando um agente em segundo plano termina | ligado |
| Orientação | `pendencias` | Faixa "Precisa de você" acima do prompt | ligado |
| Orientação | `plano` | Barra de progresso do plano | ligado |
| Orientação | `painel` | Abrir o painel lateral sozinho ao iniciar | ligado |
| Orientação | `spinner` | Spinner em português | ligado |

## Marcas que o Claude passa a usar

O mod ensina ao Claude (pelo system prompt) um vocabulário curto, e só ensina o que está ligado:

| Marca | Sentido | Cor |
|---|---|---|
| `**Rótulo:**` no começo da linha | Subtópico | vermelho |
| `**termo**` no meio da frase | Termo-chave | magenta |
| `==fato==` | O fato mais importante da resposta | marca-texto amarelo |
| `{+texto+}` | Deu certo | verde |
| `{-texto-}` | Deu errado | vermelho sobre vinho |
| `{!texto!}` | Precisa da sua atenção ou decisão | amarelo |
| `> [!DECISÃO] …` | Caixa de decisão (também `RISCO`, `FEITO`, `RESUMO`, `NOTA`, `DICA`) | cor do tipo |

Com o mod desligado, essas marcas aparecem como negrito comum.

## Diagramas

Precisam do mermaid-cli e do navegador headless que ele usa:

```sh
brew install mermaid-cli
npx -y @puppeteer/browsers install chrome-headless-shell@154.0.8037.57 --path ~/.cache/puppeteer
```

Os PNGs ficam em cache em `~/.cache/realce/diagrams/`. Sem o `mmdc`, o recurso fica quieto: o Claude não é
instruído a desenhar diagramas e os blocos mermaid aparecem como código.

## Desempenho

As flags e o ambiente da sessão ficam em memória (lidos uma vez por carga) e nenhum desenho lê ou grava o store,
porque cada leitura inscreveria a linha para redesenhar a cada escrita. Cada linha de ferramenta, grupo, placar e o
parse de cada resposta são memorizados pelo estado da chamada: rolar de volta devolve o desenho pronto. Os hooks só
recebem as ferramentas que o mod desenha (o placar, só resultados de Bash). Os tempos de cada hook de desenho aparecem no
`/realce status` e em `~/.cache/realce/perf-<sessão>.json` (atualizado a cada 10 s).

## Limitações conhecidas

- **Mod carregado no meio da sessão (hot reload):** o motor mantém o system prompt montado no início da sessão,
  então as marcas só chegam ao Claude a partir da próxima sessão. Os desenhos valem na hora.
- **Diagrama durante o streaming:** enquanto a resposta ainda está sendo escrita, o bloco mermaid aparece como
  código; a imagem entra quando a resposta é gravada. Diagramas de respostas antigas são gerados ao carregar o mod.
- **Painel lateral:** a lista de agentes mostra "desde HH:MM" (o painel só redesenha quando algo muda).
- **Cartão de agente:** depende do texto da notificação; num formato que o mod não reconhece, fica o desenho do
  Claude Code.

## Desenvolvimento

A cópia instalada é um cache (`~/.claude/plugins/cache/…`): editar a pasta não muda o que está instalado. Para
desenvolver, rode a sessão a partir da pasta, que recarrega a cada edição:

```sh
claude --plugin-dir .      # sessão com o mod da pasta
claude plugin test .       # suíte inteira (~2 s)
tsc -p .                   # tipos (o motor grava .claude-plugin/types ao carregar o mod)
claude plugin validate .   # o que o motor recusaria ao carregar
```

Regras do motor que derrubam o módulo inteiro se violadas:

1. Um hook por evento sem matcher no módulo: os eventos compartilhados passam por `hooks/events.ts`, que chama os
   handlers fixos de cada área (`hooks/<área>/events.ts`).
2. `on(...)` só em funções declaradas no topo; `$` só passa para funções `function` (nunca arrow const, lista ou
   spread).
3. A referência de cada valor de `$.state` é declarada no próprio arquivo que a usa
   (`atom({ plugin: 'realce', key } as const, inicial)`).
4. Em teste, o stand-in de uma chamada `$` responde `{ value }`; os mocks vêm antes do primeiro `$`; `Text` não aceita
   `key` (use `Box`).
5. Uma variável local chamada `h` quebra o JSX (o factory é `h`).
6. O system prompt de uma sessão em que o mod entrou por hot reload não é recomposto.

A auditoria de latência (tmux + Ghostty): `python3 scripts/audit/drive.py`.
