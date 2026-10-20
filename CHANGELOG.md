# Novidades do realce

Versões de 19 e 20/10/2026. As que só mudaram coisas internas não aparecem.

## 0.4.36
- `/realce resumo` leva a explicação da última falha, quando o Haiku já respondeu.

## 0.4.35
- O painel da sessão mostra, sob cada falha, a explicação do Haiku assim que ela chega.

## 0.4.34
- Duas ferramentas diferentes em paralelo viram uma frase no spinner: "Lendo e buscando".
- Nomes longos no spinner são cortados sem partir emoji.

## 0.4.33
- "Rodando os testes (última: …)" reconhece o mesmo teste com outro filtro (`pytest -q | tail -1` e
  `cd . && pytest -q 2>&1 | tail -3`).

## 0.4.32
- `/realce resumo` mostra quanto durou cada turno.
- A régua do turno da demo mostra a hora, como as outras.

## 0.4.31
- Um `grep` no fim de uma cadeia (`npm run build && grep -q ok`) não esconde mais uma falha real do build: só conta
  como resposta quando nada mais no comando pode falhar.
- Saída sem código de erro (tempo esgotado, recusa) não conta como resposta.
- O spinner ignora o corpo de heredocs e comentários `#`, e entende `PYTHONPATH=./src pytest` e `2>&1`.
- Modo foco: depois de recarregar o mod, a linha e o resultado de um `grep` sem resultado somem juntos.

## 0.4.30
- Correção da 0.4.29: num grupo dobrado, um `grep` com erro de verdade volta a contar "com erro".

## 0.4.29
- Um `grep` sem resultado, um `test -f` falso ou um `which` que não achou aparecem como resposta ("sem resultado"),
  não como erro, e ficam fora de "Falhas"; com saída 2 (arquivo que não existe) continuam erro.
- Um comando interrompido não conta como falha.
- O spinner nomeia skills ("Carregando a skill …"), a atualização do plano e as ferramentas MCP.

## 0.4.28
- `/realce demo`: o exemplo em amarelo se lê como exemplo ("aprovar o deploy (exemplo)") e a resposta diz que ele
  sobe para a faixa acima do prompt; imagens do README atualizadas.

## 0.4.27
- Enquanto os testes rodam, o spinner diz quanto o mesmo comando levou da última vez: "Rodando os testes (última: 6,2s)".

## 0.4.26
- A linha do tempo mostra o pedido de um plugin (como o `/realce demo`) pelas palavras dele, sem a moldura em inglês.

## 0.4.25
- A régua do turno não mostra "0 arquivos" nem "0 ferramentas".
- A explicação de um erro fala do comando, não de "você", em uma frase curta.
- O spinner reconhece mais comandos de teste (`npm --prefix app test`, `yarn test:unit`, `.venv/bin/python -m pytest`,
  `pnpm vitest run`) e não confunde um commit cuja mensagem cita testes.

## 0.4.24
- "Precisa de você" mantém o código citado no pedido (`@pytest.mark.slow` sumia).
- A explicação de um erro longo quebra recuada, sob ela mesma.

## 0.4.23
- Um comando que termina mexendo em arquivos (um pytest que grava caches) não fica mais com o ícone de "rodando".
- O Claude aprende as marcas de cor com exemplos reais e não escreve mais `{!attention!}` como etiqueta.

## 0.4.22
- O spinner diz o que roda agora: "Rodando os testes", "Editando render.tsx", "Lendo 3 arquivos",
  "Delegando: Revisar o diff".

## 0.4.21
- Selo de prova mais rígido: um documento que cita "12 examples, 0 failures" ou um título "# tests 3" não conta
  mais como teste; o Deno é reconhecido com testes filtrados, passos e tempo em minutos.
- `/realce print` no tema ANSI sai nas cores do tema claro ou escuro.
- `/realce resumo`: avisa quando mostra só os últimos 50 turnos ou as últimas 20 falhas; comandos de várias linhas
  não quebram o markdown; na conversa aparece sem as marcas de markdown.
- O contexto no painel fica amarelo a partir de 90%, como o aviso.
- Rolagem recusada diz o motivo real.

## 0.4.20
- `/realce diagnostico` confere o que a máquina dá ao realce (versão do Claude Code, cor de 24 bits, macOS, tela
  cheia, editor, mermaid-cli, Chrome headless) e diz o que falta instalar.

## 0.4.19
- `/realce explica <texto>` explica o texto escrito, sem precisar selecionar (útil fora da tela cheia).
- O `/realce resumo` lista os últimos dez turnos, cada um com o seu selo.

## 0.4.18
- "1 teste" no singular no resumo e na faixa "Enquanto você estava fora".

## 0.4.17
- Respostas longas ganham um botão "Copiar resposta"; `/realce copiar` copia a última resposta.
- `/realce resumo` mostra e copia um resumo da sessão em markdown (turnos e selos, testes, arquivos, git, falhas),
  pronto para colar num PR ou num relatório.

## 0.4.16
- README reorganizado para quem acabou de instalar: requisitos, custo dos recursos que usam o Haiku, como pausar e
  remover, primeiros passos com um exemplo concreto. O guia de desenvolvimento foi para o [CONTRIBUTING](CONTRIBUTING.md).

## 0.4.15
- Painel de flags com um botão para ligar e desligar o realce inteiro.
- A explicação do `/realce explica` fecha pelo próprio painel.
- `/realce status` conta quantos erros já foram explicados pelo Haiku na sessão (no máximo 20).

## 0.4.14
- Painel da sessão: cada arquivo tocado abre no editor e cada falha rola até o seu comando na conversa.

## 0.4.13
- Temas ANSI: as cores seguem as 16 cores do terminal (antes saíam em tons fixos).

## 0.4.12
- Placar e selo de prova também entendem `node --test`, RSpec e Deno.

## 0.4.11
- O Claude sabe que a régua sela o turno pelos testes, e roda os testes antes de dizer que terminou.
- A dica de boas-vindas cita o `/realce ajuda`.

## 0.4.10
- Painel da sessão com uma linha de uso: contexto e janelas de 5 h e de 7 dias, coloridas pelo quanto já foi usado.

## 0.4.9
- Alerta de limite: o contexto avisa a partir de 90%; a renovação a mais de um dia diz a data; enquanto o Claude
  trabalha, a barra do plano vem antes.
- O aviso pelo macOS nunca atrasa a pergunta do Claude.
- Print: a altura certa mesmo com um diagrama que não virou imagem.

## 0.4.8
- `/realce ajuda` lista os comandos; o status de atualização aponta para este CHANGELOG.

## 0.4.7
- `/realce status` diz se a tela cheia está ligada e o que depende dela.
- `/realce print` funciona com espaços no caminho.

## 0.4.6
- Tema claro: as palavras trocadas do diff com contraste certo.

## 0.4.4
- Aviso de fim de turno pelo banner do macOS quando o terminal não tem canal de notificação (tmux, Terminal.app).
- Painel de flags com uma linha por flag.
- Alerta de limite (flag `limite`): faixa quando a janela de 5 h ou de 7 dias, ou o contexto, se aproxima do fim.
- Números humanos também com a unidade antes do número ("tokens: 73201").

## 0.4.1
16 recursos novos, cada um com a sua flag:
- **Tema:** cores para fundo claro, daltônicos e ANSI, seguindo o tema do Claude Code.
- **Clareza:** selo de prova na régua do turno, diff por palavra, cartão de commit, erro de comando explicado (Haiku).
- **Atenção:** aviso quando um turno longo termina ou o Claude pergunta, som opcional, "Enquanto você estava fora",
  linha do tempo dos turnos no painel, cabeçalho nas perguntas.
- **Leitura:** números humanos, `/realce explica`, `/realce fixar`, `/realce foco`.
- **Sistema:** `/realce print`, `/realce demo`, aviso de atualização.

## 0.3.1
- O Claude passa a ser instruído a desenhar diagramas desde a primeira mensagem.

## 0.3.0
- Todas as flags ligadas por padrão (o modo foco e o som entraram depois, desligados); instalação pelo GitHub.
