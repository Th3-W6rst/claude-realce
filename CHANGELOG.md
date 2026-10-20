# Novidades do realce

Versões de 19 e 20/10/2026. As que só mudaram coisas internas não aparecem.

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
