# realce

Mod do Claude Code que deixa a tela mais fácil de ler e de entender: cores por sentido nas respostas, código com
highlighter próprio, diffs por palavra, ferramentas e turnos legíveis num relance, um selo que diz se o que o Claude
afirmou foi testado, avisos quando ele termina ou pergunta, e um painel com a linha do tempo da sessão. Cada um dos 37
recursos tem a sua flag e liga ou desliga na hora.

![Demonstração do realce](images/demo.png)

*A imagem foi gerada pelo próprio mod: `/realce demo` e depois `/realce print`. A mesma resposta no tema claro:
[demo-claro.png](images/demo-claro.png).*

Feito para o terminal (testado no Ghostty com fundo `#111111`). Nas outras superfícies (desktop, mobile) o mod só
converte as marcas do Claude em negrito comum.

## Instalação

Precisa do Claude Code 2.1.304 ou mais novo (`claude --version`). No prompt de uma sessão no terminal:

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

Vem com todos os recursos ligados, menos o modo foco e o som. `/realce` abre o painel de flags; `/realce demo` mostra
o que cada um faz. As marcas
coloridas chegam ao Claude a partir da primeira sessão aberta depois da instalação.

O que muda em cada versão está no [CHANGELOG](CHANGELOG.md). Para atualizar:

```sh
claude plugin marketplace update claude-realce
claude plugin update realce@claude-realce
```

e reabra o Claude Code.

### Primeiros passos

1. Numa sessão nova, rode `/realce demo`: uma resposta com todos os recursos, sem chamar o modelo.
2. `/realce` abre o painel de flags; `/realce painel`, o painel da sessão (abre sozinho com 144 colunas ou mais).
3. Peça ao Claude algo que edite e teste: a régua do fim do turno diz `✔ provado`, `⚠ sem prova` ou
   `✖ afirmou com testes falhando`.
4. `/realce status` mostra o tema, o que está desligado, avisos, atualização e quanto cada desenho custa.

### O que ajuda a aproveitar

- **Terminal com cor verdadeira (24 bits):** Ghostty, iTerm2, WezTerm, Kitty. Fundo escuro.
- **Editor para os caminhos clicáveis (macOS):** Cursor, VS Code ou Zed, nessa ordem; sem nenhum, o caminho abre como
  `file://`.
- **Painel lateral:** abre sozinho com o terminal a partir de 144 colunas; mais estreito, espera até caber.
- **Tema:** as cores seguem o tema do Claude Code (`/config`): escuro, claro, daltônico e ANSI, inclusive temas
  `custom:` pelo campo `base`.
- **Tela cheia** (`"tui": "fullscreen"` no `~/.claude/settings.json`): para rolar pela linha do tempo e pelas
  fixadas e selecionar trechos para o `/realce explica`.
- **Diagramas:** veja [Diagramas](#diagramas); sem o `mmdc`, o recurso fica quieto.

## Comandos

| Comando | O que faz |
|---|---|
| `/realce` | Abre o painel de flags: os 36 primeiros recursos têm a sua tecla (letra ou número), Tab e Enter alcançam todos, Esc fecha |
| `/realce ajuda` | Lista os comandos |
| `/realce on` / `/realce off` | Liga ou desliga tudo, sem perder a escolha de cada flag |
| `/realce <recurso> on\|off` | Liga ou desliga um recurso (`/realce coluna off`) |
| `/realce painel` | Abre ou fecha o painel lateral da sessão (uso, plano, linha do tempo, fixadas, arquivos, falhas, agentes) |
| `/realce foco` | Liga ou desliga o modo foco: esconde as ferramentas concluídas sem erro |
| `/realce explica` | Explica no painel o trecho selecionado na conversa (Haiku) |
| `/realce fixar` | Fixa no painel a resposta selecionada, ou a última; de novo, desafixa |
| `/realce print` | Salva a última resposta como HTML e PNG no Desktop, nas cores do tema |
| `/realce demo` | Mostra uma resposta com todos os recursos, sem chamar o modelo |
| `/realce status` | Mostra o que está desligado, o tema, se o Claude recebe as instruções de leitura, o ambiente, avisos e atualização, e quanto cada desenho leva |

## Recursos e flags

| Grupo | Flag | Recurso | Padrão |
|---|---|---|---|
| Texto | `enfase` | Ênfase colorida: Marcas do Claude e cores automáticas para números, caminhos e status | ligado |
| Texto | `coluna` | Coluna de leitura: Prosa limitada a 100 colunas | ligado |
| Texto | `callouts` | Callouts: Caixas para decisão, risco, feito, resumo, nota e dica | ligado |
| Texto | `tabelas` | Tabelas coloridas: Cabeçalho em destaque, linhas alternadas, números à direita | ligado |
| Texto | `deltas` | Deltas automáticos: "de 87 para 106" ganha (+19) | ligado |
| Texto | `respiro` | Respiro entre itens: Linha em branco entre itens de lista que quebram linha | ligado |
| Texto | `numeros` | Números humanos: "102761 ms" ganha "(1m 43s)" ao lado | ligado |
| Código | `highlight` | Highlighter próprio: Cores neon em ts, py, sh, json, yaml, swift, sql e diff | ligado |
| Código | `copiar` | Copiar com um clique: Botão copiar em cada bloco de código | ligado |
| Código | `dobrar` | Dobrar o que é longo: Blocos com mais de 25 linhas aparecem dobrados | ligado |
| Código | `caminhos` | Caminhos clicáveis: Caminhos abrem no editor, na linha | ligado |
| Código | `diagramas` | Diagramas: Blocos mermaid viram imagem | ligado |
| Ferramentas | `ferramentas` | Ferramentas por categoria: Ícone e cor por tipo; leituras esmaecidas | ligado |
| Ferramentas | `placar` | Placar de testes: Resumo dos testes acima da saída do Bash | ligado |
| Ferramentas | `separador` | Separador de turno: Régua com hora, duração e números do turno | ligado |
| Ferramentas | `agentes` | Cartões de agente: Agente em segundo plano termina num cartão compacto | ligado |
| Ferramentas | `selo` | Selo de prova: A régua do turno diz se o que o Claude afirmou foi testado | ligado |
| Ferramentas | `diff` | Diff legível: Edições com destaque por palavra e números de linha | ligado |
| Ferramentas | `erros` | Erro explicado: Comando que falhou ganha uma frase dizendo por quê (Haiku) | ligado |
| Ferramentas | `commits` | Cartão de commit: Commit, push e PR viram um cartão de uma linha | ligado |
| Ferramentas | `foco` | Modo foco: Esconde as ferramentas concluídas sem erro | desligado |
| Orientação | `pendencias` | Precisa de você: Faixa acima do prompt com o que pede sua decisão | ligado |
| Orientação | `plano` | Progresso do plano: Barra com as tarefas enquanto o Claude trabalha | ligado |
| Orientação | `painel` | Painel ao iniciar: Abre o painel lateral da sessão sozinho | ligado |
| Orientação | `spinner` | Spinner em português: "Pensando", "Escrevendo", "Executando" | ligado |
| Orientação | `avisos` | Aviso quando termina: Notificação do macOS no fim de um turno longo ou numa pergunta | ligado |
| Orientação | `som` | Som nos avisos: Um som curto junto da notificação | desligado |
| Orientação | `ausencia` | Enquanto você estava fora: Resumo do que aconteceu quando você volta a digitar | ligado |
| Orientação | `linha` | Linha do tempo: Os turnos no painel, com clique para rolar até cada um | ligado |
| Orientação | `perguntas` | Cabeçalho de pergunta: Uma linha colorida acima das perguntas do Claude | ligado |
| Orientação | `fixar` | Fixar respostas: /realce fixar guarda uma resposta no painel | ligado |
| Orientação | `explica` | Explica isso: /realce explica explica o trecho selecionado (Haiku) | ligado |
| Orientação | `limite` | Uso e limites: Uso no painel; faixa quando um limite ou o contexto se aproxima do fim | ligado |
| Sistema | `tema` | Segue o tema: Cores para fundo claro, daltônicos e ANSI, pelo tema do Claude Code | ligado |
| Sistema | `print` | Print bonito: /realce print salva a última resposta como imagem | ligado |
| Sistema | `demo` | Demonstração: /realce demo mostra tudo o que o mod faz | ligado |
| Sistema | `atualizacao` | Aviso de atualização: Avisa quando sair versão nova no GitHub | ligado |

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
parse de cada resposta são memorizados pelo estado da chamada: rolar de volta devolve o desenho pronto. A linha de
ferramenta passa por todas as chamadas (o modo foco esconde qualquer uma), mas só desenha as que conhece: as outras
saem do hook sem trabalho. Os diffs por palavra são calculados só para as linhas mostradas. Os tempos de cada hook de
desenho aparecem no `/realce status` e em `~/.cache/realce/perf-<sessão>.json` (atualizado a cada 10 s).

Na auditoria da 0.4 (tmux, tela cheia, 200 × 50), digitar e rolar levam o mesmo tempo com o mod ligado e com
`/realce off`, a diferença dentro do ruído de 1 ms.

## Limitações conhecidas

- **Mod carregado no meio da sessão (hot reload):** o motor mantém o system prompt montado no início da sessão,
  então as marcas só chegam ao Claude a partir da próxima sessão. Os desenhos valem na hora.
- **Diagrama durante o streaming:** enquanto a resposta ainda está sendo escrita, o bloco mermaid aparece como
  código; a imagem entra quando a resposta é gravada.
- **Tela cheia:** rolar até um turno ou uma resposta fixada (painel) e selecionar um trecho para `/realce explica`
  só funcionam com a transcrição em tela cheia; fora dela, o mod avisa.
- **Aviso quando termina:** o motor não diz se a janela está em foco; o aviso sai para turnos de mais de 1 minuto
  e perguntas feitas depois de 1 minuto de trabalho. A notificação usa o canal configurado no Claude Code
  (`preferredNotifChannel`); o som (`som`) usa os sons do macOS.
- **Erro explicado e Explica isso:** usam o Haiku pela sua conta (cerca de mil a dois mil tokens por explicação);
  no máximo 20 explicações automáticas de erro por sessão, nunca do mesmo erro duas vezes, e nunca para falhas
  que são respostas (`grep` sem resultado, `test`, `diff`).
- **Selo de prova:** testes de um comando em segundo plano não contam; o selo fica em "⚠ sem prova".
- **Print:** o PNG precisa do Chrome headless que o mermaid-cli instala (veja Diagramas) ou do Google Chrome;
  sem ele, fica o HTML.
- **Pergunta redesenhada:** o motor não deixa redesenhar o diálogo; o mod só põe uma linha acima dele.
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
