
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
  createdAt: number;
  updatedAt: number;
}

export interface UserSession {
  isAuthenticated: boolean;
  user: string | null;
}
