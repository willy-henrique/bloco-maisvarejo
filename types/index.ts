// ========== Legado (Matriz 5W2H / iniciativas) – manter para compatibilidade ==========
export enum ItemStatus {
  BACKLOG = 'EM DEMANDA',
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
  /** Link externo opcional (ex.: Google Docs) para contextualizar a iniciativa. */
  link?: string;
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
  /** Usuário que criou o registro (uid/nome), usado para visibilidade. */
  created_by?: string;
}

export type ObserverRole = 'creator' | 'follower';

export interface Observer {
  user_id: string;
  role: ObserverRole;
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
  /** Usuário que criou o registro (uid/nome), usado para visibilidade. */
  created_by: string;
  /** Usuários que acompanham o item sem assumir ownership. */
  observadores?: Observer[];
  /** Workspace atual do registro. */
  workspace_id?: string;
  /** Workspace de origem quando houver colaboração cruzada. */
  workspace_origem?: string;
}

export type AgendaStatus = 'pendente' | 'em_andamento' | 'concluido';

export interface AgendaMember {
  uid: string;
  nome: string;
  email: string;
}

/** Item de agenda pessoal do usuário. */
export interface AgendaItem {
  id: string;
  titulo: string;
  descricao?: string;
  data_hora: number;
  status: AgendaStatus;
  created_at: number;
  participantes?: AgendaMember[];
}

/** Priorizar (nível estratégico). Máx 3 priorizadas por quadro. */
export interface Prioridade {
  id: string;
  titulo: string;
  descricao: string;
  /** Link externo opcional (ex.: Google Docs / Drive) associado a esta prioridade. */
  link?: string;
  dono_id: string;
  data_inicio: number;
  data_alvo: number;
  status_prioridade: StatusPrioridade;
  origem_backlog_id?: string;
  /** Empresa / workspace associada a esta prioridade (opcional) */
  empresa?: string;
  /** Última alteração de dono (ms); usado para não sobrescrever troca local com snapshot atrasado do Firestore */
  dono_atualizado_em?: number;
  /** Usuário que criou o registro (uid/nome), usado para visibilidade. */
  created_by: string;
  /** Usuários que acompanham o item sem assumir ownership. */
  observadores?: Observer[];
  /** Workspace atual do registro. */
  workspace_id?: string;
  /** Workspace de origem quando houver colaboração cruzada. */
  workspace_origem?: string;
}

/** Plano de ação (nível gerencial). 5W2H completo. */
export interface PlanoDeAcao {
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
  /** Link externo opcional (ex.: Google Drive / Docs) associado a este plano. */
  link?: string;
  status_plano: StatusPlano;
  /** Empresa / workspace associada a este plano (opcional) */
  empresa?: string;
  /** Usuário que criou o registro (uid/nome), usado para visibilidade. */
  created_by: string;
  /** Usuários que acompanham o item sem assumir ownership. */
  observadores?: Observer[];
  /** Workspace atual do registro. */
  workspace_id?: string;
  /** Workspace de origem quando houver colaboração cruzada. */
  workspace_origem?: string;
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
  /** Momento em que a tarefa foi marcada como bloqueada. */
  bloqueada_em?: number;
  /** Momento em que a tarefa foi marcada como Concluida. */
  data_conclusao?: number;
  /** Empresa / workspace associada a esta tarefa (opcional) */
  empresa?: string;
  /** Usuário que criou o registro (uid/nome), usado para visibilidade. */
  created_by: string;
  /** Usuários que acompanham o item sem assumir ownership. */
  observadores?: Observer[];
  /** Workspace atual do registro. */
  workspace_id?: string;
  /** Workspace de origem quando houver colaboração cruzada. */
  workspace_origem?: string;
}

/** Payload único do board Ritmo de Gestão (persistência) */
export interface RitmoGestaoBoard {
  backlog: Backlog[];
  prioridades: Prioridade[];
  planos: PlanoDeAcao[];
  tarefas: Tarefa[];
  responsaveis: Responsavel[];
  /** Empresas / workspaces cadastrados no board */
  empresas: string[];
}

export interface UserSession {
  isAuthenticated: boolean;
  user: string | null;
}
