import type { ViewId } from '../components/Layout/Sidebar';

export type UserRole = 'administrador' | 'gerente' | 'usuario';

export interface UserProfile {
  uid: string;
  email: string;
  nome: string;
  role: UserRole;
  views: ViewId[];
  empresas: string[];
  ativo: boolean;
  criadoEm: number;
  criadoPor: string;
}
