# Peneira 2 — especificações e relatório experimental

Decisão humana: Atlas e Icicle rejeitados; H0 merece investigação, mas não é
aceitável. Nenhuma candidata adotada. H0, seu CSS e suas funções de harness
permanecem intactos. A nova entrada de Peneira 2 reutiliza apenas as funções
existentes, sem mudar a aparência ou interação do controle.

## Diagnóstico de H0

A partição lógica já agrega subárvores periféricas. O renderer entretanto
desenha a união de representantes e ancestrais, liga todas as relações de
containment desse recorte, e transforma labels sem espaço em pequenos símbolos.
Não é dependency spaghetti: dependencies estão ausentes em repouso. As capturas
da Peneira 1 mostram 5 filhos sem label no Cadisk macro e 22 em explorer-web/src.
Há também texto truncado dentro de labels considerados visíveis pelo contador.

## H1 — Hyperbolic Skeleton

Hipótese: preservar uma estrutura de caminho → foco → filhos, com contexto
distante comprimido em acessos nomeados, oferece orientação com menos ruído.

- Visível: foco dominante; pai; filhos imediatos em um leque com slots legíveis;
  até dois irmãos; raiz/caminho e um resumo das branches distantes.
- Agregado: demais irmãos num acesso ao pai; branches distantes num acesso ao
  ancestral real; filhos excedentes numa janela explícita do mesmo pai.
- Navegação: clique/Enter entra; Pai/Backspace volta; System/Home retorna. Acesso
  “mais filhos” troca a janela sem inventar uma região. PageDown/PageUp equivalem.
- Ancestry: caminho nomeado no mapa e breadcrumb; linhas somente pai–foco e
  ramificação dos filhos atuais. Nenhuma árvore periférica de linhas.
- Siblings: faixa periférica subordinada; nomes canônicos, sem ranking por edges.
- Labels: foco/pai primeiro, filhos depois, dois irmãos e resumos por último;
  no máximo 10 filhos por janela, nome completo com espaço vertical para quebra.
- Diferença de H0: slots de leitura substituem compressão de texto; os filhos
  são ordenados angularmente pela geometria hiperbólica de H0, mas projetados
  num leque legível. Não é mais uma isometria pura da câmera de H0.
- Risco: fanout vira troca de janela; o esqueleto pode parecer rígido demais.

## H2 — Foveated Hyperbolic / Semantic Rings

Hipótese: posições com função previsível reduzem a necessidade de interpretar
cada linha para distinguir filhos, irmãos e retorno.

- Visível: foco central; até oito filhos em elipse interna; até dois irmãos em
  contexto superior; pai e caminho na margem externa; resumo distante.
- Agregado: contexto distante por ancestral; irmãos restantes no pai; filhos
  restantes em setores/janelas navegáveis, com contagem explícita.
- Navegação: clique/Enter entra; Pai/Backspace e System/Home; mudar setor no mapa
  ou PageDown/PageUp. Sem pan/zoom corretivos obrigatórios.
- Ancestry/siblings: zonas distintas rotuladas, além do caminho completo.
- Labels: filhos nomeados nos oito slots, sem mininodes; foco e pai sempre
  rotulados. Não desenhar linhas individuais no anel de filhos: zona comunica
  pertencimento, com a legenda explícita “filhos diretos de [foco]”.
- Diferença de H0: papel estrutural determina zona, não só distância deformada.
  Não pretende ser hiperbólico matematicamente puro.
- Risco: aprender zonas e visitar setores pode custar mais que H0.

## H3 — Panorama de acessos

**HYPOTHESIS:** trocar “sistema visto de fora” por “estou aqui e posso entrar
nesses lugares” pode superar H0/H1/H2. O usuário gira sua vista ao redor dos
acessos do foco, mantendo retorno e contexto imóveis. Reduzir o campo de visão
preserva tamanho dos nomes sem usar espaço preenchido, árvore ou anéis vistos
de cima. É um panorama 2.5D, com rótulos frontais e câmera restrita a um eixo.

- Visível: nome do foco acima do horizonte; cinco acessos frontais no máximo,
  na ordem canônica dos filhos, em slots angulares relativos à vista; pai como saída de retorno;
  dois irmãos como destinos laterais e caminho no alto.
- Agregado: a porção não vista do panorama tem contagem e intervalo; não desenhar
  marcas individuais sem nome. Demais siblings/branches têm acessos ao pai/raiz.
- Navegação: entrar por clique/Enter; girar por roda horizontal/vertical,
  arraste, botões ou setas. Voltar não exige girar: Pai/Backspace é sempre visível.
- Ancestry/siblings: saída fixa para pai, caminho integral e dois destinos irmãos
  separados dos acessos dos filhos. Nenhuma dependency determina direção.
- Labels: cinco nomes grandes por vista; texto nunca inclinado. Altura/projeção
  de portais indica orientação da vista, não importância, papel ou profundidade
  arquitetural. Arquivos recebem marca F, packages P, mesma localização factual.
- Risco: alta exploração serial e custo de rotação; ausência de comparação global.
  Se falhar, registrar; não adicionar minimapa/árvore/lista que substitua a hipótese.

## Contrato comum e validação planejada

As três usam os mesmos hashes, ProjectGraph, ProjectStructure e focusedPartition.
Uma janela de desenho NÃO muda a partição nem ownership. Os agregados de UI
carregam IDs membros explícitos da partição e destino factual; não são módulos,
arquivos ou novos endpoints de dependency. A união de locais desenhados e IDs
de agregados deve cobrir cada representante ativo exatamente uma vez. Contextos
decorativos não entram nessa contagem. Packages vazios entram mesmo sem arquivos.
Seleção realça também agregados que contêm destinos; lista Uses/Used by continua
com os IDs factuais originais. Clique em relation target pode focá-lo diretamente.

Sem novas dependências: SVG/DOM bastam para slots, curvas, zonas e perspectiva
restrita. Nenhuma razão medida para WebGL. Geometrias separadas, pequena camada
comum para botões, facts e coleta; nenhum framework de visualização.

Antes da entrega: typecheck protótipos/workspace, pnpm test, verify ampliado para
as janelas/agrupamentos e browser dos quatro candidatos nos três snapshots.
Capturas em 1440×900. Medir entidades (locais + agregados), labels, contexto sem
label, IDs representados nos agregados, overlap/corte de texto e eventos. Contar
troca de janela/giro separadamente de entrar/voltar; reduzir entidades não prova
menor custo de navegação. Correções humanas só podem ser medidas no uso humano.

Baseline SHA-256:

- H0 model: `5192cbf5eda1c13f280ae8954cb672c1ad80cc655f59c74a3813f6539429212d`
- H0 view: `d6da9f323e293906ba2ea9ba61c11de24104590f87f03a2bea082dd1a9723d11`
- bench: `fb1104687abcb3870be12618081212e7bef56d5e7b4056952243886e0fccc8fc`
- CSS Peneira 1: `79d8ee4c299d5da41460dbb0507264ff278934f4aede765567b5a589d4328d73`

## Executar e comparar

Na raiz do repositório, quatro comandos independentes:

```bash
node --import tsx spatial-prototypes/serve.ts hyperbolic
node --import tsx spatial-prototypes/serve.ts hyperbolic-skeleton
node --import tsx spatial-prototypes/serve.ts hyperbolic-foveated
node --import tsx spatial-prototypes/serve.ts wildcard
```

Portas 5182/5184/5185/5186, respectivamente. Abra a URL completa impressa pelo
comando. Basta um servidor: suas URLs aceitam os quatro valores de `candidate`,
e as novas entradas têm links H0/H1/H2/H3. H0 não ganhou controles novos; para sair
dele, use Voltar do browser ou a URL de outra candidata. Selecione BunkerCode,
Cadisk ou BunkerMode no seletor Projeto; não edite config. Reinicie após editar
fontes: não há hot reload. Atlas/Icicle continuam nas URLs/portas anteriores.

Os snapshots locais já congelados em `.snapshots/` são obrigatórios. Não execute
`freeze.ts` para esta rodada. Servidor e browser rejeitam divergência dos hashes
registrados em `snapshots.ts`; as três novas candidatas usam os mesmos bytes de H0.

## Resultado observado: densidade, não preferência

Capturas desktop 1440×900 em `captures/peneira2/`; cada nome contém candidata,
projeto e estado. `measurements.json` contém medições brutas e contagens por estado.
Os estados macro, packages, graph-engine, explorer-src, auth, case, distant-sibling,
src e file-relations cobrem os caminhos pedidos. Há capturas adicionais de todas
as janelas de explorer-web/src. Nenhum nome foi usado para decidir a geometria.

Notação **entidades / labels / agregados de UI**. Entidades incluem foco e pai,
mas não breadcrumb, legenda, linhas ou painel de relations. Agregados de UI são
acessos que substituem vários representantes; não incluem toda região factual
com descendentes ocultos. H0 já possui agregação lógica, embora conte zero nesta
coluna. Um label contado não prova leitura humana nem nome completo em H0.

| Estado | H0 | H1 | H2 | H3 |
|---|---:|---:|---:|---:|
| BunkerCode System | 4 / 4 / 0 | 4 / 4 / 0 | 4 / 4 / 0 | 4 / 4 / 0 |
| BunkerCode graph-engine | 8 / 4 / 0 | 6 / 6 / 1 | 6 / 6 / 1 | 6 / 6 / 1 |
| BunkerCode explorer-web/src | 45 / 17 / 0 | 16 / 16 / 2 | 14 / 14 / 2 | 11 / 11 / 2 |
| Cadisk macro | 16 / 11 / 0 | 13 / 13 / 1 | 11 / 11 / 1 | 8 / 8 / 1 |
| Cadisk auth | 26 / 13 / 0 | 15 / 15 / 1 | 14 / 14 / 2 | 11 / 11 / 2 |
| Cadisk case | 25 / 14 / 0 | 14 / 14 / 1 | 14 / 14 / 2 | 11 / 11 / 2 |
| Cadisk user (irmão distante) | 19 / 10 / 0 | 8 / 8 / 1 | 8 / 8 / 1 | 8 / 8 / 1 |
| BunkerMode auth | 22 / 13 / 0 | 15 / 15 / 2 | 15 / 15 / 3 | 12 / 12 / 3 |
| BunkerMode auth.service.ts | 22 / 9 / 0 | 6 / 6 / 2 | 6 / 6 / 2 | 6 / 6 / 2 |

Em explorer-src, os 28 elementos sem label de H0 incluem contexto: não contradizem
os 22 **filhos** sem label medidos na Peneira 1. Nas novas capturas, nenhuma entidade
individual é desenhada sem label. A checagem DOM de overflow é um sinal técnico,
não um teste de compreensão. H0 ainda corta nomes mesmo em alguns labels visíveis.

### BunkerCode

Macro pequeno não distingue muito as lentes. Em graph-engine, o recorte conserva
package identity e deixa só seis entidades nas novas vistas; em src, todos os
36 filhos (35 arquivos diretos e uma região) são acessíveis e permanecem do mesmo
pai, mas não simultaneamente visíveis. H1 requer 4 janelas para enumerá-los; H2,
5; H3, 8. Isso já enfraquece a promessa de reconhecimento simultâneo do H3.

### Cadisk

As 14 entidades filhas no macro útil (`src`, com System no caminho) requerem
2/2/3 janelas em H1/H2/H3. No percurso automatizado até `user`, a procura do alvo
requereu 1/1/2 trocas adicionais, respectivamente. Isso não é medição de erro
humano nem pan corretivo. H0 permite clicar no pequeno alvo sem trocar janela,
mas cinco filhos macro estão sem nome. H1 ainda desenha curvas para os filhos
visíveis; H2 elimina essa rede; H3 troca simultaneidade por rotação.

### BunkerMode

Pai, caminho e arquivo focado permanecem explícitos. A passagem src→auth→arquivo
não depende do inspector. O contexto restante vira dois irmãos e agregados; isso
reduz nós, mas obriga voltar ao pai para conhecer outros irmãos. Esta amostra é
um teste de nesting visual, não evidência de profundidade extrema.

## Limites e hipóteses enfraquecidas

- H1 não mantém a transformação hiperbólica pura: usa sua ordem angular, um
  leque e slots fixos. Pode ser percebido como diagrama rígido com ramos, apesar
  de reduzir a teia. Curvas para a segunda coluna passam atrás da primeira.
- H2 tem hierarquia por zonas, não profundidade métrica. Sem ler a gramática de
  zonas, proximidade sozinha não prova que o usuário distinguirá irmãos/filhos.
- H3 é perspectiva 2.5D desenhada com SVG, sem engine 3D. Rotação é quantizada:
  roda/arraste/setas deslocam um acesso; botões/PageDown saltam uma janela.
  Não há câmera contínua ou endereços globais. O maior custo de enumeração já é
  evidência contra H3 em fanout, não motivo para convertê-lo em H1/H2.
- Orçamento de labels é fixo para desktop; não há política responsiva ou garantia
  para nomes arbitrariamente extensos fora destes snapshots. Texto pode quebrar.
- Dois irmãos contextuais seguem ordem canônica, não relevância inferida. Um
  contexto agregado informa existência e retorno, não identidade de cada membro.
- O campo de desenho não implementa pan/zoom em H1/H2; foco e janela são os
  controles. Menos ações de câmera disponíveis não demonstra menor esforço humano.
- Seleção continua mínima, sem evidence detalhada. Cores distinguem Uses/Used by
  de containment; navegação não exige consultar relations. Nada foi integrado.

## Instrumentação e verificação

Exportar sessão JSON preserva projeto/hash/candidata, foco, seleção, ação, tempo
input→próximo callback rAF e partição lógica. Nas novas lentes, `camera` também
registra offset, capacidade, entitiesDrawn, labelsVisible, aggregates,
contextualWithoutLabel, hiddenChildren e childrenDrawn. `disclosure` e `rotate`
devem ser contados separadamente dos eventos estruturais e dos pan/zoom/recenter
de H0. O booleano histórico `cameraWithoutAdvance` só classifica os três últimos;
não deve ser usado sozinho para comparar o custo das novas lentes.

Não há telemetria externa. A exportação é local, limitada a 10 mil eventos, com
contador de descartados; tempo de rAF não é latência física de display. Sessões
humanas ainda não foram coletadas. Ações corretivas humanas: **não disponíveis**.

```bash
./node_modules/.bin/tsc -p spatial-prototypes/tsconfig.json
node --import tsx spatial-prototypes/verify.ts
node --import tsx spatial-prototypes/verify-peneira2.ts
pnpm typecheck
pnpm test
node --import tsx spatial-prototypes/capture-peneira2.ts http://127.0.0.1:5184
node --import tsx spatial-prototypes/capture.ts http://127.0.0.1:5184
git diff --check
```

`verify-peneira2.ts` protege 1.194 estados (todos os offsets, todos os focos), além
dos 675 históricos: união disjunta dos representantes desenhados/agregados,
ownership inalterado durante disclosure, acesso a cada filho, coalescência e
package vazio, determinismo sem dependencies e igualdade dos objetos de edges
incluindo evidence/direção. Verifica também os hashes dos quatro arquivos de H0.
Os testes antigos não cobriam a nova camada de agregação de desenho e suas janelas.

Resultados executados: typecheck dos protótipos e `pnpm typecheck` passaram;
`pnpm test` teve 101 passes, zero falhas e três skips existentes condicionados
à flag de browser. Os dois verificadores passaram (675 + 1.194 estados).
Firefox passou nos 12 pares H0/H1/H2/H3 × projetos e na regressão dos nove pares
históricos. Foram produzidas 69 capturas da Peneira 2 e regeneradas as 33
históricas. As 56 capturas novas H1/H2/H3, incluindo todas as janelas de src,
não apresentaram overflow DOM ou overlap entre caixas de entidades. H0 não foi
alterado para passar nesse gate. A inspeção visual incluiu os três src densos
e Cadisk macro. `git diff --check` passou. A suíte browser de produção permanece
nos skips existentes; não é apresentada como executada.

Arquivos: nova pasta `peneira2/` (três geometrias, contexto, renderer, entrada e
CSS), `verify-peneira2.ts`, `capture-peneira2.ts`, este relatório; modificados
somente `serve.ts` e `README.md` existentes. Documentos locais de engenharia
também foram atualizados, mas são ignorados pelo Git neste repositório. Snapshots
e capturas continuam locais/ignorados. Nenhum manifest, dependência, lockfile,
analyzer, contracts, graph-engine ou fonte/teste do Explorer foi alterado.

## Avaliação humana seguinte — ainda nesta decisão

Abra uma sessão limpa por candidata/projeto. Sem busca: identifique pai/filhos,
entre num arquivo, volte, visite um irmão distante e retorne ao arquivo; selecione
Uses/Used by. Exporte a sessão. Observe quantas janelas/giradas foram necessárias
para **descobrir nomes**, não apenas alcançar um alvo já conhecido. Compare
orientação antes/depois de ocultar contexto. O esqueleto deve explicar onde você
está sem exigir reconstruir a árvore. Não escolher por contagem ou screenshot.

Como três lentes sobre o mesmo prédio, os novos recortes removem ruído visual,
mas podem esconder portas demais. Os testes comprovam preservação das portas e
dos caminhos; só a avaliação humana dirá se atravessá-los ficou mais natural.
Nenhuma vencedora, arquitetura oficial ou Peneira 3 foi escolhida.
