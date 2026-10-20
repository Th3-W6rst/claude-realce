# Novidades do realce

## 0.4.9
- Alerta de limite: o contexto avisa a partir de 90% (as janelas de uso, de 80%); a renovação a mais de um dia diz a
  data; ocultar vale só para aquela fonte; enquanto o Claude trabalha, a barra do plano vem antes.
- Aviso pelo macOS fora do caminho da pergunta (nunca a atrasa) e com textos que começam com "-".
- Print: a altura conta como código um diagrama que não virou imagem; caminhos com `#` e `?`.
- Números humanos: um timestamp em ms não vira duração.
- A flag `limite` não muda mais a tecla das outras.

## 0.4.8
- `/realce ajuda` lista os comandos.
- O status de atualização aponta para este CHANGELOG.
- Tela cheia descrita pelo setting do Claude Code (`"tui": "fullscreen"`); README com a demo também no tema claro.

## 0.4.7
- `/realce status` diz se a tela cheia está ligada e o que depende dela.
- `/realce print` funciona com espaços no caminho.

## 0.4.6
- Tema claro: as palavras trocadas do diff usam a cor de texto do tema sobre o fundo de palavra (contraste).
- Cartões de agente mais baratos de desenhar.
- README com "Primeiros passos".

## 0.4.4
- Aviso de fim de turno pelo banner do macOS quando o terminal não dá canal de notificação ao Claude Code (tmux,
  Terminal.app).
- Painel de flags com uma linha por flag, nas cores do tema.
- Alerta de limite (flag `limite`): faixa quando a janela de 5 h ou de 7 dias, ou o contexto, passa de 80%.
- Números humanos também com a unidade antes do número ("tokens: 73201").
- Print com a altura certa para diagramas; README com a imagem da demonstração.

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
- Todas as flags ligadas por padrão; instalação pelo GitHub.
