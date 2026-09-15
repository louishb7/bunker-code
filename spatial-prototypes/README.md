# Spatial prototypes — Peneira 1

Três experimentos descartáveis. Nenhum substitui o Explorer ou é arquitetura
oficial. A avaliação humana ainda não foi realizada.

## Iniciar

Na raiz do repositório, com as dependências existentes instaladas:

```sh
node --import tsx spatial-prototypes/serve.ts atlas
node --import tsx spatial-prototypes/serve.ts hyperbolic
node --import tsx spatial-prototypes/serve.ts icicle
```

Portas respectivas: 5181, 5182, 5183, somente `127.0.0.1`. Cada comando imprime
o endereço completo. Um único servidor também abre as três candidatas pelos
links do cabeçalho. O seletor Projeto alterna BunkerCode, Cadisk e BunkerMode
sem editar configuração. Reinicie o servidor após editar código; não há HMR.

Exemplo: `http://127.0.0.1:5181/?candidate=atlas&project=bc`.

## Dados congelados

Os mesmos bytes originais estão em `.snapshots/`, ignorados pelo Git para não
versionar dados dos projetos externos. Os hashes completos estão em
`snapshots.ts`, são verificados pelo servidor e novamente pelo browser.
O browser reconstrói os mesmos ProjectGraph/ProjectStructure através das
funções atuais, sem analisar o filesystem. A geografia atual é importada sem
alteração; nenhum componente visual de produção é carregado.

| ID | Projeto | Arquivos | Prefixo SHA-256 |
| --- | --- | ---: | --- |
| bc | BunkerCode | 66 | db0f8d3085f5c8d3 |
| cadisk | Cadisk backend | 74 | c5933328eb5de48a |
| bm | BunkerMode API | 36 | df947950a674b6a0 |

São os snapshots salvos na auditoria, não análises novas. Para reconstruir as
cópias locais a partir dos originais ainda disponíveis:

```sh
node --import tsx spatial-prototypes/freeze.ts
```

O comando aceita uma pasta alternativa contendo
`bunkercode-cartography-{bc,cadisk,bm}/snapshot.json`. Falha se o hash divergir;
não regenera dados nem sobrescreve silenciosamente um snapshot. Um clone novo
precisa receber esses arquivos locais; os hashes não permitem reconstruí-los.

## Uso

- Clique ou Enter em região: entrar diretamente. Em arquivo: focar arquivo.
- Shift+clique ou Espaço sobre landmark: selecionar para Uses/Used by.
- Pai ou Backspace no mapa: pai factual. System ou Home: macro.
- Tab percorre controles/landmarks. Após entrar, o foco de teclado volta ao
  mapa; Tab continua nos seus locais. Breadcrumbs preservam ancestrais/packages.
- Atlas: roda e +/− fazem zoom contínuo; arrastar e setas fazem pan.
- Hiperbólico: clicar muda foco; arrastar desloca a projeção do disco; roda ou
  +/− amplia o disco. Recentrar foco restaura sua posição canônica.
- Icicle: clique altera foco/janela de profundidade; roda ou +/− fazem zoom X;
  arrastar ou setas esquerda/direita fazem pan X.
- Relations: azul Uses, verde Used by, roxo ambos; painel lista os destinos
  agregados na resolução lógica. Clique num destino para localizá-lo.

F = arquivo, diretamente no pai informado. P = workspace package na mesma
localização da região. Títulos nativos e painel mostram caminho completo e pai.
Contagens são dependencies estáticas observadas; não são runtime ou importância.
Repouso não tem linhas de dependency. Linhas no disco significam containment.

## Implementações mínimas

**A — atlas:** partição binária recursiva com peso raiz quadrada do número de
arquivos e mínimo 1 para regiões vazias. Coordenadas calculadas uma vez por
snapshot. O zoom testa dimensões projetadas do pai e filhos para trocar a
partição; câmera não move nenhum endereço. Clique enquadra a região e assegura
limiar mínimo para revelar filhos. Canvas desenha áreas, DOM fornece controles.
O custo observado em `explorer-web/src` são células estreitas e nomes quebrados;
zoom adicional/foco no arquivo permite ler o nome completo. Não há repacking.

**B — hiperbólico:** posições recursivas no disco unitário, translações de Möbius
para centralizar foco, projeção elíptica fixa na tela. A partição segue o caminho
focado; irmãos permanecem representantes de contexto. Nenhum force layout.
Colisões de labels suprimem texto, mantendo alvo e título nativo. Isso é uma
limitação registrada, não resolvida por uma lista estrutural paralela.

**C — icicle:** intervalos recursivos canônicos; Y é profundidade real, janela
de quatro faixas. Intervalos filhos permanecem contidos no pai. Folhas terminam
no próprio nível, sem níveis inventados. SVG/foreignObject fornece nomes e
alvos de teclado. Muitos irmãos produzem faixas estreitas: registrar o custo
de leitura no Cadisk, sem converter faixas em cards.

Não foram instaladas dependências. Canvas, SVG e DOM são APIs do browser;
esbuild/tsx/TypeScript e puppeteer-core já pertenciam às ferramentas do repo.
Os algoritmos são próprios do experimento. Não há React, React Flow, D3,
WebGL ou biblioteca nova no bundle de produção.

## Equivalência e instrumentação

`facts.ts` deriva uma única localização por região e faceta package. Cada
renderer deriva uma partição global, inclusive fora da câmera; o projector
existente rejeita ownership ausente/duplicado e mantém edges originais.
Os estados de câmera não mudam boundary. Regiões ancestrais desenhadas como
contexto não ganham ownership extra. Resoluções diferentes podem agregar
destinos diferentes, mas recebem exatamente o mesmo grafo factual.

A barra inferior registra último evento, foco, projeto, representantes e tempo
input→próximo callback de requestAnimationFrame. **É uma aproximação de feedback,
não medição física de pintura/display.** Exportar sessão JSON inclui:

- candidato/projeto/hash;
- ação e timestamp monotônico;
- foco, seleção, câmera;
- alteração de foco/partição;
- pan/zoom/recenter sem alteração estrutural;
- duração até rAF.

Eventos de roda e movimento são registrados individualmente, não agrupados
automaticamente em gestos humanos. Limite de 10.000 eventos; descartes aparecem
explicitamente no export. Trocar projeto/candidata recarrega a página: exporte
antes. Zerar sessão reinicia a coleta. Nenhuma telemetria sai da máquina.

## Validação e capturas

```sh
./node_modules/.bin/tsc -p spatial-prototypes/tsconfig.json
node --import tsx spatial-prototypes/verify.ts
# Com servidor na porta 5181:
node --import tsx spatial-prototypes/capture.ts
```

O último comando usa Firefox instalado e viewport 1440×900; grava em
`captures/`, também ignorado pelo Git. Testa entradas por mouse/teclado, Pai,
arquivo, relações, System e os percursos obrigatórios. `measurements.json`
registra estado, câmera, ownership e limitações de rótulos por captura.

Capturas observadas nesta rodada: 33 imagens (11 por candidata), incluindo
macro dos três projetos, graph-engine, explorer-web/src, Cadisk auth/case/user,
BunkerMode auth e arquivo com relações. O contador de labels do hiperbólico
aponta 5 filhos sem texto em Cadisk macro e 22 em explorer-web/src. O contador
do icicle aponta 5 filhos com largura limitada em Cadisk macro e 36 em
explorer-web/src. O contador do icicle estima espaço de uma linha; texto
quebrado ainda pode ser legível, portanto não representa taxa humana de erro.
No hiperbólico, texto omitido e alvos sobrepostos/periféricos enfraquecem a
hipótese de reconhecimento imediato; títulos nativos não equivalem a nomes
simultaneamente visíveis. Não foi adicionada outra interface para contornar isso.

Limites conhecidos: atlas exige mais zoom para nomes longos em regiões densas;
hiperbólico ainda comprime excessivamente vizinhos e usa segmentos retos para
containment (as posições e mudanças de foco usam o disco hiperbólico); icicle
estreita folhas sob alto fanout. Nenhum resultado escolhe uma vencedora.

`verify.ts` verifica hashes, determinismo sob reordenação de fatos, containment
geométrico, folhas no nível/pai correto, centralização hiperbólica, package
vazio e conservação de todos os edges internos em 675 estados. São verificações
próprias porque testes de produção não conhecem as três geometrias/partições.
Nenhum teste de produção foi alterado.

Os ensaios não demonstram usabilidade, profundidade extrema ou escalabilidade
universal. O snapshot BunkerMode é caso de nesting visual. As três representações
são como planta, lente e corte do mesmo prédio: verificar que todas preservam
as salas é necessário, mas só percorrê-las revela qual orientação ajuda você.
A próxima decisão é avaliação humana da Peneira 1; evidence completa é Peneira 2.
