// ----- Legado (usado apenas na migração items → prioridades) -----
export enum ItemStatus {
  ACTIVE = 'PRIORIDADE ATIVA',
  EXECUTING = 'EM EXECUÇÃO',
  BLOCKED = 'BLOQUEADO',
  COMPLETED = 'CONCLUÍDO',
}

export enum UrgencyLevel {
  LOW = 'BAIXA',
  MEDIUM = 'MÉDIA',
  HIGH = 'ALTA',
  CRITICAL = 'CRÍTICA',
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
  createdAt: number;
  updatedAt: number;
}

// ----- Fase 1: Ritmo de Gestão — Backlog e Prioridade -----

export enum BacklogStatus {
  ABERTO = 'aberto',
  ANALISADO = 'analisado',
  DESCARTADO = 'descartado',
  PROMOVIDO = 'promovido',
}

export interface BacklogItem {
  id: string;
  titulo: string;
  descricao: string;
  origem: string;
  data_criacao: number;
  prioridade_sugerida?: string;
  status_backlog: BacklogStatus;
  /** Preenchido quando status_backlog === PROMOVIDO */
  prioridade_id?: string;
}

export enum PrioridadeStatus {
  EXECUCAO = 'Em Execução',
  BLOQUEADO = 'Bloqueado',
  CONCLUIDO = 'Concluído',
}

export interface Prioridade {
  id: string;
  titulo: string;
  descricao: string;
  dono_id: string;
  data_inicio: string;
  data_alvo: string;
  status_prioridade: PrioridadeStatus;
  origem_backlog_id?: string;
  createdAt: number;
  updatedAt: number;
}

// ----- Fase 2: Plano de Ataque (nível gerencial) e Tarefa (nível operacional) -----

export enum StatusPlano {
  EXECUCAO = 'Em Execução',
  BLOQUEADO = 'Bloqueado',
  CONCLUIDO = 'Concluído',
}

export interface PlanoDeAtaque {
  id: string;
  prioridade_id: string;
  titulo: string;
  what: string;
  why: string;
  who_id: string;
  where?: string;
  when_inicio: string;
  when_fim: string;
  how: string;
  how_much?: string;
  status_plano: StatusPlano;
  createdAt: number;
  updatedAt: number;
}

export enum StatusTarefa {
  PENDENTE = 'Pendente',
  EM_EXECUCAO = 'Em Execução',
  BLOQUEADA = 'Bloqueada',
  CONCLUIDA = 'Concluída',
}

export interface Tarefa {
  id: string;
  plano_id: string;
  titulo: string;
  descricao: string;
  responsavel_id: string;
  data_inicio: string;
  data_vencimento: string;
  status_tarefa: StatusTarefa;
  bloqueio_motivo?: string;
  createdAt: number;
  updatedAt: number;
}

export interface UserSession {
  isAuthenticated: boolean;
  user: string | null;
}
