// ========== Legado (Matriz 5W2H / iniciativas) – manter para compatibilidade ==========
export enum ItemStatus {
  ACTIVE = 'PRIORIDADE ATIVA',
  EXECUTING = 'EM EXECUÇÃO',
  BLOCKED = 'BLOQUEADO',
  COMPLETED = 'CONCLUÍDO'
}

export enum UrgencyLevel {
  LOW = 'BAIXA',
  MEDIUM = 'MÉDIA',
  HIGH = 'ALTA',
  CRITICAL = 'CRÍTICA'
}

export interface ActionItem {
  id: string;
  what: string;
  why: string;
  where: string;
  when: string;
  who: string;
  how: string;
  status: ItemStatus;
  urgency: UrgencyLevel;
  notes: string;
  homologationActions?: string;
  /** Momento em que a iniciativa foi marcada como BLOQUEADA (se aplicável) */
  blockedAt?: number;
  createdAt: number;
  updatedAt: number;
  /** Empresa / workspace ao qual esta iniciativa pertence (opcional para compatibilidade legada) */
  empresa?: string;
}

// ========== Ritmo de Gestão – entidades e enums ==========

export type StatusBacklog = 'aberto' | 'analisado' | 'descartado' | 'promovido';

export type StatusPrioridade = 'Execucao' | 'Bloqueado' | 'Concluido';

export type StatusPlano = 'Execucao' | 'Bloqueado' | 'Concluido';

export type StatusTarefa = 'Pendente' | 'EmExecucao' | 'Bloqueada' | 'Concluida';

/** Responsável / dono (prioridade, plano ou tarefa) */
export interface Responsavel {
  id: string;
  nome: string;
}

/** Backlog: repositório de demandas potenciais. Não representa compromisso ativo. */
export interface Backlog {
  id: string;
  titulo: string;
  descricao: string;
  origem: string; // cliente, interno, parceiro etc.
  data_criacao: number;
  prioridade_sugerida?: UrgencyLevel;
  status_backlog: StatusBacklog;
  /** Empresa / workspace à qual esta dor pertence (opcional) */
  empresa?: string;
}

/** Prioridade ativa (nível estratégico). Máx 3 ativas por quadro. */
export interface Prioridade {
  id: string;
  titulo: string;
  descricao: string;
  dono_id: string;
  data_inicio: number;
  data_alvo: number;
  status_prioridade: StatusPrioridade;
  origem_backlog_id?: string;
  /** Empresa / workspace dono desta prioridade (opcional) */
  empresa?: string;
}

/** Plano de ataque (nível gerencial). 5W2H completo. */
export interface PlanoDeAtaque {
  id: string;
  prioridade_id: string;
  titulo: string;
  what: string;
  why: string;
  who_id: string;
  where?: string;
  when_inicio: number;
  when_fim: number;
  how: string;
  how_much?: string;
  status_plano: StatusPlano;
  /** Empresa / workspace associada a este plano (opcional) */
  empresa?: string;
}

/** Tarefa (nível operacional). Materialização do plano. */
export interface Tarefa {
  id: string;
  plano_id: string;
  titulo: string;
  descricao: string;
  responsavel_id: string;
  data_inicio: number;
  data_vencimento: number;
  status_tarefa: StatusTarefa;
  bloqueio_motivo?: string;
  /** Empresa / workspace associada a esta tarefa (opcional) */
  empresa?: string;
}

/** Payload único do board Ritmo de Gestão (persistência) */
export interface RitmoGestaoBoard {
  backlog: Backlog[];
  prioridades: Prioridade[];
  planos: PlanoDeAtaque[];
  tarefas: Tarefa[];
  responsaveis: Responsavel[];
  /** Empresas / workspaces cadastrados no board */
  empresas: string[];
}

export interface UserSession {
  isAuthenticated: boolean;
  user: string | null;
}
