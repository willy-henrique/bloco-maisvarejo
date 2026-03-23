import type { ViewId } from '../components/Layout/Sidebar';
import type { ModulePermissionMap } from './modulePermissions';

export type UserRole = 'administrador' | 'gerente' | 'usuario';

export interface UserProfile {
  uid: string;
  email: string;
  nome: string;
  role: UserRole;
  views: ViewId[];
  /** Permissões por módulo (gerente/usuário). Legado: ausente = todas as ações. */
  modulePermissions?: ModulePermissionMap;
  empresas: string[];
  ativo: boolean;
  criadoEm: number;
  criadoPor: string;
}
