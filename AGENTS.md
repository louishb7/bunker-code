# AGENTS.md

## 1. Finalidade

Este documento contém instruções permanentes para agentes de programação que
trabalharem no repositório BunkerCode.

Leia-o integralmente antes de:

- modificar código;
- criar ou remover arquivos;
- modificar contratos;
- alterar dependências;
- alterar scripts;
- modificar o workspace;
- criar ou modificar testes;
- executar refatorações;
- atualizar documentação;
- iniciar uma nova fase do produto.

Estas instruções permanecem válidas durante toda a tarefa.

Quando uma solicitação explícita do usuário entrar em conflito com este
documento:

1. siga a solicitação explícita mais recente;
2. limite a exceção ao menor escopo necessário;
3. não transforme a exceção em regra permanente;
4. registre a divergência no resumo final quando ela afetar arquitetura,
   segurança, contratos ou operação.

---

## 2. Produto

### Nome

BunkerCode

### Tagline

> Map your system before changing it.

### Conceito

BunkerCode é uma ferramenta local-first de análise estrutural de projetos de
software.

Seu objetivo é transformar código-fonte e configurações em relações
arquiteturais investigáveis.

O sistema poderá analisar:

- arquivos;
- módulos;
- imports;
- dependências internas;
- dependências externas;
- relações não resolvidas;
- acoplamento;
- dependências circulares;
- influência estrutural;
- impacto potencial de alterações;
- evolução arquitetural;
- arquivos que mudam frequentemente juntos.

A metáfora do produto é um centro de inteligência.

Antes de alterar o terreno, o desenvolvedor entra no bunker, consulta o mapa,
avalia evidências, identifica riscos e planeja a mudança.

O produto deve funcionar como:

- mapa arquitetural;
- laboratório forense;
- catálogo de evidências;
- ferramenta investigativa;
- apoio a decisões técnicas rastreáveis.

O BunkerCode não deve emitir conclusões arquiteturais sem preservar as
evidências que as sustentam.

---

## 3. Estado atual versus visão futura

Sempre diferencie:

- comportamento comprovadamente existente;
- trabalho em andamento;
- fase aprovada;
- hipótese futura;
- possibilidade de longo prazo.

Não apresente a visão futura como estado atual.

Não crie componentes somente porque aparecem no roadmap.

Antes de cada tarefa:

1. inspecione o repositório;
2. leia os manifests;
3. leia a documentação relevante;
4. execute ou identifique o fluxo atual;
5. confirme a menor mudança necessária.

Uma direção arquitetural possível é:

```text
Projeto analisado
  ↓
Analyzer
  ↓
Contrato serializável
  ↓
ProjectGraph
  ↓
Métricas e diagnósticos
  ↓
CLI, API ou interface
```

Isso é uma direção de evolução, não uma declaração de que todas as camadas já
existem.

Componentes futuros podem incluir:

```text
apps/
├── cli/
├── api/
└── web/

packages/
├── contracts/
├── analyzer-core/
├── analyzer-typescript/
├── graph-engine/
├── git-analyzer/
└── test-fixtures/
```

Não crie esses diretórios antecipadamente.

Um novo componente só deve ser introduzido quando:

1. houver responsabilidade concreta;
2. a tarefa atual precisar dele;
3. a fronteira estiver compreendida;
4. a solução mais simples for insuficiente;
5. existir validação objetiva;
6. a mudança não for apenas especulação arquitetural.

---

## 4. Prioridade técnica

A prioridade inicial é produzir análise estrutural confiável.

Antes de investir em:

- PostgreSQL;
- Prisma;
- API;
- frontend;
- autenticação;
- multiusuário;
- aplicação desktop;
- inteligência artificial;
- infraestrutura remota;
- deploy;
- visualização avançada;

o produto deve demonstrar que consegue extrair, representar e consultar
relações arquiteturais corretas.

Não construa camadas para armazenar ou apresentar dados cuja extração ainda
não foi validada.

---

## 5. Princípios fundamentais

### 5.1 Local-first

O núcleo do produto deve funcionar localmente.

Não exija:

- upload do repositório;
- envio de código-fonte a terceiros;
- processamento obrigatório em nuvem;
- conta remota;
- autenticação;
- conexão permanente.

Não envie conteúdo do projeto analisado para serviços externos sem autorização
explícita.

### 5.2 Independência de IA

O núcleo do BunkerCode deve funcionar sem inteligência artificial.

A fonte de verdade deve ser baseada em mecanismos verificáveis, como:

- AST;
- TypeScript Compiler API;
- `ts-morph`;
- resolução de símbolos;
- configuração do projeto;
- histórico Git;
- algoritmos de grafos;
- métricas;
- regras transparentes.

IA poderá futuramente explicar ou resumir evidências, mas não deve substituir
a extração estrutural determinística.

Não adicione serviços ou dependências de IA sem solicitação explícita.

### 5.3 Evidências rastreáveis

Toda relação ou diagnóstico relevante deve preservar, quando aplicável:

- origem;
- destino;
- tipo da relação;
- caminho;
- linha ou intervalo;
- módulo solicitado;
- evidência encontrada;
- analyzer responsável;
- nível de confiança;
- motivo de resolução incompleta.

Modelo conceitual:

```ts
type Confidence = "exact" | "inferred" | "uncertain";
```

Não apresente heurística como fato exato.

Não descarte silenciosamente uma relação que não pôde ser resolvida.

### 5.4 Determinismo

A mesma entrada, nas mesmas condições, deve gerar a mesma representação
lógica.

Portanto:

- normalize caminhos;
- prefira caminhos relativos;
- padronize separadores como `/`;
- ordene coleções;
- não dependa da ordem do filesystem;
- não use IDs aleatórios quando IDs derivados forem possíveis;
- não inclua timestamps em resultados determinísticos;
- mantenha contratos e mensagens observáveis estáveis.

### 5.5 Falhas explícitas

Diferencie:

- entrada inválida;
- configuração inválida;
- limitação conhecida;
- relação não resolvida;
- erro interno.

Não transforme indiscriminadamente falhas em:

- array vazio;
- resultado parcial sem aviso;
- sucesso com dados incorretos;
- fallback silencioso.

### 5.6 Fatias verticais

Prefira comportamento pequeno e funcional de ponta a ponta:

```text
entrada
  ↓
validação
  ↓
análise real
  ↓
contrato
  ↓
saída
  ↓
teste significativo
```

Não crie antecipadamente todos os services, repositories, controllers,
contratos ou packages imagináveis.

### 5.7 Simplicidade proporcional

Não introduza sem necessidade comprovada:

- microsserviços;
- CQRS;
- event sourcing;
- mensageria;
- filas;
- service locator;
- dependency injection própria;
- plugin system genérico;
- cache sem invalidação;
- abstrações de persistência sem persistência;
- Turborepo;
- Nx;
- infraestrutura distribuída.

---

## 6. Arquitetura e fronteiras

### 6.1 Direção de dependências

Quando existentes, aplicações podem depender de bibliotecas do projeto.

Bibliotecas de domínio e análise não devem depender da CLI ou de interfaces de
apresentação.

Evite:

- dependências circulares entre packages;
- packages que conhecem aplicações;
- domínio dependente de detalhes de CLI;
- graph engine dependente de parser;
- fixtures dependentes do workspace interno.

### 6.2 Isolamento do ts-morph

`ts-morph` é detalhe de implementação do analyzer TypeScript.

Tipos como:

- `Project`;
- `SourceFile`;
- `Node`;
- `Symbol`;
- `ImportDeclaration`;

não devem atravessar a API pública do analyzer.

Evite:

```ts
interface AnalysisResult {
  files: SourceFile[];
}
```

Prefira:

```ts
interface AnalyzedFile {
  id: string;
  path: string;
}
```

Antes de atravessar a fronteira, converta objetos da biblioteca em:

- strings;
- números;
- booleanos;
- arrays;
- objetos simples;
- unions;
- enums ou tipos próprios.

CLI, graph engine, persistência, API e frontend não devem precisar compreender
`ts-morph`.

### 6.3 Contratos públicos

Contratos públicos devem:

- pertencer ao BunkerCode;
- ser serializáveis;
- não conter funções;
- não conter referências circulares;
- não depender de objetos da AST;
- ter semântica clara;
- permitir comparação em testes;
- permitir persistência ou transmissão futura;
- preservar evidências relevantes.

Não congele antecipadamente uma taxonomia completa de grafo.

### 6.4 Workspace

Quando o projeto utilizar workspace:

- `apps/*` contém executáveis;
- `packages/*` contém bibliotecas;
- dependências específicas permanecem no package consumidor;
- dependências internas usam protocolo de workspace quando apropriado;
- a raiz concentra apenas scripts globais;
- fixtures representam projetos externos controlados.

Não concentre todas as dependências no `package.json` da raiz.

### 6.5 Fixtures

Fixtures representam projetos analisados, não packages do BunkerCode.

Elas devem:

- ser pequenas;
- representar um comportamento;
- não depender de imports internos do monorepo;
- não receber vantagens acidentais do workspace;
- conter o mínimo necessário;
- permitir compreender o cenário pela estrutura.

Não crie fixtures preventivamente.

---

## 7. Fluxo obrigatório

Antes de modificar código:

1. leia `AGENTS.md`;
2. leia `README.md`;
3. leia documentação relacionada;
4. inspecione manifests;
5. execute `git status --short`;
6. identifique mudanças preexistentes;
7. localize o comportamento atual;
8. identifique contratos e consumidores;
9. defina a menor mudança suficiente;
10. defina a validação antes de editar.

Não presuma que o repositório está limpo.

Não reverta trabalho do usuário.

---

## 8. Implementação

Durante uma tarefa:

- faça mudanças pequenas e coesas;
- preserve fronteiras;
- prefira nomes específicos;
- não faça refatorações cosméticas fora do escopo;
- não altere contratos sem verificar consumidores;
- não esconda falhas;
- não introduza abstrações preventivas;
- não misture múltiplas fases;
- mantenha resultados determinísticos;
- mantenha o checklist coerente com o que foi realmente concluído.

Não avance automaticamente para o próximo item ou fase.

---

## 9. TypeScript

Preserve o modo estrito.

Não enfraqueça o compilador para acomodar a implementação.

Evite:

- `any`;
- `as unknown as`;
- assertions sem evidência;
- non-null assertions indiscriminadas;
- `@ts-ignore`;
- desativação global de regras.

Prefira:

- narrowing;
- validação nas fronteiras;
- unions discriminadas;
- tipos públicos explícitos;
- funções pequenas;
- tratamento explícito de `undefined`.

Respeite:

- versão mínima do Node;
- `target`;
- `lib`;
- estratégia ESM ou CommonJS;
- `module`;
- `moduleResolution`;
- convenções de extensão dos imports.

Não misture sistemas de módulo incidentalmente.

Evite nomes genéricos como:

- `utils.ts`;
- `helpers.ts`;
- `common.ts`;
- `misc.ts`;
- `manager.ts`;

quando a responsabilidade puder ser nomeada diretamente.

---

## 10. CLI

A CLI pode:

- interpretar argumentos;
- validar a invocação;
- chamar casos de uso;
- serializar resultados;
- escrever dados em `stdout`;
- escrever erros em `stderr`;
- definir código de saída.

A CLI não deve:

- implementar análise AST;
- conhecer objetos do `ts-morph`;
- duplicar regras do analyzer;
- conter algoritmos de grafo;
- persistir dados sem uma fase apropriada.

JSON destinado a ferramentas deve permanecer válido.

Não misture logs decorativos com JSON em `stdout`.

Falhas devem produzir código diferente de zero.

Não use `process.exit()` em bibliotecas internas.

---

## 11. Analyzer TypeScript

O analyzer pode ser responsável por:

- validar o diretório;
- localizar ou receber `tsconfig.json`;
- criar o projeto TypeScript;
- identificar arquivos incluídos;
- extrair relações;
- resolver destinos;
- classificar dependências;
- registrar relações não resolvidas;
- normalizar caminhos;
- preservar evidências;
- produzir saída determinística.

Não use regex como substituto geral da AST.

Não presuma que todo arquivo `.ts` encontrado no disco pertence ao projeto.

Considere configurações como:

- `include`;
- `exclude`;
- `files`;
- `baseUrl`;
- `paths`;
- referências de projeto;
- resolução de módulos.

Não execute o código analisado.

Não execute scripts do projeto analisado.

Não instale dependências automaticamente.

### Caminhos

Resultados públicos devem preferir caminhos relativos ao projeto e
separadores `/`.

Não exponha caminhos absolutos da máquina sem razão contratual explícita.

### Relações não resolvidas

Uma relação não resolvida não deve desaparecer.

Preserve, quando possível:

- origem;
- módulo solicitado;
- localização;
- motivo;
- confiança;
- dados necessários para investigação.

Diferencie dependência externa válida de falha de resolução.

---

## 12. Testes

### 12.1 Justificativa obrigatória

Testes não são obrigatórios apenas porque o código de produção mudou.

Adicione ou altere testes somente quando protegerem:

- comportamento observável significativo;
- invariante não trivial;
- fronteira importante;
- contrato público;
- regressão concreta;
- cenário de erro relevante;
- resolução estrutural realisticamente sujeita a falha.

Antes de adicionar um teste, determine:

1. qual regressão realista ele detectaria;
2. por que os testes existentes não a detectariam;
3. qual comportamento ou invariante está sendo protegido.

Se a única justificativa for:

- cobertura;
- simetria;
- “o código mudou”;
- repetição de literais;
- duplicação do controle de fluxo;

não adicione o teste.

### 12.2 Testes-túmulo

Não adicione testes cuja única finalidade seja afirmar que código, rotas,
campos ou funcionalidades removidas continuam ausentes.

Testes negativos são adequados quando a ausência é um contrato atual de:

- API;
- segurança;
- persistência;
- compatibilidade.

Exemplos:

- endpoint proibido permanece inacessível;
- campo sensível não é serializado;
- operação insegura permanece bloqueada;
- constraint impede estado proibido.

### 12.3 Não espelhar implementação

Evite testes que apenas reproduzam:

- valores literais;
- mappings declarativos;
- fluxo óbvio;
- detalhes internos;
- ordem incidental de chamadas;
- estrutura privada sem efeito observável.

O teste deve falhar quando o comportamento importante quebrar, não quando o
código for reorganizado mantendo a mesma semântica.

Para saídas estruturadas visíveis ao usuário, prefira:

- interface pública estável;
- snapshot deliberado e pequeno;
- teste de integração;

em vez de muitas asserções parciais sobre strings.

### 12.4 Reaproveitar testes existentes

Prefira ampliar o teste existente na fronteira comportamental apropriada.

Não crie automaticamente:

- novo arquivo de teste;
- nova fixture;
- helper test-only;
- factory genérica;
- abstração exclusiva de teste;
- infraestrutura adicional;

quando o cenário puder ser expresso claramente na estrutura existente.

A infraestrutura de teste não deve ser mais complexa ou frágil que o
comportamento testado.

### 12.5 Regressões

Ao corrigir bug real, adicione cobertura no nível em que ele foi observado,
quando prático.

Exemplos:

- falha observada na CLI: teste a CLI;
- resolução incorreta: teste o analyzer com fixture mínima;
- caminho dependente do sistema: teste a saída normalizada;
- contrato incorreto: teste a fronteira pública.

### 12.6 Nível de teste

Escolha o menor nível que ainda proteja o comportamento real.

Use teste unitário para:

- transformações puras;
- normalização;
- cálculos determinísticos;
- regras isoladas.

Use integração para:

- carregamento de `tsconfig`;
- comportamento de `ts-morph`;
- resolução de imports;
- integração entre CLI e analyzer;
- fixtures reais;
- interação entre packages.

Use end-to-end somente quando houver múltiplas camadas reais e um nível menor
não proteger adequadamente o comportamento.

Não crie E2E para arquitetura ainda inexistente.

---

## 13. Comentários e documentação pública

Não adicione comentários ou doc comments que apenas repitam:

- o código;
- o nome do símbolo;
- o nome do teste;
- o propósito óbvio do arquivo;
- o fluxo evidente.

Prefira nomes e estruturas mais claros.

Comentários devem explicar informações não óbvias, como:

- motivo de uma decisão;
- invariante;
- restrição de segurança;
- requisito de compatibilidade;
- peculiaridade externa;
- workaround inevitável;
- motivo pelo qual uma alternativa aparentemente simples está errada.

Atualize ou remova comentários desatualizados.

Quando uma API pública precisar de documentação, descreva:

- contrato;
- semântica;
- entradas;
- saídas;
- erros;
- invariantes;
- níveis de confiança;
- limitações;
- exemplos úteis.

Não apenas parafraseie a estrutura ou os nomes dos campos.

---

## 14. Segurança

Trate o projeto analisado como entrada não confiável.

Considere:

- path traversal;
- symlinks;
- arquivos malformados;
- configurações inesperadas;
- projetos muito grandes;
- consumo excessivo de memória;
- loops;
- caminhos externos;
- execução acidental de código.

A análise estática não deve executar módulos do projeto analisado.

Não execute scripts de `package.json` do alvo.

Não instale dependências do alvo automaticamente.

Não envie o código analisado para serviços externos.

Ao encontrar vulnerabilidade concreta:

- corrija a causa na mesma tarefa quando estiver no escopo;
- não deixe a correção apenas como recomendação futura;
- adicione regressão quando houver comportamento observável relevante;
- não reduza segurança para simplificar testes.

---

## 15. Performance

Não otimize sem evidência.

Antes de otimizar:

1. identifique o gargalo;
2. obtenha medição;
3. determine a entrada afetada;
4. preserve correção;
5. compare antes e depois.

Evite:

- carregar o projeto repetidamente;
- percorrer toda a AST para cada relação;
- serializar objetos internos gigantes;
- duplicar dados sem necessidade;
- cache sem invalidação;
- paralelização sem compreender determinismo;
- sacrificar evidências para reduzir saída.

---

## 16. Dependências

Antes de adicionar dependência:

1. confirme a necessidade;
2. avalie manutenção e compatibilidade;
3. instale no package correto;
4. atualize o lockfile pelo gerenciador;
5. valide o workspace;
6. registre a decisão quando arquitetural.

Não:

- adicione dependência para função trivial;
- atualize todas as dependências incidentalmente;
- altere major versions sem necessidade;
- use `--force` sem investigar;
- edite o lockfile manualmente.

---

## 17. Git

Nunca:

- reverta alterações externas à tarefa;
- execute `git reset --hard`;
- execute `git clean -fd`;
- sobrescreva trabalho do usuário;
- faça commit sem solicitação;
- faça push sem solicitação;
- altere histórico;
- use force push.

O diff final deve conter somente o escopo da tarefa.

Evite:

- formatação global;
- renomeações cosméticas;
- reorganização incidental;
- alterações de line ending;
- snapshots amplamente regenerados;
- artefatos de build;
- lockfile não relacionado.

---

## 18. Validação

Procure os comandos reais nos manifests e na documentação.

Quando existirem e forem aplicáveis, execute:

```bash
pnpm typecheck
pnpm test
pnpm build
pnpm lint
```

Não invente scripts.

Quando uma validação não puder ser executada:

- informe o comando;
- explique o bloqueio;
- não declare que passou;
- execute verificações menores ainda confiáveis;
- não distorça a implementação para satisfazer limitação artificial do
  ambiente.

Antes de concluir:

1. execute `git status --short`;
2. revise o diff;
3. execute `git diff --check`;
4. verifique artefatos;
5. confira imports;
6. preserve mudanças preexistentes;
7. confira documentação e testes;
8. confirme que o escopo não cresceu.

---

## 19. Checklist operacional

Quando `AI_PROJECT_CHECKLIST.md` estiver presente:

- leia-o antes de iniciar;
- atualize apenas itens relacionados à tarefa;
- não marque item como concluído sem validação;
- registre bloqueios reais;
- não avance para outra fase automaticamente;
- não substitua fatos por suposições;
- não reescreva histórico útil;
- registre somente decisões e resultados úteis.

---

## 19.1 Engineering Documentation Protocol

Após qualquer implementação, bug fix, investigação, refactor ou alteração
técnica significativa, atualize a documentação local de engenharia.

Papéis permanentes:

```text
AI_PROJECT_CHECKLIST.md = futuro planejado.
ENGINEERING_LOG.md      = passado real da engenharia.
DECISIONS.md            = por que escolhas importantes foram feitas.
LEARNING_CHECKPOINT.md  = material acumulado para a próxima aula.
```

Esses papéis devem permanecer separados.

Regras:

1. Atualize `ENGINEERING_LOG.md` após mudanças técnicas significativas.
2. Registre objetivo ou problema, comportamento anterior, causa raiz quando
   aplicável, solução implementada, arquivos/subsistemas afetados, validação,
   consequências arquiteturais e conceitos técnicos que podem ser ensinados.
3. Classifique a relevância didática como `HIGH`, `MEDIUM` ou `LOW`.
4. Mudanças `HIGH` e `MEDIUM` devem ser adicionadas ao
   `LEARNING_CHECKPOINT.md`.
5. Decisões arquiteturais relevantes devem ser registradas em `DECISIONS.md`.
6. Tarefas planejadas pertencem ao `AI_PROJECT_CHECKLIST.md`.
7. Manutenção emergente não deve transformar o checklist principal em um
   depósito de bugs.
8. Não gere aulas ou PDFs automaticamente.
9. Não registre trivialidades sem valor didático ou arquitetural, como
   formatação, rename puramente mecânico, dependency bump trivial ou pequenos
   ajustes sem consequência técnica.
10. A documentação deve explicar por que uma mudança ocorreu, não apenas
    listar diffs.
11. Ao final de toda tarefa que altere pelo menos um arquivo, inclua também a
    melhor mensagem de commit sugerida em inglês. Se a tarefa não alterar
    arquivos, não inclua mensagem de commit.

---

## 20. Limites atuais

Não implemente sem solicitação explícita e fase aprovada:

- aplicação desktop;
- outras linguagens;
- autenticação;
- multiusuário;
- colaboração;
- nuvem obrigatória;
- upload remoto;
- integração completa com GitHub;
- execução em CI;
- IA generativa;
- correção automática;
- análise de runtime;
- instrumentação;
- visualização avançada;
- persistência;
- Prisma;
- PostgreSQL;
- NestJS;
- React;
- sistema genérico de plugins.

Não transforme a visão futura em backlog automaticamente autorizado.

---

## 21. Critérios de conclusão

Uma tarefa só está concluída quando:

- o comportamento solicitado foi implementado;
- o escopo permaneceu controlado;
- as fronteiras foram preservadas;
- o typecheck aplicável passou;
- os testes relevantes passaram;
- novos testes possuem justificativa comportamental;
- falhas são reportadas corretamente;
- a documentação necessária foi atualizada;
- o diff foi revisado;
- `git diff --check` passou;
- não há artefatos indevidos;
- o trabalho preexistente foi preservado.

Não declare sucesso completo sem executar as validações necessárias.

---

## 22. Resumo final obrigatório

Use, quando aplicável:

### Implementado

- comportamento alterado;
- arquivos principais;
- decisões relevantes.

### Validação

- comandos executados;
- resultados;
- validações não executadas e motivo.

### Testes

- testes modificados;
- regressão ou contrato protegido;
- motivo de a cobertura anterior ser insuficiente.

Quando nenhum teste for adicionado, explique por que não havia comportamento
significativo novo a proteger ou por que a cobertura existente era suficiente.

### Limitações ou pendências

Liste somente bloqueios reais.

### Git

- estado resumido;
- mensagem de commit sugerida em inglês sempre que a tarefa alterar pelo
  menos um arquivo; omitir somente quando nenhum arquivo tiver sido alterado.

Não:

- cole arquivos completos;
- afirme sucesso sem executar;
- esconda warnings;
- prometa trabalho não solicitado.

---

## 22.1 Learning and Verification Summary

Ao concluir um bloco significativo de implementação, auditoria ou investigação,
inclua um resumo curto que ajude quem ainda não conhece profundamente o
BunkerCode a formar um modelo mental verificável do sistema. Este resumo
complementa, sem substituir, as seções obrigatórias do resumo final.

Use-o principalmente:

- na resposta final de cada tarefa significativa;
- em checkpoints relevantes quando uma investigação mudar a direção da tarefa;
- em auditorias que terminarem deliberadamente sem implementação.

Não o exija para cada comando de terminal ou mensagem intermediária trivial.

Inclua, de forma concisa:

1. **O que tentamos descobrir?** Explique o problema ou hipótese em linguagem
   normal, sem depender de jargão interno.
2. **Analogia com o mundo real.** Dê uma analogia curta e concreta que preserve
   a essência técnica e ajude a formar um modelo mental; ela não substitui a
   explicação técnica.
3. **O que foi feito tecnicamente?** Resuma mecanismo, arquivos e conceitos
   relevantes, sem reproduzir o log inteiro.
4. **O que a evidência realmente demonstrou?** Diferencie fatos observados,
   testes executados e interpretação. Uma implementação bem-sucedida não prova
   por si só uma afirmação mais ampla.
5. **O que ela não demonstrou?** Registre limites, casos ainda não cobertos,
   suposições e riscos relevantes. Se uma hipótese foi rejeitada, diga isso
   explicitamente.
6. **O que agora entendemos sobre o BunkerCode?** Explique qual peça do sistema
   ficou mais compreensível como consequência do bloco.
7. **Qual é a próxima decisão?** Indique se a próxima decisão lógica é
   implementar, investigar, auditar, refatorar, manter como está ou interromper
   aquela direção.

Regras de estilo:

- mantenha cada seção curta por padrão; normalmente uma a quatro frases são
  suficientes;
- expanda apenas quando risco ou ambiguidade técnica justificar;
- não use elogios genéricos nem esconda resultados negativos;
- `não implementar` pode ser um resultado correto;
- não apresente inferência como fato;
- quando houver diferença entre resolução estática e comportamento em runtime,
  deixe-a explícita;
- quando houver incerteza, trate-a como parte do resultado em vez de preenchê-la
  com uma suposição.

Toda tarefa significativa deve conter ao menos uma analogia real curta na
resposta final. Prefira analogias de sistemas reais — como mapas, logística,
telefonia, prédios, oficinas, bibliotecas, fábricas ou investigação — e não
force a mesma analogia em toda tarefa. Se ela começar a distorcer o conceito
técnico, abandone-a e explique o ponto tecnicamente.

---

## 23. Protocolo permanente

Para cada tarefa:

```text
1. Ler AGENTS.md.
2. Ler README e documentação relacionada.
3. Ler AI_PROJECT_CHECKLIST.md, quando existir.
4. Conferir o Git.
5. Mapear o comportamento atual.
6. Definir a menor mudança suficiente.
7. Definir a validação.
8. Implementar sem ampliar escopo.
9. Adicionar testes somente quando protegem comportamento significativo.
10. Executar validações aplicáveis.
11. Revisar o diff.
12. Atualizar documentação e checklist.
13. Entregar resumo factual.
14. Parar.
```

Não avance automaticamente para outra fase.
