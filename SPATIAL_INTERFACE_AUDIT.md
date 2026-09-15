# BunkerCode — auditoria de interfaces espaciais

Data: 2026-09-15. Estado: investigação concluída; protótipos e escolha final
dependem de autorização e avaliação humana. Esta investigação suspende a
evolução da Fase 10; não constitui seu próximo bloco.

## 1. Diagnóstico

### Evidência e escopo

Foram inspecionados README, manifests, checklist e registros de engenharia,
`explorer-runtime.ts`, geografia, projeção de frontier, Field/model, testes e
runner de captura. Quatro capturas existentes dos três sistemas foram abertas;
as medições e os três snapshots de `/tmp/bunkercode-cartography-{bc,cadisk,bm}`
foram reprocessados usando as funções atuais. Nenhum projeto alvo foi executado,
nenhum snapshot de produção foi substituído e nenhuma biblioteca foi instalada.

O browser reconstrói ProjectGraph e ProjectStructure a partir de AnalysisResult
no snapshot; não visita o filesystem do projeto. O atlas proposto seria mais
uma projeção local, sem exigir um novo contrato do analyzer.

| Snapshot inspecionado | Arquivos | Regiões incluindo raiz | Profundidade máxima de região, raiz = 0 | Subdivisão relevante |
| --- | ---: | ---: | ---: | --- |
| BunkerCode | 66 | 17 | 4 | `apps/explorer-web/src`: 35 arquivos diretos + 1 região |
| Cadisk | 74 | 22 | 3 | `src`: 11 regiões + 3 arquivos diretos |
| BunkerMode | 36 | 10 | 2 | `src/auth`: 9 arquivos diretos |

Esses são snapshots reais já capturados, não uma nova análise dos repositórios
atuais. Não se devem misturar seus números com baselines históricos do log.
BunkerMode evidencia profundidade visual desconfortável, mas esta amostra não
é mais profunda que BunkerCode nem prova comportamento em árvores extremas.

### Por que a correção factual não resolveu a experiência

1. **A câmera e a resolução continuam sendo operações distintas.** O zoom
   geométrico apenas amplia os mesmos objetos; `refinedRegionIds` controla o
   detalhe. O controle chamado Zoom in troca a representação e depois solicita
   enquadramento. Aproximar com a roda não revela arquivos.
2. **O mapa cresce quando é consultado.** Cards de dimensões fixas, padding e
   cabeçalhos produzem novas caixas; o packing recalcula tamanhos de ancestrais
   e pode mudar irmãos de linha. Ordem determinística não garante memória
   espacial durante navegação.
3. **A câmera compensa esse crescimento.** O Field escolhe entre enquadrar tudo
   e focar uma região usando um limiar de legibilidade. A mesma intenção pode
   produzir movimentos distintos conforme o restante esteja expandido.
4. **Há duas formas diferentes de voltar.** Collapse altera detalhe; System fit
   altera câmera. No Cadisk expandido, o fit observado com inspector chega a
   escala 0,545. A visão geral reaparece, mas preserva a complexidade expandida.
5. **O custo do containment é cumulativo.** No BunkerMode, cabeçalhos de src e
   auth competem com nomes de arquivos; irmãos saem da tela. No BunkerCode,
   package + src passivo preservam fatos, mas acrescentam mais contornos.
6. **Relações densas continuam densas sob seleção.** A projeção de Cadisk
   passa de 37 para 93 relações agregadas ao revelar case + auth. Esconder
   linhas em repouso ajuda, mas selecionar um hub pode continuar sobrecarregando
   o mapa. Routing sozinho não reduz o número de perguntas simultâneas.

O inspector já deixou de ser pedágio: o código atual tem navegação direta,
atalho por duplo clique e retorno de foco de teclado. As capturas também já
mostram zero setas em repouso. Repetir essas melhorias não responde à pergunta
fundamental. React Flow não foi demonstrado como gargalo de desempenho; trocar
o renderer mantendo essa gramática provavelmente preservaria seus problemas.

## 2. O que preservar

### Invariantes de produto e fatos

- Snapshot como fronteira; processamento local e sem execução do alvo.
- Scale, Perspective e Relations independentes. Structure vem de containment;
  Responsibility não muda geometria nem preenche lacunas da hierarquia.
- Uma localização por rootPath; directory e workspace package são facetas.
- Identidade e evidência de package, inclusive vazio e aninhado, preservadas.
- Arquivos diretos permanecem folhas do pai real; não criar região Other/files.
- Cada arquivo representado tem exatamente um proprietário na resolução ativa.
- Direção e todos os ProjectGraphEdge originais sobrevivem à mudança de escala.
- Dependencies não influenciam posição, tamanho ou ordem estrutural.
- Wrappers são tratados por topologia, sem regra baseada no nome src.
- Mesmos fatos e parâmetros produzem a mesma geometria e representação lógica.
- Entrada e retorno de uma escala útil em uma ação direta, sem inspector.

### Abstrações úteis, substituíveis

Geografia coalescida, IDs estáveis, índice arquivo → representante, classificação
within/between/boundary e separação entre contexto visual e ownership são úteis.
Podem ter outros nomes e estruturas internas. Frontier como partição é uma boa
implementação possível, não uma mecânica que o usuário deve operar.

### Detalhes descartáveis

Field, cards, frames, shelves, CSS, React Flow, SVG edges, estados manuais de
refinement, limiares atuais de câmera e inspector atual. Os fatos usados por
essas peças não dependem de preservá-las. Bloco 3 contribui com a integração do
snapshot; Bloco 5 contribui com garantias de contexto, não com layout obrigatório.

### Contrato comum de equivalência para os protótipos

Para o conjunto de arquivos F da boundary, manter uma função total R: F →
representantes ativos. Para cada dependency interna relevante e=(s,t):

- R(s)=R(t): armazenar em within;
- R(s)≠R(t), ambos representados: agregar pelo par ordenado em between;
- exatamente um endpoint fora da boundary: registrar crossing sem reclassificar
  a dependency como externa.

A união dessas três coleções deve conservar o multiconjunto de edges relevantes,
IDs, direção e evidência. Contextos ancestrais e cópias de animação não são
proprietários adicionais. Desenhar menos linhas não pode remover seus registros.

Culling de tela não muda a boundary: uma região fora da câmera continua no
índice lógico. Uma seta cortada pela tela aponta para o representante original,
com indicação navegável; não vira uma dependency externa.

A política de resolução pode produzir detalhe desigual em regiões diferentes,
mas só substitui um proprietário quando a nova partição completa está pronta.
Arquivos podem continuar representados pelo pai em baixa resolução; quando
revelados, aparecem como arquivos, inclusive os diretos.

Recontagem executada, em três escalas por snapshot:

| Projeto | Inicial: between + within | Detalhado: between + within | Total conservado |
| --- | --- | --- | ---: |
| BunkerCode | 38 + 138 | 64 + 112 | 176 |
| Cadisk | 67 + 105 | 113 + 59 | 172 |
| BunkerMode | 27 + 57 | 72 + 12 | 84 |

Zero crossings nesses snapshots; essa ausência não valida o cenário crossing.
Os testes existentes contêm cobertura específica dessa fronteira.

## 3. Candidatas concorrentes

As três candidatas abaixo diferem na geometria e na forma de se orientar:
território fixo, espaço deformável e seção da hierarquia. Compartilhar fatos,
regras de evidência e controles acessíveis não as torna a mesma interface.

### A. Atlas estrutural fixo + zoom contínuo + LOD

**Hipótese:** memória de localização e detalhe guiado pela câmera reduzem o
trabalho necessário para navegar e retornar.

1. Modelo espacial: subdivisão bidimensional recursiva, semelhante a um treemap
   navegável, calculada uma vez por snapshot. XY é endereço de apresentação;
   proximidade e área não significam acoplamento ou importância.
2. System: extensão inteira do atlas com grandes territórios nomeados e poucas
   bordas. A raiz real continua explícita mesmo quando wrappers são atravessados.
3. Containment: polígonos/retângulos filhos dentro do pai. Bordas ancestrais
   perdem detalhe visual ao aproximar, mantendo caminho e identidade.
4. Entrada: gesto de zoom ancorado no ponteiro; clique na região também leva,
   em uma ação, à próxima resolução útil. Seleção para relações fica separada.
5. Retorno: zoom para fora ou controle Pai sobre o mapa. Pai posiciona a câmera
   no enquadramento canônico da escala anterior; System restaura escala macro.
6. Escala: tamanho projetado em pixels determina LOD local; nenhuma necessidade
   de expandir manualmente irmãos. Mesmas coordenadas antes e depois da troca.
7. Arquivos: células folha com rótulos em tamanho de tela legível. Só se revelam
   como alvos individuais quando há espaço; zoom adicional revela nomes longos.
8. Direct files: células folha dentro do pai factual, misturadas à subdivisão
   estrutural sem pasta inventada nem localização global incorreta.
9. Packages: identidade ligada à localização; em escala macro pode estar
   agregada, mas não é apagada por compressão. Ao entrar, nome/indicador package
   permanece no contexto. Packages vazios recebem espaço mínimo próprio.
10. Repouso: nenhuma seta; geografia, nomes e marcas discretas de detalhe.
11. Uses/Used by: hover/foco mostra vizinhos e resumo de direções; seleção fixa
    a consulta. Lista completa acompanha realces; só o par investigado precisa
    de uma linha forte. Destinos fora da tela têm indicação navegável.
12. Evidence: selecionar par abre registros originais em painel; manter edge
    ou par de arquivos ancorado enquanto seus representantes mudam com o zoom.
13. BunkerCode: apps/packages/test são territórios; graph-engine permanece no
    mesmo endereço dentro de packages enquanto seus arquivos aparecem.
14. Cadisk: 11 regiões repartem área em duas dimensões; auth cresce na tela
    pela câmera, sem empurrar case ou doctor no espaço do atlas.
15. BunkerMode: entrar em src/auth amplia uma área existente; a profundidade
    não acrescenta novas faixas de cards ao mundo.
16. Fanout: distribui bem área, mas pequenas regiões e nomes longos podem
    exigir zoom. Não prometer legibilidade simultânea de todos os irmãos.
17. Profundidade: não aumenta bounds; subdivisões muito profundas ficam pequenas
    e podem exigir zoom excessivo. Coordenadas locais por região evitam depender
    de precisão global extrema; clique para escala útil evita roda interminável.
18. Risco cognitivo: área parece importância; perder contexto periférico no zoom;
    detalhe surgindo abruptamente; falsa expectativa de distância semântica.
19. Risco técnico: alocação de área, rótulos, hit testing e troca de ownership.
    Não usar um LOD global por profundidade: regiões desbalanceadas precisam de
    critérios locais. Não recalcular layout a cada mudança de câmera.
20. Stack provável: d3-hierarchy para geometria, d3-zoom para gestos, Canvas 2D
    para terreno e DOM para texto/interação acessível. WebGL somente se medição
    justificar. D3 fornece mecanismos, não essa política de navegação pronta.
21. Custo: 5–8 dias de engenharia para protótipo descartável; mais 3–6 semanas
    indicativas de endurecimento se eleito, sem migração do Explorer incluída.
22. Reuso: geografia do Bloco 1, projector/ownership do 2, snapshot do 3,
    invariantes e exemplos de refinement do 4 e de contexto do 5.
23. Descarte: refinedRegionIds como estado autoritativo operado pelo usuário,
    packing dependente da expansão, cards e câmera compensatória do Field.

**Decisões de projeto para tornar A testável:** usar ordem canônica e peso
estrutural de folhas, com reserva explícita para packages vazios; área é somente
espaço de leitura. Não usar LOC, findings ou dependencies. Testar o desequilíbrio
apps/packages/test: mesmo arquivos em quantidade não devem apagar test.
Layout inicial determinístico não implica estabilidade entre snapshots editados.
Essa estabilidade temporal é uma investigação posterior.

LOD deve distinguir representação lógica de animação. Uma troca atômica de
ownership pode ter fade decorativo, mas nunca dois endpoints ativos para o mesmo
arquivo. Para o primeiro protótipo, usar limiar canônico por tamanho projetado;
não introduzir histerese lógica dependente do trajeto. Se a troca oscilar, medir
e revisar a política. Câmera contínua não obriga semântica infinitamente contínua.

**Fontes de capacidade:** [treemap D3](https://d3js.org/d3-hierarchy/treemap) e
[d3-zoom](https://d3js.org/d3-zoom). A documentação descreve geometria e gestos;
não demonstra que A será superior no BunkerCode.

### B. Navegador hiperbólico com foco e contexto

**Hipótese:** trazer o bairro de interesse para uma área central legível,
comprimindo os demais, supera coordenadas fixas para exploração profunda.

1. Modelo espacial: árvore factual embutida em um disco hiperbólico. O centro
   recebe área; a periferia comprime contexto. Não há simulação por dependencies.
2. System: raiz no centro e ramos estruturais distribuídos ao redor, com ordem
   angular determinística e sem rotação automática a cada foco.
3. Containment: conexões de pai/filho sem setas, caminho ancestral destacado e
   agrupamento visual por ramo. Essas conexões não representam dependencies.
4. Entrada: clicar uma região move o foco para ela e revela a próxima partição;
   arrastar o disco oferece exploração contínua. Nenhum menu intermediário.
5. Retorno: clicar Pai ou o ancestral visível; System restaura foco inicial.
6. Escala: distância ao foco e espaço de rótulos definem detalhe. Aproximar é
   redistribuir espaço, não ampliar uniformemente uma planta fixa.
7. Arquivos: folhas com rótulos horizontais perto do foco; na periferia ficam
   agregados no representante ancestral, sem nuvem de nomes microscópicos.
8. Direct files: folhas diretamente conectadas ao pai correto, com símbolo
   diferente do de região; nada de região Files artificial.
9. Packages: faceta do nó de localização, com nome e evidência preservados;
   não atravessar package como wrapper anônimo. Package vazio continua nó.
10. Repouso: apenas esqueleto de containment; dependencies ocultas.
11. Uses/Used by: realce de endpoints e lista completa; um arco direcionado
    por par selecionado, diferenciado das ligações hierárquicas. Não desenhar
    simultaneamente duas redes densas sobre o disco.
12. Evidence: painel do mesmo par factual; foco pode seguir o destino com uma
    ação, mantendo a seleção por ID de arquivo/edge e o retorno estrutural.
13. BunkerCode: apps/packages/test começam como três ramos; packages no centro
    traz analyzer/contracts/graph-engine para leitura, com apps na periferia.
14. Cadisk: 11 regiões ocupam setores; focar auth abre espaço para seus filhos
    comprimindo irmãos, sem uma faixa horizontal de comprimento crescente.
15. BunkerMode: src/auth no centro, ancestrais atrás e nove arquivos próximos;
    não há pilha acumulada de molduras.
16. Fanout: área central continua finita. Mesmo 11 rótulos longos podem colidir;
    necessidade de focalizar cada irmão para reconhecê-lo é critério de falha.
17. Profundidade: promissora para travessias longas, pois mantém contexto
    comprimido. Precisão numérica perto da borda e orientação exigem cuidado.
18. Risco cognitivo: objetos mudam de posição aparente; periferia pode ser apenas
    decoração ilegível; ligações de containment podem ser confundidas com Uses.
19. Risco técnico: transformação/inversão para hit testing, colisões de nomes,
    animação, navegação de teclado e partição adaptativa sem duplicar ownership.
20. Stack provável: Canvas 2D + matemática de transformação do disco, hierarquia
    D3 e DOM para rótulos/foco. Sem pressupor plugin hiperbólico pronto no D3.
21. Custo: 7–12 dias para protótipo; endurecimento indicativo de 5–9 semanas,
    maior incerteza em acessibilidade, movimento e colisões.
22. Reuso: Blocos 1–2 e integração do 3; cenários de conservação e navegação
    dos Blocos 4–5, sem reaproveitar sua geometria.
23. Descarte: mapa cartesiano, containers aninhados e refinement manual. O foco
    substitui o conjunto de regiões abertas como principal controle de detalhe.

Usar partição completa derivada do foco; ancestrais desenhados como esqueleto
não ganham ownership se seus descendentes já representam arquivos. A mesma
geometria base e o mesmo foco canônico devem reproduzir a mesma imagem; memória
de pixels durante a navegação é deliberadamente sacrificada e será medida.

O paradigma é fundamentado no trabalho de
[Lamping, Rao e Pirolli](https://cgl.ethz.ch/teaching/scivis_common/Literature/Lamping95.pdf).
Ele descreve transformação contínua de foco/contexto; não valida navegação de
backends com evidence e relações do BunkerCode. É a candidata espacialmente
radical do bake-off, com risco real e vantagem potencial específica.

### C. Seção hierárquica navegável — icicle com foco

**Hipótese:** mostrar explicitamente os níveis e sua ligação ajuda mais que
simular um território contínuo, especialmente ao explicar onde um arquivo está.

1. Modelo espacial: seção da árvore em faixas. X distribui subárvores; Y
   representa profundidade factual. Filhos subdividem o intervalo horizontal
   do pai na faixa seguinte. Não é um grid de cards dentro de frames.
2. System: faixa da raiz, subdivisão macro abaixo e uma prévia discreta da
   próxima camada. A profundidade fica visível como dimensão do mapa.
3. Containment: alinhamento vertical e intervalos contidos. Sem setas para
   hierarquia e sem molduras cumulativas envolvendo o mapa inteiro.
4. Entrada: clique numa faixa/região amplia seu intervalo e desloca a janela
   de profundidade para seus filhos em uma ação.
5. Retorno: clique na faixa do pai ou Pai. Uma miniatura estrutural global
   acompanha a janela; não é necessário reconstruir a árvore fora da interface.
6. Escala: zoom horizontal contínuo e foco por nível coordenados. Mostrar foco
   e cerca de duas camadas abaixo; ancestrais permanecem em faixas compactas.
7. Arquivos: segmentos terminais rotulados no nível factual. São folhas,
   visualmente distintas das regiões, sem prolongar falsamente sua profundidade.
8. Direct files: segmentos terminais ao lado de regiões na faixa imediatamente
   abaixo do pai. Espaço vazio abaixo é ausência de descendência, não um módulo.
9. Packages: marca e nome na faixa da localização, sem criar faixa duplicada
   para directory/package co-localizados; packages vazios têm segmento próprio.
10. Repouso: nenhuma dependency; alinhamento já comunica estrutura.
11. Uses/Used by: realçar segmentos e mostrar lista de pares; somente o par
    investigado recebe ligação, ou indicação até destino fora da janela.
12. Evidence: painel compartilhado de edges originais. Seguir destino muda o
    foco e mantém caminho factual; não desenhar relations como degraus da árvore.
13. BunkerCode: apps/packages/test dividem a mesma faixa; packages revela três
    segmentos de package abaixo, e graph-engine termina em arquivos.
14. Cadisk: 11 regiões e três arquivos competem por largura; zoom horizontal
    amplia auth, miniatura indica o intervalo ocupado no conjunto.
15. BunkerMode: src → auth → arquivo é diretamente visível como alinhamento;
    ao avançar, a janela de profundidade se move sem gerar uma página infinita.
16. Fanout: principal fraqueza. Pouca largura por irmão, nomes truncados e maior
    necessidade de focalizar uma região antes de ler seus vizinhos.
17. Profundidade: boa explicitação de ancestry; muitos ancestrais precisam de
    compressão em caminho, que não pode apagar identidades de package.
18. Risco cognitivo: parecer ferramenta de árvore de arquivos; perder memória
    bidimensional; área/largura parecerem métrica; interpretar Y como runtime.
19. Risco técnico: sincronizar zoom, faixas ancestrais e janela sem salto;
    tratar folhas de profundidades diferentes sem inventar níveis.
20. Stack provável: d3-hierarchy partition + SVG/DOM para o primeiro protótipo;
    Canvas se as medições de densidade justificarem. Interação é própria.
21. Custo: 3–5 dias para protótipo; endurecimento indicativo de 2–4 semanas.
22. Reuso: geografia, evidência e ownership dos Blocos 1–2, snapshot do 3,
    navegação factual e cenários de retorno do 4, contexto sem ownership do 5.
23. Descarte: geografia livre XY, packing de cards, frames persistentes e
    câmera de expansão do Field. A janela/foco controla a partição ativa.

Faixas ancestrais são contexto; representantes ativos são folhas/limites da
partição atual, nunca todos os segmentos da árvore simultaneamente. A miniatura
é contexto, não uma segunda cópia contável de arquivos. Geometria canônica
restaura intervalos após ida/volta.

[D3 partition](https://d3js.org/d3-hierarchy/partition) fornece o layout
hierárquico usado por icicles; a janela de profundidade e o contrato de interação
acima são propostas específicas, não funcionalidades prontas dessa biblioteca.

### Avaliação de 2.5D e outras direções

**Atlas 2.5D é plausível, mas não ocupa uma vaga inicial.** A formulação mais
defensável teria XY idêntico ao atlas A, pequenas elevações para nesting, câmera
ortográfica com inclinação fixa, texto em coordenadas de tela e nenhum orbit.
Não usar altura para importância, dependency count ou papel arquitetural.

O benefício esperado é distinguir região de ancestral com menos bordas. Porém,
se o relevo é pequeno, comunica informação já presente no containment; se cresce,
oculta células, desloca alvos aparentes e exige compensações de texto/picking.
Cadisk perde área útil por projeção oblíqua; BunkerMode pode confundir nesting
com prédios sobrepostos; BunkerCode provavelmente parecerá mais expressivo sem
demonstrar navegação melhor. Esse balanço é inferência, não resultado de teste.

Three.js oferece [câmera ortográfica](https://threejs.org/docs/pages/OrthographicCamera.html),
mas seu [LOD](https://threejs.org/docs/pages/LOD.html) seleciona objetos por
distância: isso não implementa automaticamente uma partição factual por área
projetada. A política semântica continuaria própria. Custo marginal estimado
sobre A: 2–4 dias para testar relevo, com risco adicional de oclusão.

Se A vencer navegação mas falhar na percepção de ancestry, comparar A plano
contra A com relevo seria um experimento posterior bem isolado. Colocar ambos
no primeiro trio gastaria duas vagas no mesmo paradigma de navegação. A
radicalidade independente está em B, que testa abandonar coordenadas de tela
estáveis em favor de foco/contexto contínuo.

Cidade 3D com câmera livre adiciona oclusão e controle sem uma necessidade
espacial demonstrada. Force layout por dependencies viola geografia estrutural;
force apenas entre irmãos ainda introduz instabilidade que precisa justificar.
Bundling é uma técnica de desenho de relações, não um paradigma de navegação.
Não usar bundles para sugerir módulos atravessados ou execução: cada feixe deve
manter pares direcionados e permitir recuperar sua evidência sem ambiguidade.

## 4. Matriz comparativa

Previsões de design, não pontuações de usabilidade medidas. Favorável significa
uma hipótese forte para esse critério, não vitória demonstrada.

| Critério | A — atlas fixo | B — hiperbólico | C — seção icicle |
| --- | --- | --- | --- |
| Orientation | Favorável: endereço + caminho | Condicional: caminho legível, cena deformada | Favorável: ancestry explícita |
| Navigation cost | 1 gesto/clique por escala; risco de excesso de roda | 1 clique por foco; risco de procurar na periferia | 1 clique por faixa; risco de ajustes horizontais |
| Progressive disclosure | Favorável: espaço projetado controla LOD | Favorável perto do foco | Favorável: janela de níveis |
| Spatial memory | Mais promissora; sem repacking | Fraca em pixels; boa hipótese topológica | Estável na ordem e intervalos |
| Text legibility | Boa localmente, limitada no macro | Boa centralmente, crítica na borda | Boa com foco, crítica sob fanout |
| Fanout/Cadisk | Melhor distribuição 2D esperada | Boa compressão; rótulos são o limite | Principal fraqueza: largura |
| Depth/BunkerMode | Sem crescimento dos bounds; escala pode ficar extrema | Melhor hipótese de foco/contexto | Ancestry clara, janela necessária |
| Relation density | Controlável com realce/lista/par | Maior risco de confundir duas redes | Controlável, com menos espaço para arcos |
| Generalization | Containment puro | Containment puro | Containment puro |
| Determinism | Coordenadas canônicas por snapshot | Base + foco canônico, sem force | Intervalos canônicos + foco |
| Implementation risk | Médio/alto: LOD e texto | Alto: transformação, texto, movimento | Médio: janela e folhas irregulares |
| Cognitive load | Menor expectativa; validar LOD | Maior aprendizado inicial esperado | Baixo para ancestry, médio para zoom/faixas |

Nenhuma candidata garante ao mesmo tempo todos os nomes legíveis, todo o
sistema visível e escala ilimitada. O teste decide qual sacrifício é menos caro.

## 5. Análise dos três projetos

**BunkerCode:** A deve preservar a lembrança de onde estão packages e apps;
B permite percorrer packages rapidamente, mas reduz comparação simultânea;
C torna a fronteira package/arquivo explícita. Não limitar o teste a
graph-engine: abrir explorer-web expõe 35 arquivos diretos no snapshot, um caso
interno capaz de desmentir o aparente sucesso do mapa macro.

**Cadisk:** é o gate decisivo de fanout. A distribui irmãos no plano sem alterar
seus endereços; B troca visão comparativa por foco legível; C sofre com nomes
em 14 segmentos e só merece continuar se navegação compensar essa limitação.
Em todas, medir seleção de um item com muitas relações, não só repouso vazio.

**BunkerMode:** A elimina crescimento do mundo ao entrar em auth; B mantém
ancestrais e irmãos comprimidos; C torna src → auth → arquivo mais explícito.
As nove folhas de auth ajudam a avaliar densidade local. Este snapshot não é
gate de profundidade extrema: usar também caminhos mais profundos existentes
do BunkerCode e, se necessário, um alvo real mais profundo em rodada posterior.

## 6. Recomendação

**A é a aposta mais promissora para iniciar a comparação, não a solução final.**
Ela ataca diretamente a contradição observada: atualmente consultar detalhe
faz o mapa crescer; no atlas, consultar detalhe muda a janela sobre um endereço
já existente. A metáfora de mapa passa a descrever a interação, não só o desenho.

Seu risco principal não é Canvas versus React Flow: é se uma geografia fixa
consegue conceder espaço suficiente a nomes e subdivisões muito desbalanceadas.
Se exigir zoom interminável ou tornar regiões pequenas invisíveis, sua hipótese
central falha. B merece competir porque pode resolver isso sacrificando memória
cartesiana; C porque pode ensinar a hierarquia mais claramente e com menor custo.

## 7. Prototype bake-off

### Condições comuns

- Três aplicações/harnesses descartáveis e locais, isolados da produção; nenhuma
  integração ou substituição do Overview durante o experimento.
- Mesmos bytes dos três snapshots e mesma versão das funções que constroem
  ProjectStructure/ProjectGraph. Registrar hashes antes de iniciar; congelar
  dados durante a comparação. Não consumir dados diferentes para favorecer UI.
- Mesma gramática de arquivos, packages, direções e painel de evidence; mesmo
  tamanho inicial de janela, orçamento de fonte e acesso de teclado.
- Nenhuma Role/Responsibility, IA, análise runtime, editor de código, histórico
  Git, subjects futuros, streaming, persistência ou migração de contratos.
- Fatos necessários: árvore coalescida, IDs, parent/children, direct files,
  package facets/evidence, file edges originais e boundary. Nenhuma nova análise.
- Gates factuais anteriores a avaliação humana: ownership total e único;
  conservação de edges em cada transição; packages vazios/aninhados e wrappers
  das fixtures existentes; câmera/seleção não alteram geografia canônica.
- Fixtures protegem invariantes; não contam como evidência de usabilidade dos
  três projetos reais. Nenhum teste existente precisa ser alterado nesta rodada.

### Menor experimento por candidata

| | A | B | C |
| --- | --- | --- | --- |
| Provar/refutar | Zoom sobre endereço fixo resolve navegação | Compressão periférica preserva orientação útil | Profundidade explícita melhora entendimento |
| Render mínimo | Canvas + texto DOM; d3 hierarchy/zoom | Disco Canvas + texto DOM; transform próprio | SVG/DOM + d3 partition |
| Interações | Zoom/pan, clique próxima escala, Pai/System, Uses/Used by, par/evidence | Focar região, arrastar foco, Pai/System, relações/evidence | Focar faixa, zoom horizontal, Pai/System, relações/evidence |
| Não implementar | Tiling distribuído, WebGL preventivo, relevo | 3D, force, rotação livre, bundles complexos | Layout alternativo de cards, scrolling por região |
| Sucesso específico | Ida/volta sem deslocar coordenadas do atlas; detalhe emerge sem comando separado | Identificar pai/irmãos com precisão semelhante a A e navegar fundo com menos ajustes | Identificar ancestry mais rápido, sem perder comparação sob fanout |
| Abandono específico | Pequenos territórios inacessíveis ou roda/fit dominam a tarefa | Periferia ilegível obriga explorar cada irmão; movimento desorienta | Cadisk exige varrer segmentos um a um ou ancestry parece uma árvore de arquivos com mais trabalho |

Gates quantitativos propostos, congelados antes do teste: zero perda/duplicação
de fatos; 100% das transições úteis disponíveis em uma ação direta; zero acesso
ao inspector necessário para entrar/voltar; zero erro de direção nos exercícios
de evidence; pelo menos 90% de respostas corretas de pai/package/localização.
Durante navegação, alvos ativos com pelo menos 24 px e fonte principal de pelo
menos 14 CSS px; nomes completos acessíveis no foco, sem truncamentos ambíguos.

Medir input-to-feedback p95 abaixo de 100 ms e frame time p95 abaixo de 33 ms
no equipamento do teste, excluindo carregamento inicial. São orçamentos de
experimento, não desempenho medido nem metas universais.

Após gates, procurar redução de pelo menos 20% na mediana de tempo de navegação
contra baseline atual em dois projetos, sem regressão superior a 15% no terceiro
ou perda de precisão. Esses limiares são critérios práticos propostos, não
significância estatística. Não somar tudo em uma nota que esconda um erro factual.

Uma falha corrigível de implementação permite uma rodada curta de ajuste,
registrada. Se corrigir exige trocar a geometria central ou introduzir uma nova
mecânica, abandonar a candidata em vez de transformá-la silenciosamente em outra.

## 8. Critérios de decisão humana

Testar tarefas completas, com ordem de protótipos e projetos alternada para
reduzir aprendizado. Dar a mesma introdução curta e usar tarefas equivalentes;
evitar pedir think-aloud durante trechos cronometrados. Registrar comentários
imediatamente depois. Uma pessoa decide sua própria preferência, mas não
representa evidência de generalização para todos os desenvolvedores.

1. **Orientação inicial:** localizar uma região e dizer seu pai sem inspector.
2. **Travessia:** System → package/região → arquivo, anotando ações e ajustes
   de câmera. Um gesto contínuo conta como gesto, mas sua duração também conta.
3. **Retorno:** voltar um nível, visitar um irmão e retornar ao mesmo arquivo.
   Separar ações estruturais necessárias de correções sem valor.
4. **Memória:** após tarefa intermediária, reencontrar o lugar sem busca.
   Registrar tempo e erros de ramo; perguntar onde esperava encontrá-lo.
5. **Containment:** distinguir arquivo direto de sub-região; reconhecer package
   sem confundir sua faceta com uma segunda localização.
6. **Relação real:** escolher um par existente no snapshot, identificar quem usa
   quem, abrir evidence e reencontrar o mesmo par após mudar a escala.
7. **Conforto:** observar hesitações, recenter, roda excessiva, texto pequeno,
   confusão entre foco e seleção, movimento e necessidade de explicar a UI.

Percursos: graph-engine e explorer-web no BunkerCode; auth/case e um irmão
distante no Cadisk; src/auth, tasks e test no BunkerMode. Selecionar os pares de
dependency pelo dado, nunca inferi-los pelos nomes dos arquivos.

Critério de escolha: primeiro correção e conclusão de tarefas; depois orientação,
tempo, ações sem valor e memória; por último preferência estética. Se A for mais
rápida e C ensinar melhor a ancestry, explicitar o tradeoff e escolher conforme
a prioridade humana, sem declarar vitória universal.

## 9. Plano da próxima rodada — não executado

1. Autorizar o trio A/B/C e confirmar as condições humanas ao final deste plano.
2. Congelar snapshots, ambiente, tarefas, métricas e baseline atual. Os hashes
   auditados são bc `db0f8d3085f5c8d39fc5084b7a7922ebe00a0aaa90543ac5efe07d7fd468e0ed`,
   cadisk `c5933328eb5de48a6f65cec23fa78d16ad7d065ee5c895297f271d8020e894d4`,
   bm `df947950a674b6a045c413d48acf93cccb96e0d87b8a5c2bf248c27f064c7141`.
   Se atualizar snapshots, fazê-lo uma vez para todas as candidatas e recontar.
3. Construir somente o suporte mínimo de dados/evidence e métricas; evitar um
   framework genérico de renderers antes de conhecer suas necessidades.
4. Implementar os três experimentos com tetos de esforço explícitos. A ordem de
   construção não será a ordem fixa de avaliação. Reserva compartilhada de
   preparação/avaliação: aproximadamente 3–5 dias, além dos custos individuais.
5. Executar gates factuais e técnicos; coletar navegação real nos três projetos.
6. Fazer avaliação humana alternada; registrar falhas, resultados e limitações.
7. Escolher, ajustar, rejeitar todas ou pedir outro experimento. Só uma decisão
   posterior autoriza integrar ao Explorer ou substituir React Flow.

## 10. Questões abertas

Somente escolhas de prioridade/uso que evidência técnica não decide sozinha:

- A preferência principal é reconhecer o sistema inteiro e retornar a lugares,
  ou percorrer rapidamente um caminho de mudança? Na ausência de outra escolha,
  esta proposta prioriza orientação e retorno.
- Qual dispositivo representa o trabalho principal: mouse, trackpad ou ambos?
  Proposta inicial: ambos no desktop, teclado como caminho equivalente.
- Quem participará e qual experiência prévia tem com os três projetos?
  Incluir alguém que não conheça um alvo ajuda a avaliar formação de modelo
  mental; familiaridade não deve ser confundida com mérito da interface.

Escolher A/B/C para construir continua sendo decisão do usuário. Renderer,
limiares exatos, packing e colisão de texto são problemas técnicos a experimentar,
não perguntas transferidas prematuramente ao usuário.

## Verificação e síntese de aprendizagem

Executados `node --import tsx --test test/explorer-web.test.ts` (exit 0; reporter
resumiu um arquivo aprovado) e auditoria temporária dos três snapshots (exit 0,
assertions de conservação em nove estados). O comando inicialmente filtrado
também terminou com exit 0, mas não é usado para alegar número de casos.
Não foram adicionados testes: não há comportamento implementado nesta rodada.
Typecheck/build/browser não foram repetidos para documentação; capturas
inspecionadas são anteriores e nenhuma afirmação de nova validação de browser
é feita. Diff-check e revisão de escopo encerram a rodada.

Investigamos como consultar a mesma estrutura sem fazer o usuário administrar
o desenho. Como uma planta de prédio confiável, os fatos dizem onde estão as
salas; planta baixa, lente de aumento e corte vertical ajudam tarefas diferentes.
O código e os snapshots demonstram conservação factual e as limitações da
gramática atual. Não demonstram superioridade das candidatas, escalabilidade
extrema ou comportamento em runtime. Agora sabemos que a partição factual pode
servir de lastro comum a representações concorrentes. A próxima decisão é
autorizar os protótipos, não implementar uma interface definitiva.
