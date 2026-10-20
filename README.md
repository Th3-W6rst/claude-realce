# realce

Plugin (mod) do Claude Code que deixa a tela mais fácil de ler. Cada recurso tem a sua flag e liga ou desliga na hora:

- cores por sentido nas respostas, tabelas, caixas de decisão e risco, diagramas como imagem;
- código com highlighter próprio e diffs com destaque por palavra;
- ferramentas legíveis num relance e um **selo de prova** que diz se o que o Claude afirmou foi testado;
- avisos quando ele termina ou pergunta, e um painel com o uso, a linha do tempo e os arquivos da sessão.

![Demonstração do realce](images/demo.png)

*Gerada pelo próprio mod: `/realce demo` e depois `/realce print`; os números da tabela são só de exemplo. No tema
claro: [demo-claro.png](images/demo-claro.png).*

Versão atual: 0.4.38 · novidades no [CHANGELOG](CHANGELOG.md) · repositório:
[Th3-W6rst/claude-realce](https://github.com/Th3-W6rst/claude-realce) (dúvidas e problemas em *Issues*).

## Requisitos

- **Claude Code 2.1.304 ou mais novo** (`claude --version`), no terminal. No app desktop e no celular o mod só troca
  as marcas do Claude por negrito comum.
- **macOS** para os avisos, o som, o print e os caminhos que abrem no editor. O resto funciona em qualquer sistema.
- **Terminal com cor de 24 bits** (Ghostty, iTerm2, WezTerm, Kitty): `echo $COLORTERM` deve responder `truecolor`.
- **Opcional:** o mermaid-cli, para diagramas e para o PNG do `/realce print` (veja [Diagramas](#diagramas)).

## Instalação

No prompt de uma sessão do Claude Code:

```
/plugin install realce --marketplace Th3-W6rst/claude-realce
```

Responda `y` para adicionar o marketplace e dê Enter no escopo de usuário. Pelo shell, o mesmo:
`claude plugin install realce --marketplace Th3-W6rst/claude-realce`. No app desktop: + ao lado da caixa do prompt,
Plugins, Add marketplace com `Th3-W6rst/claude-realce`, Add plugin.

**Depois de instalar, feche e abra o Claude Code.** Os desenhos já valem na sessão em que você instalou, mas o Claude
só aprende as marcas coloridas na sessão seguinte.

Bom saber antes de usar:

- Vem tudo ligado, menos o modo foco e o som.
- O mod acrescenta ao system prompt um parágrafo curto com as marcas (só as dos recursos ligados).
- Dois recursos usam o Haiku pela sua conta, cerca de mil a dois mil tokens por vez: `erros` (explica um comando que
  falhou, no máximo 20 por sessão) e `explica` (só quando você pede). Desligue com `/realce erros off`.
- `/realce off` pausa tudo; `claude plugin uninstall realce` remove.

Para atualizar: `claude plugin marketplace update claude-realce`, depois `claude plugin update realce@claude-realce`,
e reabra o Claude Code. O `/realce status` avisa quando há versão nova.

## Primeiros passos

1. Rode `/realce diagnostico` para ver o que a sua máquina já tem e o que falta, e `/realce demo` para uma resposta
   com todos os recursos, sem chamar o modelo.
2. `/realce` abre o **painel de flags**. `/realce painel` abre o **painel da sessão**, que também abre sozinho num
   terminal com 144 colunas ou mais.
3. Peça ao Claude: *crie soma.py com uma função soma e um teste pytest, e rode o teste*. Enquanto o teste roda, o
   spinner diz "Rodando os testes" (e, da segunda vez, quanto levou na anterior). A linha que fecha o turno (a
   **régua**: hora, duração, ferramentas) ganha o selo `✔ provado`. Se ele editar e disser que terminou sem testar,
   o selo é `⚠ sem prova`.
4. `/realce ajuda` lista os comandos; `/realce status` mostra o que está ligado.

Um **turno** é uma mensagem sua e tudo o que o Claude faz até responder.

## Comandos

| Comando | O que faz |
|---|---|
| `/realce` | Abre o painel de flags: cada recurso tem uma tecla (letra ou número), os últimos só por Tab e Enter; Esc fecha |
| `/realce ajuda` | Lista os comandos |
| `/realce diagnostico` | Confere o que a sua máquina dá ao realce (versão, cores, macOS, tela cheia, editor, mermaid, Chrome) e o que falta |
| `/realce on` · `/realce off` | Liga ou desliga o mod inteiro, sem perder a escolha de cada flag |
| `/realce <flag> on` · `off` | Liga ou desliga um recurso, por exemplo `/realce coluna off` |
| `/realce painel` | Abre ou fecha o painel da sessão (uso, plano, linha do tempo, fixadas, arquivos, falhas com o porquê, agentes) |
| `/realce copiar` | Copia a última resposta do Claude (as marcas viram markdown comum) |
| `/realce resumo` | Mostra e copia um resumo da sessão em markdown: turnos (hora, duração, selo), testes, arquivos, git, falhas |
| `/realce foco` | Alterna o modo foco, que esconde as ferramentas concluídas sem erro |
| `/realce explica [texto]` | Explica no painel da sessão o texto que você escreveu, ou o trecho selecionado na conversa |
| `/realce fixar` | Fixa no painel a resposta selecionada, ou a última; de novo, desafixa |
| `/realce print` | Salva a última resposta como HTML e PNG no Desktop, nas cores do seu tema |
| `/realce demo` | Mostra uma resposta com todos os recursos, sem chamar o modelo |
| `/realce status` | O que está desligado, tema, tela cheia, avisos, atualização e o custo de cada desenho |

`foco`, `fixar`, `explica`, `print` e `demo` também são flags: `/realce foco` alterna o modo, e `/realce explica off`
desliga o recurso (o comando passa a dizer como religar).

## Recursos e flags

| Grupo | Flag | Recurso | O que faz | Padrão |
|---|---|---|---|---|
| Texto | `enfase` | Ênfase colorida | Marcas do Claude e cores automáticas para números, caminhos e status | ligado |
| Texto | `coluna` | Coluna de leitura | Prosa limitada a 100 colunas | ligado |
| Texto | `callouts` | Callouts | Caixas para decisão, risco, feito, resumo, nota e dica | ligado |
| Texto | `tabelas` | Tabelas coloridas | Cabeçalho em destaque, linhas alternadas, números à direita | ligado |
| Texto | `deltas` | Deltas automáticos | "de 87 para 106" ganha (+19) | ligado |
| Texto | `respiro` | Respiro entre itens | Linha em branco entre itens de lista que quebram linha | ligado |
| Texto | `numeros` | Números humanos | "102761 ms" ganha "(1m 42s)" ao lado | ligado |
| Código | `highlight` | Highlighter próprio | Cores neon em ts, py, sh, json, yaml, swift, sql e diff | ligado |
| Código | `copiar` | Copiar com um clique | Botão copiar em cada bloco de código e nas respostas longas | ligado |
| Código | `dobrar` | Dobrar o que é longo | Blocos com mais de 25 linhas aparecem dobrados | ligado |
| Código | `caminhos` | Caminhos clicáveis | Caminhos abrem no editor, na linha | ligado |
| Código | `diagramas` | Diagramas | Blocos mermaid viram imagem | ligado |
| Ferramentas | `ferramentas` | Ferramentas por categoria | Ícone e cor por tipo; leituras esmaecidas | ligado |
| Ferramentas | `placar` | Placar de testes | Resumo dos testes acima da saída do Bash | ligado |
| Ferramentas | `separador` | Separador de turno | Régua com hora, duração e números do turno | ligado |
| Ferramentas | `agentes` | Cartões de agente | Agente em segundo plano termina num cartão compacto | ligado |
| Ferramentas | `selo` | Selo de prova | A régua do turno diz se o que o Claude afirmou foi testado | ligado |
| Ferramentas | `diff` | Diff legível | Edições com destaque por palavra e números de linha | ligado |
| Ferramentas | `erros` | Erro explicado | Comando que falhou ganha uma frase dizendo por quê (Haiku) | ligado |
| Ferramentas | `commits` | Cartão de commit | Commit, push e PR viram um cartão de uma linha | ligado |
| Ferramentas | `foco` | Modo foco | Esconde as ferramentas concluídas sem erro | desligado |
| Orientação | `pendencias` | Precisa de você | Faixa acima do prompt com o que pede sua decisão | ligado |
| Orientação | `plano` | Progresso do plano | Barra com as tarefas enquanto o Claude trabalha | ligado |
| Orientação | `painel` | Painel ao iniciar | Abre o painel lateral da sessão sozinho | ligado |
| Orientação | `spinner` | Spinner em português | "Pensando", "Escrevendo" e o que roda agora ("Rodando os testes", "Editando x.ts") | ligado |
| Orientação | `avisos` | Aviso quando termina | Notificação do macOS no fim de um turno longo ou numa pergunta | ligado |
| Orientação | `som` | Som nos avisos | Um som curto junto da notificação | desligado |
| Orientação | `ausencia` | Enquanto você estava fora | Resumo do que aconteceu quando você volta a digitar | ligado |
| Orientação | `linha` | Linha do tempo | Os turnos no painel, com clique para rolar até cada um | ligado |
| Orientação | `perguntas` | Cabeçalho de pergunta | Uma linha colorida acima das perguntas do Claude | ligado |
| Orientação | `fixar` | Fixar respostas | /realce fixar guarda uma resposta no painel | ligado |
| Orientação | `explica` | Explica isso | /realce explica explica o trecho selecionado (Haiku) | ligado |
| Orientação | `limite` | Uso e limites | Uso no painel; faixa quando um limite ou o contexto se aproxima do fim | ligado |
| Sistema | `tema` | Segue o tema | Cores para fundo claro, daltônicos e ANSI, pelo tema do Claude Code | ligado |
| Sistema | `print` | Print bonito | /realce print salva a última resposta como imagem | ligado |
| Sistema | `demo` | Demonstração | /realce demo mostra tudo o que o mod faz | ligado |
| Sistema | `atualizacao` | Aviso de atualização | Avisa quando sair versão nova no GitHub | ligado |
| Sistema | `resumo` | Resumo da sessão | /realce resumo copia um resumo da sessão em markdown | ligado |

## Marcas que o Claude passa a usar

| Marca | Sentido | Cor |
|---|---|---|
| `**Rótulo:**` no começo da linha | Subtópico | vermelho |
| `**termo**` no meio da frase | Termo-chave | magenta |
| `==fato==` | O fato mais importante da resposta | marca-texto amarelo |
| `{+texto+}` | Deu certo | verde |
| `{-texto-}` | Deu errado | vermelho sobre vinho |
| `{!texto!}` | Precisa da sua atenção ou decisão; também sobe para a faixa "Precisa de você" acima do prompt | amarelo |
| `> [!DECISÃO] …` | Caixa de decisão (também `RISCO`, `FEITO`, `RESUMO`, `NOTA`, `DICA`) | cor do tipo |

Com o selo ligado, o Claude também sabe que a régua mostra se ele rodou os testes antes de dizer que terminou. Com o
mod desligado, as marcas aparecem como negrito comum. As cores seguem o tema do Claude Code (`/config`): escuro,
claro, daltônico e ANSI, inclusive temas `custom:` pelo campo `base`.

## Diagramas

Opcional. Precisam do mermaid-cli e do navegador headless que ele usa:

```sh
brew install mermaid-cli
npx -y @puppeteer/browsers install chrome-headless-shell@154.0.8037.57 --path ~/.cache/puppeteer
```

A versão do navegador é a que o mermaid-cli 12 pede; se o `mmdc` reclamar de outra, instale a que ele disser. Sem o
`mmdc`, o recurso fica quieto: o Claude não é instruído a desenhar diagramas e os blocos mermaid aparecem como código.
O mesmo navegador gera o PNG do `/realce print`.

## Limitações conhecidas

- **Tela cheia** (`"tui": "fullscreen"` no `~/.claude/settings.json`): rolar até um turno ou uma resposta fixada e
  selecionar um trecho para o `/realce explica` só funcionam com ela; fora dela, o mod avisa.
- **Aviso quando termina:** o Claude Code não diz se a janela está em foco; o aviso sai para turnos de mais de 1
  minuto e perguntas feitas depois de 1 minuto de trabalho. Sem canal de notificação no terminal (tmux,
  Terminal.app), sai pelo banner do macOS.
- **Selo de prova:** testes de um comando em segundo plano não contam; o selo fica em "⚠ sem prova". Entende pytest,
  jest, vitest, bun, mocha, cargo, go test, XCTest, Swift Testing, `node --test`, RSpec e Deno.
- **Régua depois de um agente em segundo plano:** o Claude Code mede o turno que a notificação do agente abre desde o
  seu último prompt, e não só esse turno; a régua dele fica com a duração apenas.
- **Diagrama durante a resposta:** enquanto ela ainda está sendo escrita, o bloco mermaid aparece como código.
- **Pergunta:** o Claude Code não deixa redesenhar o diálogo de pergunta; o mod só põe uma linha acima dele.
- **Cartão de agente:** depende do texto da notificação; num formato que o mod não reconhece, fica o desenho do
  Claude Code.

Desempenho: com o mod ligado, digitar e rolar levam o mesmo tempo que com `/realce off`. Para desenvolver, veja
[CONTRIBUTING](CONTRIBUTING.md).
