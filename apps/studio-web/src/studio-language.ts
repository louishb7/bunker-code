import type { ConsiderationStatus, DecisionStatus, RelationshipKind, SemanticKind } from "@bunker-code/design-model";

export interface ConceptLanguage {
  action: string;
  examples: string;
  technical: string;
  explanation: string;
}

export const CONCEPT_LANGUAGE: Readonly<Record<SemanticKind, ConceptLanguage>> = {
  boundary: {
    action: "Recebe requisições ou interações",
    examples: "API HTTP, webhook, entrada externa",
    technical: "Boundary · ponto de entrada",
    explanation: "Um ponto onde uma interação atravessa a fronteira do sistema, como uma API ou webhook.",
  },
  component: {
    action: "Processa alguma coisa",
    examples: "Autenticação, cálculos, regras de negócio",
    technical: "Component",
    explanation: "Uma parte do sistema responsável por executar algum comportamento ou regra.",
  },
  "data-store": {
    action: "Armazena informações",
    examples: "PostgreSQL, Redis, arquivos",
    technical: "Data store",
    explanation: "Um lugar onde informações permanecem armazenadas para serem usadas depois.",
  },
  "queue-event": {
    action: "Comunica ou agenda trabalho assíncrono",
    examples: "Fila, evento, mensagem",
    technical: "Queue / Event",
    explanation: "Permite comunicar ou processar trabalho sem exigir que tudo aconteça imediatamente.",
  },
  "external-system": {
    action: "Usa algo fora do sistema",
    examples: "Stripe, Resend, API externa",
    technical: "External system",
    explanation: "Um serviço ou sistema fora deste projeto, mas do qual ele depende.",
  },
  actor: {
    action: "Representa quem usa ou chama o sistema",
    examples: "Cliente, administrador, outro serviço",
    technical: "Actor",
    explanation: "Uma pessoa, aplicação ou serviço que inicia alguma interação com o sistema.",
  },
};

export const CREATION_ORDER: readonly SemanticKind[] = ["boundary", "component", "data-store", "queue-event", "external-system", "actor"];

export const RELATIONSHIP_LANGUAGE: Readonly<Record<RelationshipKind, { label: string; explanation: string }>> = {
  generic: { label: "Relação genérica", explanation: "Sem classificação específica por enquanto." },
  calls: { label: "Chama", explanation: "Esta parte solicita uma ação à outra." },
  "depends-on": { label: "Depende de", explanation: "Esta parte precisa da outra para funcionar." },
  protects: { label: "Protege", explanation: "Esta parte controla ou restringe o acesso à outra." },
  "reads-writes": { label: "Lê / grava dados", explanation: "Esta parte acessa informações mantidas pela outra." },
  emits: { label: "Publica / envia", explanation: "Esta parte envia uma mensagem ou evento." },
  consumes: { label: "Consome / recebe", explanation: "Esta parte recebe uma mensagem ou evento." },
};

export const CONSIDERATION_STATUS_LABELS: Readonly<Record<ConsiderationStatus, string>> = {
  unreviewed: "Ainda não revisado",
  considered: "Considerado",
  "not-relevant": "Não se aplica",
};

export const DECISION_STATUS_LABELS: Readonly<Record<DecisionStatus, string>> = {
  open: "Em aberto",
  accepted: "Aceita",
  rejected: "Rejeitada",
};
